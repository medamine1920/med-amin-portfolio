import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './assistant.css';
import { api } from '../api.js';
import Avatar from './Avatar.jsx';

const initials = name => (name || 'AI').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
// "Med Amin Gnichi" → "Med Amin" (first two words, as on the rest of the site).
const firstName = brand => (brand || '').split(/\s+/).filter(Boolean).slice(0, 2).join(' ') || 'him';
const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const newId = () => (globalThis.crypto?.randomUUID?.() || `c-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`);

// Per-tab memory, so a reload or a jump to a project keeps the conversation. Storage may be unavailable.
const store = {
  get(key, fallback) { try { return JSON.parse(sessionStorage.getItem(key)) ?? fallback; } catch { return fallback; } },
  set(key, value) { try { sessionStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode */ } },
};

const THINKING = ['Reading the résumé…', 'Checking the projects…', 'Asking the semantic layer…', 'Gathering the facts…'];

// Questions that fit what the visitor is looking at right now.
function sectionQuestions(section, data, base) {
  const first = firstName(data.brand);
  const top = data.projects?.find(p => p.featured) || data.projects?.[0];
  switch (section) {
    case 'work': return ['Which project should I look at first?', top && `What did ${top.name} achieve?`, `How does ${first} test his AI systems?`];
    case 'approach': return ['How does he make sure answers are correct?', 'What does “code computes every number” mean?', 'How does he evaluate LLM systems?'];
    case 'experience': return ['What is his most recent role?', 'Which tools does he use every day?', 'What did he do before AI engineering?'];
    case 'contact': return [`Is ${first} open to new roles?`, 'How fast does he usually reply?', 'Can I set up a call with him?'];
    default: return base;
  }
}

function useActiveSection() {
  const [section, setSection] = useState('top');
  useEffect(() => {
    if (!('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver(entries => { for (const e of entries) if (e.isIntersecting) setSection(e.target.id); }, { rootMargin: '-45% 0px -50% 0px' });
    ['top', 'work', 'approach', 'experience', 'contact'].forEach(id => { const el = document.getElementById(id); if (el) io.observe(el); });
    return () => io.disconnect();
  }, []);
  return section;
}

// Renders the assistant's light markdown safely: **bold**, "- " bullets, and links only to sections on this
// page or to sites already linked from the portfolio. Never uses innerHTML.
function Rich({ text, hosts, onNavigate }) {
  const inline = (line, key) => line.split(/(\*\*[^*]+\*\*|\[[^\]]+\]\([^)\s]+\))/g).filter(Boolean).map((part, i) => {
    const k = key + '-' + i;
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={k}>{part.slice(2, -2)}</strong>;
    const m = part.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/);
    if (!m) return part;
    const [, label, href] = m;
    if (/^#[a-z0-9-]+$/i.test(href)) return <a key={k} href={href} className="ai-jump" onClick={onNavigate}>{label}</a>;
    try {
      const u = new URL(href);
      if (u.protocol === 'https:' && hosts.has(u.hostname.replace(/^www\./, ''))) return <a key={k} href={u.href} target="_blank" rel="noopener noreferrer">{label}<span aria-hidden="true"> ↗</span></a>;
    } catch { /* not a URL */ }
    return label;
  });
  const blocks = [];
  let list = null;
  text.split('\n').forEach((raw, i) => {
    const line = raw.trimEnd();
    const bullet = line.match(/^\s*[-•*]\s+(.*)$/);
    if (bullet) { if (!list) { list = []; blocks.push(<ul key={'ul' + i}>{list}</ul>); } list.push(<li key={i}>{inline(bullet[1], 'l' + i)}</li>); return; }
    list = null;
    if (line.trim()) blocks.push(<p key={i}>{inline(line, 'p' + i)}</p>);
  });
  return blocks;
}

export default function Assistant({ data, config }) {
  const first = firstName(data.brand);
  const section = useActiveSection();
  const saved = store.get('ai-chat', null);
  const [conversation] = useState(() => saved?.id || newId());
  const [messages, setMessages] = useState(() => saved?.messages || []);
  const [open, setOpen] = useState(false);
  const [teaser, setTeaser] = useState(false);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [thinking, setThinking] = useState(THINKING[0]);
  const [handoff, setHandoff] = useState(null);
  const showAvatar = config.avatar !== false;
  const panel = useRef(null), field = useRef(null), launcher = useRef(null), log = useRef(null), abort = useRef(null);

  const hosts = useMemo(() => {
    const set = new Set(['github.com', 'linkedin.com']);
    const add = url => { try { set.add(new URL(url).hostname.replace(/^www\./, '')); } catch { /* skip */ } };
    [data.linkedin, data.github, ...(data.otherLinks || []).map(l => l.url), ...(data.projects || []).flatMap(p => [p.repo, p.link])].forEach(u => u && add(u));
    return set;
  }, [data]);

  useEffect(() => { store.set('ai-chat', { id: conversation, messages: messages.filter(m => !m.pending) }); }, [conversation, messages]);

  // Attract attention once per visit: a teaser bubble after a few seconds, unless they already opened the chat.
  useEffect(() => {
    if (showAvatar || store.get('ai-teased', false) || messages.length) return;
    const t = setTimeout(() => { setTeaser(true); store.set('ai-teased', true); }, 5000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { if (open) { setTeaser(false); requestAnimationFrame(() => field.current?.focus()); } }, [open]);
  useEffect(() => { log.current?.scrollTo({ top: log.current.scrollHeight, behavior: reduced() ? 'auto' : 'smooth' }); }, [messages, open, handoff]);
  useEffect(() => {
    if (!open) return;
    const onKey = e => { if (e.key === 'Escape') { setOpen(false); focusLauncher(); } };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [open]);
  useEffect(() => {
    if (!busy) return;
    let i = 0;
    const t = setInterval(() => { i = (i + 1) % THINKING.length; setThinking(THINKING[i]); }, 1600);
    return () => clearInterval(t);
  }, [busy]);
  useEffect(() => () => abort.current?.abort(), []);

  const asked = new Set(messages.filter(m => m.role === 'user').map(m => m.content));
  const chips = sectionQuestions(section, data, config.suggestions).filter(q => q && !asked.has(q)).slice(0, 3);

  const send = useCallback(async (text, base) => {
    const question = (text || '').trim().slice(0, 600);
    if (!question || busy) return;
    setOpen(true); setInput(''); setHandoff(null); setBusy(true); setThinking(THINKING[0]);
    const history = [...(base ?? messages).filter(m => !m.pending && !m.error && !m.local), { role: 'user', content: question }];
    setMessages([...history, { role: 'assistant', content: '', pending: true }]);
    const update = fn => setMessages(ms => { const copy = ms.slice(); copy[copy.length - 1] = fn(copy[copy.length - 1]); return copy; });
    const controller = new AbortController(); abort.current = controller;
    try {
      const res = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ conversation, messages: history.slice(-12).map(({ role, content }) => ({ role, content })) }), signal: controller.signal });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw Error(e.error || 'The assistant is unavailable right now.'); }
      const reader = res.body.getReader(), decoder = new TextDecoder();
      let buffer = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let nl;
        while ((nl = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, nl); buffer = buffer.slice(nl + 1);
          if (!line) continue;
          const ev = JSON.parse(line);
          if (ev.t === 'd') update(m => ({ ...m, content: m.content + ev.v }));
          else if (ev.t === 'error') throw Error(ev.v);
        }
      }
      update(m => ({ role: 'assistant', content: m.content || 'Hmm, I lost my train of thought. Could you ask that again?' }));
    } catch (err) {
      if (err.name === 'AbortError') return;
      update(() => ({ role: 'assistant', content: err.message, error: true }));
    } finally {
      setBusy(false); abort.current = null;
    }
  }, [busy, conversation, messages]);

  const reset = () => { abort.current?.abort(); setMessages([]); setHandoff(null); setBusy(false); store.set('ai-chat', null); };
  // Return focus to whatever opens the chat: the avatar, or the round launcher when the avatar is off.
  function focusLauncher() { requestAnimationFrame(() => (launcher.current?.offsetParent ? launcher.current : document.querySelector('.av-hit'))?.focus()); }
  const close = () => { setOpen(false); focusLauncher(); };
  const onNavigate = () => { if (matchMedia('(max-width: 640px)').matches) setOpen(false); };
  const lastQuestion = [...messages].reverse().find(m => m.role === 'user')?.content;
  const startHandoff = () => setHandoff({ name: '', email: '', message: `Hi ${first}, I was chatting with your assistant${lastQuestion ? ` about: “${lastQuestion}”` : ''}.\n\n`, website: '', status: 'idle', error: '' });

  async function submitHandoff(e) {
    e.preventDefault();
    setHandoff(h => ({ ...h, status: 'sending', error: '' }));
    try {
      await api('/api/contact', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: handoff.name, email: handoff.email, message: handoff.message, website: handoff.website }) });
      setHandoff(null);
      setMessages(ms => [...ms, { role: 'assistant', content: `Sent! ✅ ${first} gets your message right away and will reply by email.`, local: true }]);
    } catch (err) { setHandoff(h => ({ ...h, status: 'idle', error: err.message })); }
  }

  const avatar = data.portrait
    ? <img src={data.portrait} alt="" className="ai-avatar-img" />
    : <span className="ai-avatar-initials">{initials(data.brand)}</span>;

  return (
    <div className={'ai' + (open ? ' is-open' : '')}>
      {showAvatar && <Avatar data={data} first={first} name={config.name} initials={initials(data.brand)} open={open} mood={busy ? (messages.at(-1)?.content ? 'talking' : 'thinking') : 'listening'} questions={chips} onOpen={() => setOpen(true)} onAsk={q => send(q)} />}
      {teaser && !open && !showAvatar && (
        <div className="ai-teaser" role="status">
          <button type="button" className="ai-teaser-close" onClick={() => setTeaser(false)} aria-label="Dismiss">×</button>
          <p><span className="ai-wave" aria-hidden="true">👋</span> Hi, I'm {config.name}. Hiring? I can tell you about {first} in 30 seconds.</p>
          <div className="ai-chips">{chips.slice(0, 2).map(q => <button type="button" key={q} onClick={() => send(q)}>{q}</button>)}</div>
        </div>
      )}

      <button type="button" ref={launcher} className={'ai-launcher' + (showAvatar ? ' is-avatar' : '')} aria-expanded={open} aria-controls="ai-panel" onClick={() => (open ? close() : setOpen(true))}>
        <span className="ai-avatar">{avatar}<i className="ai-online" aria-hidden="true" /></span>
        <span className="ai-launcher-text"><b>{open ? 'Close chat' : `Ask ${config.name}`}</b>{!open && <small>Replies in seconds</small>}</span>
      </button>

      <section id="ai-panel" ref={panel} className={"ai-panel" + (busy ? " is-busy" : "")} role="dialog" aria-label={config.name} hidden={!open}>
        <header className="ai-head">
          <span className="ai-avatar">{avatar}<i className="ai-online" aria-hidden="true" /></span>
          <div className="ai-title"><b>{config.name}</b><small>{config.demo ? 'Demo mode · canned answers' : `${first}'s AI assistant`}</small></div>
          {messages.length > 0 && <button type="button" className="ai-icon" onClick={reset} aria-label="Start a new conversation" title="New conversation">↺</button>}
          <button type="button" className="ai-icon" onClick={close} aria-label="Close chat">×</button>
        </header>

        <div className="ai-log" ref={log} role="log" aria-live="polite" aria-busy={busy}>
          <div className="ai-msg is-assistant"><Rich text={config.greeting} hosts={hosts} onNavigate={onNavigate} /></div>
          {messages.map((m, i) => (
            <div key={i} className={'ai-msg ' + (m.role === 'user' ? 'is-user' : 'is-assistant') + (m.error ? ' is-error' : '')}>
              {m.pending && !m.content
                ? <span className="ai-typing"><i /><i /><i /><span>{thinking}</span></span>
                : m.role === 'user' ? <p>{m.content}</p> : <Rich text={m.content} hosts={hosts} onNavigate={onNavigate} />}
              {m.error && <button type="button" className="ai-retry" onClick={() => send(lastQuestion, messages.slice(0, -2))}>Try again</button>}
            </div>
          ))}
          {handoff && (
            <form className="ai-handoff" onSubmit={submitHandoff}>
              <p className="ai-handoff-title">Message {first} directly</p>
              <input required maxLength="120" autoComplete="name" placeholder="Your name" aria-label="Your name" value={handoff.name} onChange={e => setHandoff({ ...handoff, name: e.target.value })} />
              <input required type="email" maxLength="254" autoComplete="email" placeholder="Your email" aria-label="Your email" value={handoff.email} onChange={e => setHandoff({ ...handoff, email: e.target.value })} />
              <textarea required minLength="10" maxLength="3000" rows="4" aria-label="Message" value={handoff.message} onChange={e => setHandoff({ ...handoff, message: e.target.value })} />
              <input className="ai-hp" tabIndex="-1" autoComplete="off" aria-hidden="true" value={handoff.website} onChange={e => setHandoff({ ...handoff, website: e.target.value })} />
              {handoff.error && <p className="ai-handoff-error" role="alert">{handoff.error}</p>}
              <div className="ai-handoff-actions">
                <button type="button" className="ai-ghost" onClick={() => setHandoff(null)}>Cancel</button>
                <button className="ai-primary" disabled={handoff.status === 'sending'}>{handoff.status === 'sending' ? 'Sending…' : 'Send to ' + first}</button>
              </div>
            </form>
          )}
        </div>

        {!busy && !handoff && chips.length > 0 && <div className="ai-chips ai-chips-bar">{chips.map(q => <button type="button" key={q} onClick={() => send(q)}>{q}</button>)}</div>}

        <form className="ai-input" onSubmit={e => { e.preventDefault(); send(input); }}>
          <textarea ref={field} rows="1" maxLength="600" placeholder={`Ask about ${first}'s projects, skills, availability…`} aria-label="Your question" value={input}
            onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); } }} />
          <button className="ai-send" disabled={busy || !input.trim()} aria-label="Send">↑</button>
        </form>
        <footer className="ai-foot">
          {!handoff && <button type="button" className="ai-link" onClick={startHandoff}>✉ Leave a message for {first}</button>}
          <small>AI can make mistakes. Chats are saved so {first} can follow up.</small>
        </footer>
      </section>
    </div>
  );
}
