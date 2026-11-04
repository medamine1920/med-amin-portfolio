// Telegram notifications: new contact messages, new visitors and a daily digest.
// Configured only through environment variables; without a token and chat id
// every function here is a no-op, so the site works the same without Telegram.
import { createHmac, randomBytes } from 'node:crypto';

const token = process.env.TELEGRAM_BOT_TOKEN || '';
const chatId = process.env.TELEGRAM_CHAT_ID || '';
const apiBase = (process.env.TELEGRAM_API_BASE || 'https://api.telegram.org').replace(/\/$/, '');
const visitMode = ['each', 'digest', 'off'].includes(process.env.TELEGRAM_VISITS) ? process.env.TELEGRAM_VISITS : 'each';
const digestHour = Math.min(23, Math.max(0, Number.parseInt(process.env.TELEGRAM_DIGEST_HOUR ?? '20', 10) || 0));
const siteName = process.env.SITE_NAME || 'medamine.work';

export const telegramEnabled = Boolean(token && chatId);
export const notifySettings = { enabled: telegramEnabled, visits: visitMode, digestHourUtc: digestHour };

const clip = (s, n) => { s = String(s ?? '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };

// Sends plain text (no parse_mode), so visitor-supplied text can never inject formatting or links.
export async function sendTelegram(text) {
  if (!telegramEnabled) return { ok: false, reason: 'not-configured' };
  try {
    const res = await fetch(`${apiBase}/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: clip(text, 3900), disable_web_page_preview: true }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) { console.error('Telegram notification failed with status', res.status); return { ok: false, reason: 'status-' + res.status }; }
    return { ok: true };
  } catch (err) {
    console.error('Telegram notification failed:', err.name === 'TimeoutError' ? 'timeout' : err.message);
    return { ok: false, reason: 'network' };
  }
}

export function notifyMessage({ name, email, message }) {
  return sendTelegram(`📬 New message on ${siteName}\n\nFrom: ${clip(name, 120)} <${clip(email, 254)}>\n\n${clip(message, 1500)}\n\nReply from your inbox at /admin → Inbox.`);
}

// ---- Visits -------------------------------------------------------------

// Link-preview fetchers are matched by their bot names only (TelegramBot, Discordbot, Slackbot, WhatsApp/x.y),
// so real people opening the link in the Telegram, Discord or Slack in-app browsers are still counted.
const BOT = /bot\b|bot\/|crawl|spider|slurp|headless|lighthouse|pingdom|uptime|monitor|curl|wget|python|httpclient|axios|node-fetch|go-http|java\/|facebookexternalhit|embedly|^whatsapp\/|slack-imgproxy|skypeuripreview|bingpreview/i;
export const isBot = ua => !ua || BOT.test(ua);

export function device(ua = '') {
  const kind = /ipad|tablet/i.test(ua) ? 'Tablet' : /mobi|android|iphone/i.test(ua) ? 'Mobile' : 'Desktop';
  const browser = /edg\//i.test(ua) ? 'Edge' : /opr\//i.test(ua) ? 'Opera' : /firefox\//i.test(ua) ? 'Firefox' : /chrome\//i.test(ua) ? 'Chrome' : /safari\//i.test(ua) ? 'Safari' : 'Browser';
  const os = /windows/i.test(ua) ? 'Windows' : /iphone|ipad|ios/i.test(ua) ? 'iOS' : /android/i.test(ua) ? 'Android' : /mac os/i.test(ua) ? 'macOS' : /linux/i.test(ua) ? 'Linux' : '';
  return [kind, browser, os].filter(Boolean).join(' · ');
}

// Referrer reduced to its host, so query strings (which can carry personal data) are never stored.
export function referrerHost(value, ownHost) {
  try { const u = new URL(String(value || '')); if (!['http:', 'https:'].includes(u.protocol)) return ''; const h = u.hostname.replace(/^www\./, ''); return h === ownHost ? '' : h.slice(0, 120); } catch { return ''; }
}

// Visitor id = HMAC(secret + day, ip + user agent). No cookie, no stored IP, and ids from different
// days cannot be linked without the server secret. Deriving the daily key from SESSION_SECRET (instead of
// a random in-memory salt) keeps ids stable across restarts, so a redeploy does not re-alert today's visitors.
const visitorSecret = process.env.SESSION_SECRET || randomBytes(32).toString('hex');
export function visitorId(ip, ua, day) {
  const dayKey = createHmac('sha256', visitorSecret).update('visitor-day:' + day).digest();
  return createHmac('sha256', dayKey).update(`${ip}|${ua}`).digest('hex').slice(0, 24);
}

const sentPerHour = [];
function underHourlyCap(max = 30) {
  const t = Date.now();
  while (sentPerHour.length && t - sentPerHour[0] > 3600000) sentPerHour.shift();
  if (sentPerHour.length >= max) return false;
  sentPerHour.push(t);
  return true;
}

export function notifyVisit({ path, referrer, device: dev, country, todayCount }) {
  if (visitMode !== 'each' || !underHourlyCap()) return Promise.resolve({ ok: false, reason: 'skipped' });
  const from = referrer ? `from ${referrer}` : 'direct / unknown source';
  return sendTelegram(`👀 New visitor on ${siteName}${path && path !== '/' ? ' ' + clip(path, 80) : ''}\n${from}\n${dev}${country ? ' · ' + country : ''}\n\nVisitor #${todayCount} today.`);
}

// ---- Daily digest -------------------------------------------------------

export function startDigest(summary) {
  if (!telegramEnabled || visitMode === 'off') return () => {};
  let lastSent = '';
  const tick = async () => {
    const d = new Date();
    const day = d.toISOString().slice(0, 10);
    if (d.getUTCHours() !== digestHour || lastSent === day) return;
    lastSent = day;
    const s = summary(day);
    const refs = s.referrers.length ? s.referrers.map(r => `  ${r.host || 'direct'}: ${r.n}`).join('\n') : '  none';
    await sendTelegram(`📊 ${siteName} today\n\nVisitors: ${s.visitors}\nPage views: ${s.views}\nNew messages: ${s.messages}\n\nTop sources:\n${refs}`);
  };
  const timer = setInterval(tick, 5 * 60000);
  timer.unref();
  return () => clearInterval(timer);
}
