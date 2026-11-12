import React, { useEffect, useRef, useState } from 'react';
import './avatar.css';
import Torch from './Torch.jsx';

// Parker: a cartoon (Bitmoji-style) version of the portfolio owner. One behaviour controller decides what he
// does; see "Behaviour" below. He never scrolls, navigates, clicks, opens the chat or changes the theme on his
// own: the page only moves when the visitor presses a tour button. Drawing: 160x270 SVG units, floor y=262.

const VB_W = 160, VB_H = 270;
const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const phone = () => typeof matchMedia === 'function' && matchMedia('(max-width: 640px)').matches;
const pick = list => list[Math.floor(Math.random() * list.length)];
const vw = () => document.documentElement.clientWidth;

const SECTION_LABEL = { top: 'the introduction', proof: 'the highlights', work: 'the projects', approach: 'how he works', experience: 'his experience', contact: 'the contact section' };
const FIT = ['Do I meet the requirements? 😄', 'So… do I meet the requirements? 😄'];

// The guided tour, in page order. Only the visitor's clicks advance it.
function tourSteps(data, first) {
  const stat = data.stats?.[0], recent = data.experience?.[0], top = data.projects?.find(p => p.featured) || data.projects?.[0];
  return [
    { sel: '#top', pose: 'wave', text: `Let's start at the top: ${first} builds AI systems people can trust, with evaluation and real workflows behind them.` },
    stat && { sel: '.proof', pose: 'point', text: `The highlights: ${stat.value} ${stat.label}. Measured, not guessed.` },
    top && { sel: '#work', pose: 'present', text: `The projects. ${top.name} is the star${top.result ? `: ${top.result}` : ''}. Every card opens into the full story.` },
    { sel: '#approach', pose: 'think', text: `How ${first} works: prepare the data, find the evidence, let code compute, then evaluate everything.` },
    { sel: '#experience', pose: 'thumbs', text: recent ? `Where he's done it for real. Most recently ${recent.role} at ${recent.company}.` : `Where he's done it for real.` },
    { sel: '#contact', pose: 'present', text: `Last stop! A message here reaches ${first} in seconds.` },
  ].filter(s => s && document.querySelector(s.sel));
}

// Which section is in view: used only to aim the torch, never to make Parker speak or move.
function useSection() {
  const [section, setSection] = useState('top');
  useEffect(() => {
    if (!('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver(entries => {
      for (const e of entries) if (e.isIntersecting) setSection(e.target.id || (e.target.classList.contains('proof') ? 'proof' : ''));
    }, { rootMargin: '-40% 0px -55% 0px' });
    ['#top', '.proof', '#work', '#approach', '#experience', '#contact'].forEach(sel => { const el = document.querySelector(sel); if (el) io.observe(el); });
    return () => io.disconnect();
  }, []);
  return section;
}

// What the visitor is looking at when Parker first greets them (deep link, restored scroll, or the top).
function arrivalContext() {
  const hash = decodeURIComponent(location.hash.slice(1));
  if (hash.startsWith('project-') && document.getElementById(hash)) return { kind: 'project' };
  if (hash && SECTION_LABEL[hash]) return { kind: 'section', label: SECTION_LABEL[hash] };
  if (scrollY > 200) return { kind: 'restored' };
  return { kind: 'top' };
}

// The stool stays anchored at Parker's home spot, even when he steps aside for the chat.
function Seat({ x }) {
  return (
    <svg className="av-seat" viewBox={`0 0 ${VB_W} ${VB_H}`} aria-hidden="true" style={{ transform: `translate3d(${Math.round(x)}px,0,0)` }}>
      <g className="av-stool"><rect x="50" y="206" width="8" height="56" rx="2" /><rect x="102" y="206" width="8" height="56" rx="2" /><rect x="54" y="236" width="52" height="5" rx="2" /><rect className="av-stool-seat" x="44" y="198" width="72" height="12" rx="3" /></g>
    </svg>
  );
}

function Character({ pose, motion, mood, faceLeft, look, svgRef, torch }) {
  return (
    <svg ref={svgRef} className={`av-svg pose-${pose} mood-${mood} ${motion} ${faceLeft ? 'face-left' : ''} ${torch}`} viewBox={`0 0 ${VB_W} ${VB_H}`} aria-hidden="true"
      style={{ '--lx': look[0], '--ly': look[1] }}>
      <ellipse className="av-shadow" cx="80" cy="262" rx="34" ry="5.5" />
      <g className="av-body">
        {/* legs: thigh pivots at the hip, shin at the knee */}
        <g className="av-thigh av-thigh-l"><rect x="61" y="170" width="16" height="44" rx="8" className="av-trousers" />
          <g className="av-shin av-shin-l"><rect x="62" y="206" width="14" height="42" rx="7" className="av-trousers" /><path className="av-shoe" d="M58 246 Q58 240 66 240 L72 240 Q78 241 78 247 L78 252 Q78 256 72 256 L56 256 Q50 256 51 252 Q52 248 58 246 Z" /></g></g>
        <g className="av-thigh av-thigh-r"><rect x="83" y="170" width="16" height="44" rx="8" className="av-trousers" />
          <g className="av-shin av-shin-r"><rect x="84" y="206" width="14" height="42" rx="7" className="av-trousers" /><path className="av-shoe" d="M102 246 Q102 240 94 240 L88 240 Q82 241 82 247 L82 252 Q82 256 88 256 L104 256 Q110 256 109 252 Q108 248 102 246 Z" /></g></g>
        {/* torso: open charcoal blazer over a black turtleneck */}
        <path className="av-turtle" d="M66 100 L94 100 L92 182 L68 182 Z" />
        <path className="av-blazer" d="M50 114 Q51 104 64 101 L71 100 L74 182 L57 182 Q47 182 47 172 Z M110 114 Q109 104 96 101 L89 100 L86 182 L103 182 Q113 182 113 172 Z" />
        <path className="av-lapel" d="M70 101 L76 140 L62 112 Z M90 101 L84 140 L98 112 Z" />
        <g className="av-pin"><rect x="94" y="124" width="15" height="7" rx="2" /><text x="101.5" y="129.3">HIRE ME</text></g>
        {/* arms: upper arm pivots at the shoulder, forearm at the elbow */}
        <g className="av-arm av-arm-l"><rect x="45" y="106" width="18" height="38" rx="9" className="av-sleeve" />
          <g className="av-fore av-fore-l"><rect x="46" y="136" width="16" height="34" rx="8" className="av-sleeve" />
            {/* Flashlight: grip at the hand centre (54,174), lens centre (54,150), lens edges x 44..64. Torch.jsx rotates it around the grip. */}
            <g className="av-torch" transform="rotate(180 54 174)"><rect className="av-torch-handle" x="50" y="157" width="8" height="21" rx="2.5" /><path className="av-torch-head" d="M44 150 L64 150 L60 158 L48 158 Z" /><ellipse className="av-torch-lens" cx="54" cy="150" rx="10" ry="2.2" /></g>
            <circle cx="54" cy="174" r="8" className="av-hand" /><ellipse className="av-thumb" cx="60" cy="168" rx="3" ry="5" /></g></g>
        <g className="av-arm av-arm-r"><rect x="97" y="106" width="18" height="38" rx="9" className="av-sleeve" />
          <g className="av-fore av-fore-r"><rect x="98" y="136" width="16" height="34" rx="8" className="av-sleeve" /><circle cx="106" cy="174" r="8" className="av-hand" /><ellipse className="av-thumb" cx="100" cy="166" rx="3" ry="5.5" /></g></g>
        {/* head */}
        <g className="av-head">
          <rect x="67" y="86" width="26" height="20" rx="9" className="av-collar" />
          <path className="av-collar-fold" d="M69 94 Q80 97 91 94 M69 99 Q80 102 91 99" />
          <ellipse cx="51" cy="62" rx="5.5" ry="8.5" className="av-skin" /><ellipse cx="109" cy="62" rx="5.5" ry="8.5" className="av-skin" />
          <path className="av-skin" d="M52 50 Q52 23 80 21 Q108 23 108 50 L108 64 Q106 86 80 94 Q54 86 52 64 Z" />
          <ellipse className="av-blush" cx="61" cy="72" rx="6" ry="3.5" /><ellipse className="av-blush" cx="99" cy="72" rx="6" ry="3.5" />
          <path className="av-hair" d="M50 58 Q45 30 62 19 Q76 9 94 13 Q112 18 112 42 Q112 52 110 58 Q107 44 100 39 Q90 32 75 34 Q60 37 54 48 Z" />
          <path className="av-hair" d="M60 23 Q76 3 99 13 Q90 15 83 22 Q74 18 60 23 Z" />
          <g className="av-brows"><path d="M59 49 Q66 43 75 47" /><path d="M85 47 Q94 43 101 49" /></g>
          <g className="av-eyes">
            <g className="av-eye"><ellipse cx="67" cy="58" rx="6.2" ry="4.8" className="av-eye-white" /><g className="av-iris"><circle cx="67.5" cy="58.5" r="3.5" fill="#3d2414" /><circle cx="67.5" cy="58.5" r="1.7" fill="#120a06" /><circle cx="68.8" cy="57.2" r="0.9" fill="#fff" /></g></g>
            <g className="av-eye"><ellipse cx="93" cy="58" rx="6.2" ry="4.8" className="av-eye-white" /><g className="av-iris"><circle cx="93.5" cy="58.5" r="3.5" fill="#3d2414" /><circle cx="93.5" cy="58.5" r="1.7" fill="#120a06" /><circle cx="94.8" cy="57.2" r="0.9" fill="#fff" /></g></g>
          </g>
          <path className="av-nose" d="M80 59 Q76.5 70 79 73 Q82 75 85 72" />
          <path className="av-beard" d="M68.5 79 Q74 75 80 77 Q86 75 91.5 79 Q86 80.5 80 79.8 Q74 80.5 68.5 79 Z" />
          <path className="av-mouth av-mouth-smile" d="M72 83.5 Q80 89 88 83.5" />
          <g className="av-mouth av-mouth-open"><path d="M71 82.5 Q80 96 89 82.5 Z" fill="#5a1f17" /><path d="M73 83.2 Q80 85 87 83.2 L86.4 85 Q80 86.4 73.6 85 Z" fill="#fff" /></g>
          <path className="av-mouth av-mouth-sad" d="M72.5 88 Q80 81.5 87.5 88" />
          <path className="av-tear" d="M61.5 63.5 Q58.8 69 61.5 70.6 Q64.2 69 61.5 63.5 Z" />
          <ellipse className="av-mouth av-mouth-talk" cx="80" cy="85" rx="4.5" ry="3.2" fill="#5a1f17" />
          <path className="av-beard" d="M72.5 88 Q80 101 87.5 88 Q84 93.5 80 94.5 Q76 93.5 72.5 88 Z M78.2 86.3 L81.8 86.3 L80 89.2 Z" />
        </g>
      </g>
      <g className="av-sparkles"><path d="M20 40 l3 8 8 3 -8 3 -3 8 -3 -8 -8 -3 8 -3z" /><path d="M140 30 l2 6 6 2 -6 2 -2 6 -2 -6 -6 -2 6 -2z" /><path d="M134 92 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2z" /></g>
    </svg>
  );
}

// ---- Birthday-party effects for the hiring celebration (decorative: no clicks, no focus, no sound) ----
const PARTY_COLORS = ['#9fe8c7', '#f3b766', '#ff8fa3', '#8fd3ff', '#c9a7ff', '#fff3a8'];
function Party({ still }) {
  const bits = useRef(null);
  if (!bits.current) {
    const r = (a, b) => a + Math.random() * (b - a);
    bits.current = {
      confetti: Array.from({ length: still ? 26 : 70 }, (_, i) => ({ x: r(0, 100), y: still ? r(4, 90) : 0, d: r(0, 0.9), t: r(2.2, 3.6), rot: r(-540, 540), drift: r(-12, 12), c: PARTY_COLORS[i % PARTY_COLORS.length], w: r(6, 11), round: i % 3 === 0 })),
      balloons: Array.from({ length: 5 }, (_, i) => ({ x: 8 + i * 20 + r(-4, 4), d: r(0, 0.6), t: r(3.4, 4.6), c: PARTY_COLORS[(i + 1) % PARTY_COLORS.length], y: still ? r(8, 40) : 0 })),
      streamers: Array.from({ length: 6 }, (_, i) => ({ x: 6 + i * 17 + r(-3, 3), d: r(0, 0.5), c: PARTY_COLORS[i % PARTY_COLORS.length] })),
      sparkles: Array.from({ length: 10 }, () => ({ x: r(5, 95), y: r(8, 70), d: r(0, 2) })),
    };
  }
  const b = bits.current;
  return (
    <div className={'party' + (still ? ' is-still' : '')} aria-hidden="true">
      {b.streamers.map((p, i) => <span key={'s' + i} className="party-streamer" style={{ left: p.x + '%', '--d': p.d + 's', '--c': p.c }} />)}
      {b.confetti.map((p, i) => <span key={'c' + i} className={'party-confetti' + (p.round ? ' is-round' : '')} style={{ left: p.x + '%', top: p.y + '%', width: p.w, height: p.round ? p.w : p.w * 0.45, '--d': p.d + 's', '--t': p.t + 's', '--rot': p.rot + 'deg', '--drift': p.drift + 'vw', '--c': p.c }} />)}
      {b.balloons.map((p, i) => <span key={'b' + i} className="party-balloon" style={{ left: p.x + '%', top: still ? p.y + '%' : undefined, '--d': p.d + 's', '--t': p.t + 's', '--c': p.c }} />)}
      {b.sparkles.map((p, i) => <span key={'k' + i} className="party-sparkle" style={{ left: p.x + '%', top: p.y + '%', '--d': p.d + 's' }}>✦</span>)}
    </div>
  );
}

// ---- Behaviour: one controller ----------------------------------------------------------------------
// Exactly one primary state owns Parker at a time:
//   seated → welcoming → idle ⇄ seated            (calm; nothing happens on its own after the welcome)
//   idle/seated/welcoming → touring               (only when the visitor clicks "Take the tour")
//   any → chatting                                (the visitor opened the chat)
//   chatting/any → celebrating → chatting | idle  (server-validated hiring interest)
// Every transition gets a new token and cancels the previous state's timers, animations and async steps;
// a step whose token is stale can never resume and overwrite the new state.
const PRIORITY = { seated: 0, idle: 0, welcoming: 1, touring: 2, chatting: 3, celebrating: 4 };

export default function Avatar({ data, first, name = 'Parker', theme = 'dark', hireSignal = 0, open, mood: chatMood, questions, onOpen, onAsk }) {
  const section = useSection();
  const wrap = useRef(null), svgRef = useRef(null);
  const pos = useRef({ x: 0, y: 0 });
  const ctl = useRef({ state: 'seated', token: 0, timers: new Set() });
  const [state, setState] = useState('seated');
  const [pose, setPose] = useState('sit');
  const [motion, setMotion] = useState('');            // walk | rise | crouch | air | land | ''
  const [dunking, setDunking] = useState(false);       // keeps his bubble on screen while he dunks its button
  const [mood, setMood] = useState('smile');
  const [faceLeft, setFaceLeft] = useState(true);
  const [look, setLook] = useState([0, 0]);
  const [bubble, setBubble] = useState(null);           // { text, kind }
  const [tourIndex, setTourIndex] = useState(-1);
  const [party, setParty] = useState(null);
  const [homeX, setHomeX] = useState(0);
  const steps = useRef(null);
  const scrollRaf = useRef(0), scrollGrab = useRef(null);
  useEffect(() => () => { cancelAnimationFrame(scrollRaf.current); scrollGrab.current?.(); }, []);
  const bubbleTimer = useRef(0), mouthTimer = useRef(0), lastSignal = useRef(hireSignal);
  const sitting = useRef(!reduced());            // is he on his stool right now (read inside async steps)
  const openRef = useRef(open); openRef.current = open;
  const sit = () => { sitting.current = true; setPose('sit'); setMood('smile'); };

  // ---- geometry ----
  const width = () => wrap.current?.offsetWidth || (phone() ? 84 : 120);
  const home = () => Math.max(4, vw() - width() - (phone() ? 6 : 16));
  const chatSpot = () => (phone() ? home() : Math.max(8, vw() - 420 - width()));
  const spotFor = s => (s === 'chatting' || (s === 'celebrating' && openRef.current) ? chatSpot() : home());
  const tr = (x, y) => `translate3d(${Math.round(x)}px,${Math.round(y)}px,0)`;
  const place = (x, y = 0) => { pos.current = { x, y }; if (wrap.current) wrap.current.style.transform = tr(x, y); };

  // ---- controller primitives ----
  const alive = tk => ctl.current.token === tk;
  function stopMotion() {
    // Freeze wherever an interrupted animation currently is (no snapping), then cancel it.
    const el = wrap.current;
    for (const a of el?.getAnimations() || []) {
      const m = new DOMMatrixReadOnly(getComputedStyle(el).transform);
      a.cancel(); place(m.m41, 0);
    }
    for (const a of el?.querySelector('.av-hit')?.getAnimations() || []) a.cancel();
  }
  function start(next) {
    const c = ctl.current;
    c.timers.forEach(clearTimeout); c.timers.clear();
    stopMotion(); setMotion(''); stopScroll(); setDunking(false);
    c.token += 1; c.state = next; setState(next);
    return c.token;
  }
  // Ask for a transition; refused if a higher-priority state is running (unless forced).
  function request(next, force = false) {
    if (!force && PRIORITY[next] < PRIORITY[ctl.current.state]) return 0;
    return start(next);
  }
  const after = (tk, ms, fn) => { const id = setTimeout(() => { ctl.current.timers.delete(id); if (alive(tk)) fn(); }, ms); ctl.current.timers.add(id); };
  const wait = (tk, ms) => new Promise(res => after(tk, ms, () => res(true)) || setTimeout(() => res(false), ms + 5));

  function speak(text, kind, hideMs = 0) {
    clearTimeout(bubbleTimer.current); clearTimeout(mouthTimer.current);
    setBubble({ text, kind });
    setMood(m => (m === 'sad' ? m : 'talk'));
    mouthTimer.current = setTimeout(() => setMood(m => (m === 'talk' ? 'smile' : m)), 1600);
    if (hideMs) bubbleTimer.current = setTimeout(() => setBubble(b => (b?.kind === kind ? null : b)), hideMs);
  }
  const hush = () => { clearTimeout(bubbleTimer.current); setBubble(null); };

  // Walk along the floor to x (never jumps, never leaves the viewport). Resolves false if interrupted.
  function walkTo(tk, x) {
    return new Promise(resolve => {
      const el = wrap.current, from = pos.current.x;
      x = Math.max(4, Math.min(vw() - width() - 4, x));
      if (!el || reduced() || Math.abs(x - from) < 4) { place(x); setFaceLeft(true); return resolve(true); }
      setFaceLeft(x < from); setMotion('walk');
      const a = el.animate([{ transform: tr(from, 0) }, { transform: tr(x, 0) }], { duration: Math.min(1600, Math.abs(x - from) * 5), easing: 'ease-in-out', fill: 'forwards' });
      a.onfinish = () => { if (!alive(tk)) return resolve(false); place(x); a.cancel(); setMotion(''); setFaceLeft(true); resolve(true); };
      a.oncancel = () => resolve(false);
    });
  }
  async function standUp(tk) {
    if (!sitting.current) return true;
    sitting.current = false; setPose('idle');
    if (reduced()) return true;
    setMotion('rise');
    const ok = await wait(tk, 420);
    if (alive(tk)) setMotion('');
    return ok;
  }

  // ---- states ----
  async function welcome() {
    const tk = request('welcoming'); if (!tk) return;
    const ctx = arrivalContext();
    const text = ctx.kind === 'project' ? `Welcome! 👋 I'm ${name}, ${first}'s AI sidekick. Great pick, this project is a good place to start. Ask me anything about it.`
      : ctx.kind === 'section' ? `Welcome! 👋 I'm ${name}, ${first}'s AI sidekick. You've landed on ${ctx.label}. Ask me anything, or take the tour.`
      : ctx.kind === 'restored' ? `Welcome back! 👋 I'm ${name}, ${first}'s AI sidekick. Pick up where you left off, take the tour, or ask me anything.`
      : `Welcome! 👋 I'm ${name}, ${first}'s AI sidekick. Make yourself at home—explore the projects, take a tour, or ask me anything.`;
    if (!reduced()) { setMood('surprised'); setLook([0, -0.6]); if (!(await wait(tk, 320))) return; }
    if (!(await standUp(tk))) return;
    setPose('wave'); speak(text, 'welcome', 9000); setMood('happy');
    after(tk, 2200, () => goIdle());
  }
  function goIdle() {
    const tk = request('idle', true); if (!tk) return;
    setPose('idle'); setMood(m => (m === 'talk' ? m : 'smile'));
    // Calm: after a long quiet spell he sits back down on his stool (only if he's at home).
    after(tk, 30000, () => { if (Math.abs(pos.current.x - home()) < 6 && request('seated')) sit(); });
  }
  async function wake(tk) { return standUp(tk); }

  // Clicking Parker: show what he can do. (Visitor-initiated; never moves the page.)
  function onPress() {
    if (ctl.current.state === 'touring' || ctl.current.state === 'celebrating') return;
    if (ctl.current.state === 'chatting') return onOpen();
    const tk = start('idle');
    wake(tk).then(ok => { if (!ok) return; setPose('wave'); speak(pick(['At your service! 😄 What shall we do?', 'Hey! Want the tour or a quick chat?']), 'menu'); goIdleKeepBubble(); });
  }
  function onDouble() {
    if (!['idle', 'seated', 'welcoming'].includes(ctl.current.state)) return;
    const tk = start('idle');
    wake(tk).then(ok => { if (!ok) return; setPose('happy'); speak(pick(FIT), 'fit'); setMood('happy'); hop(tk); goIdleKeepBubble(); });
  }
  function yes() {
    const tk = start('idle');
    setPose('happy'); setMood('happy'); hop(tk);
    speak(pick(['Knew it! 🥳 Let\'s make it official.', 'Yesss! You won\'t regret it. 🥳']), 'yes'); setMood('happy');
    goIdleKeepBubble();
  }
  // Return to idle without clearing the current bubble or pose.
  function goIdleKeepBubble() {
    after(ctl.current.token, 2500, () => { const t2 = start('idle'); setPose('idle'); after(t2, 30000, () => { if (Math.abs(pos.current.x - home()) < 6 && request('seated')) sit(); }); });
  }
  // A small in-place hop (no travel).
  function hop() {
    if (reduced()) return;
    wrap.current?.querySelector('.av-hit')?.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(-22px)' }, { transform: 'translateY(0)' }], { duration: 360, easing: 'ease-out' });
  }

  // A jump in place (squat, leap, land), only ever in answer to a visitor's click. Resolves false if interrupted.
  async function jump(tk, height = 100) {
    if (reduced()) return true;
    const hit = wrap.current?.querySelector('.av-hit');
    setMotion('crouch'); if (!(await wait(tk, 140))) return false;
    setMotion('air');
    hit?.animate([
      { transform: 'translateY(0)', easing: 'cubic-bezier(.2,.7,.4,1)' },
      { transform: `translateY(${-height}px)`, easing: 'cubic-bezier(.6,0,.8,.3)' },
      { transform: 'translateY(0)' },
    ], { duration: 580 });
    if (!(await wait(tk, 580))) return false;
    setMotion('land'); if (!(await wait(tk, 240))) return false;
    setMotion(''); return true;
  }
  function burst(r, text) {
    const s = document.createElement('span');
    s.className = 'av-burst'; s.textContent = text; s.setAttribute('aria-hidden', 'true');
    s.style.left = `${r.left + r.width / 2}px`; s.style.top = `${r.top}px`;
    (document.querySelector('.site') || document.body).append(s);
    setTimeout(() => s.remove(), 1000);
  }
  // The visitor clicked "Contact/Message" in his bubble: he leaps up and dunks that very button, lands back on his
  // spot, then the page glides to the contact section (what the visitor asked for).
  async function dunkContact(e) {
    e.preventDefault();
    const btn = e.currentTarget, target = document.querySelector('#contact');
    if (ctl.current.state === 'celebrating') setParty(null);       // the visitor moved on; wrap the party up
    const tk = start('idle');
    const go = () => { hush(); goIdle(); scrollToSection(target); };   // goIdle starts a new state, which stops scrolls
    const hit = wrap.current?.querySelector('.av-hit');
    if (reduced() || !hit) return go();
    setDunking(true);
    const b = btn.getBoundingClientRect(), h = hit.getBoundingClientRect();
    const dx = Math.max(-160, Math.min(160, b.left + b.width / 2 - (h.left + h.width / 2)));
    const dy = Math.max(-200, Math.min(-90, b.top - 30 - h.top));     // rise above the "rim", then slam down
    setFaceLeft(dx < 0); setPose('dunk'); setMood('happy');
    setMotion('crouch'); if (!(await wait(tk, 140))) return;
    setMotion('air');
    hit.animate([
      { transform: 'translate(0,0)', easing: 'cubic-bezier(.2,.7,.4,1)' },
      { transform: `translate(${dx}px,${dy}px)`, offset: 0.44 },
      { transform: `translate(${dx}px,${dy}px)`, offset: 0.6, easing: 'cubic-bezier(.6,0,.9,.4)' },
      { transform: 'translate(0,0)' },
    ], { duration: 760 });
    if (!(await wait(tk, 335))) return;
    setPose('slam');
    btn.classList.remove('av-dunked'); void btn.offsetWidth; btn.classList.add('av-dunked');
    burst(b, pick(['SLAM! 🏀', 'DUNK! 🏀', 'Swish! 🏀']));
    if (!(await wait(tk, 425))) return;
    setMotion('land'); setPose('happy'); setDunking(false); go();
    after(ctl.current.token, 240, () => { setMotion(''); setFaceLeft(true); });
  }

  // ---- guided tour (visitor-driven; the page scrolls only inside these click handlers) ----
  // Parker's own cancellable scroll: native smooth scrolling can't be reliably stopped mid-way, and the visitor's
  // wheel, touch or keys take over at once.
  function stopScroll() {
    cancelAnimationFrame(scrollRaf.current); scrollRaf.current = 0;
    scrollGrab.current?.(); scrollGrab.current = null;
  }
  function scrollToSection(el) {
    stopScroll();
    if (!el) return;
    const pad = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
    const max = document.documentElement.scrollHeight - innerHeight;
    const to = Math.max(0, Math.min(max, el.getBoundingClientRect().top + scrollY - pad));
    if (reduced()) { window.scrollTo({ top: to, behavior: 'instant' }); return; }
    const from = scrollY, dist = to - from, dur = Math.min(900, 350 + Math.abs(dist) * 0.35), t0 = performance.now();
    const grab = () => stopScroll();
    const evs = ['wheel', 'touchstart', 'keydown', 'mousedown'];
    evs.forEach(e => addEventListener(e, grab, { passive: true, capture: true }));
    scrollGrab.current = () => evs.forEach(e => removeEventListener(e, grab, { capture: true }));
    const step = now => {
      const p = Math.min(1, (now - t0) / dur), ease = p < .5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2;
      window.scrollTo({ top: from + dist * ease, behavior: 'instant' });
      if (p < 1) scrollRaf.current = requestAnimationFrame(step); else stopScroll();
    };
    scrollRaf.current = requestAnimationFrame(step);
  }
  function tourStep(i) {
    const list = steps.current || (steps.current = tourSteps(data, first));
    if (i >= list.length) {
      const tk = start('idle'); setTourIndex(-1); hush();
      setPose('happy'); setMood('happy');
      jump(tk, 110).then(ok => {
        if (!ok) return;
        speak(`That's the tour! 🎉 You now know ${first} better than his LinkedIn does. Ask me something, or message him directly?`, 'tour-end');
        after(tk, 1800, () => goIdle());
      });
      return;
    }
    const tk = start('touring');
    setTourIndex(i);
    const s = list[i];
    scrollToSection(document.querySelector(s.sel));
    wake(tk).then(ok => { if (!ok) return; setPose(s.pose); speak(s.text, 'tour'); });
  }
  function endTour() { stopScroll(); setTourIndex(-1); hush(); goIdle(); }

  // ---- chat ----
  useEffect(() => {
    if (open) {
      if (ctl.current.state === 'celebrating') return;            // the party finishes first, then chatting
      if (ctl.current.state === 'touring') stopScroll();
      setTourIndex(-1); hush();
      const tk = start('chatting');
      wake(tk).then(ok => ok && walkTo(tk, chatSpot())).then(ok => { if (ok && alive(tk)) setPose('listen'); });
    } else if (ctl.current.state === 'chatting') {
      const tk = start('idle');
      walkTo(tk, home()).then(ok => { if (ok && alive(tk)) goIdle(); });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  useEffect(() => {
    if (state !== 'chatting') return;                              // expressions only; never moves the page
    if (chatMood === 'thinking') { setPose('think'); setMood('think'); }
    else if (chatMood === 'talking') { setPose('present'); setMood('talk'); }
    else { setPose('listen'); setMood('smile'); }
  }, [state, chatMood]);

  // ---- hiring celebration (server-validated intent, once per conversation upstream) ----
  useEffect(() => {
    if (!hireSignal || hireSignal === lastSignal.current) return;
    lastSignal.current = hireSignal;
    const tk = request('celebrating', true);
    setParty({ id: hireSignal, still: reduced() });
    setTourIndex(-1);
    if (!openRef.current) speak(`Now THAT'S worth celebrating! 🎉 Let's get you in touch with ${first}.`, 'party');
    clearTimeout(mouthTimer.current); setMood('happy'); setPose('happy');
    // Ends after ~5s whatever happens to the flips (a background tab may pause animations).
    after(tk, 5000, () => {
      setParty(null); setBubble(b => (b?.kind === 'party' ? null : b));
      if (openRef.current) { start('chatting'); setPose('listen'); setMood('smile'); }
      else { const t2 = start('idle'); setPose('idle'); setMood('smile'); walkTo(t2, home()).then(ok => { if (ok && alive(t2)) goIdle(); }); }
    });
    if (reduced()) return;
    (async () => {
      if (!(await standUp(tk))) return;
      const hit = wrap.current?.querySelector('.av-hit'), x = pos.current.x;
      for (let i = 0; i < 2; i++) {
        if (!alive(tk)) return;
        setMotion('crouch'); if (!(await wait(tk, 120))) return;
        setMotion('air');
        hit?.animate([{ transform: 'translateY(0) rotate(0deg)' }, { transform: `translateY(-120px) rotate(${i ? -180 : 180}deg)` }, { transform: `translateY(0) rotate(${i ? -360 : 360}deg)` }], { duration: 640, easing: 'cubic-bezier(.3,.1,.3,1)' });
        if (!(await wait(tk, 640))) return;
        setMotion('land'); if (!(await wait(tk, 200))) return;
      }
      if (alive(tk)) { setMotion(''); setPose('happy'); setMood('happy'); place(x); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hireSignal]);
  // Keep his face happy while partying, even if the chat mood changes in the same moment.
  useEffect(() => { if (state === 'celebrating') { setPose('happy'); setMood('happy'); } }, [state, chatMood]);

  // ---- arrival: seated at home, then one welcome ~800ms later ----
  useEffect(() => {
    const x = home(); setHomeX(x); place(x); setFaceLeft(true);
    if (reduced()) { sitting.current = false; setPose('idle'); }
    const id = setTimeout(() => { if (ctl.current.state === 'seated') welcome(); }, reduced() ? 300 : 800);
    return () => { clearTimeout(id); ctl.current.timers.forEach(clearTimeout); ctl.current.timers.clear(); ctl.current.token += 1; clearTimeout(bubbleTimer.current); clearTimeout(mouthTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- resize / orientation: keep him (and the seat) inside the viewport, without animating ----
  useEffect(() => {
    let frame = 0;
    const onResize = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(() => { setHomeX(home()); stopMotion(); setMotion(''); place(spotFor(ctl.current.state)); }); };
    addEventListener('resize', onResize); addEventListener('orientationchange', onResize);
    return () => { removeEventListener('resize', onResize); removeEventListener('orientationchange', onResize); cancelAnimationFrame(frame); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- eyes follow the cursor (purely visual) ----
  const faceLeftRef = useRef(faceLeft); faceLeftRef.current = faceLeft;
  useEffect(() => {
    if (reduced() || phone()) return;
    let frame = 0, px = 0, py = 0;
    const update = () => {
      frame = 0;
      const r = wrap.current?.getBoundingClientRect(); if (!r) return;
      const dx = (px - (r.left + r.width / 2)) / innerWidth, dy = (py - (r.top + r.height * 0.22)) / innerHeight;
      setLook([Math.max(-1.6, Math.min(1.6, dx * 6)) * (faceLeftRef.current ? -1 : 1), Math.max(-1.2, Math.min(1.2, dy * 5))]);
    };
    const onMove = e => { px = e.clientX; py = e.clientY; if (!frame) frame = requestAnimationFrame(update); };
    addEventListener('pointermove', onMove, { passive: true });
    return () => { removeEventListener('pointermove', onMove); cancelAnimationFrame(frame); };
  }, []);

  // ---- render ----
  const hidden = open && phone();
  const dark = theme === 'dark';
  const seated = state === 'seated' && pose === 'sit';
  const torchActive = dark && !hidden && !open && !party && !motion && ['idle', 'seated', 'touring', 'welcoming'].includes(state) && !['happy'].includes(pose);
  const kind = bubble?.kind;
  const list = steps.current || [];
  const tourButton = <button type="button" className="av-primary" onClick={() => tourStep(0)}>Take the tour 🎯</button>;
  return (
    <>
      <Seat x={homeX} />
      <div ref={wrap} className={'av' + (hidden ? ' is-hidden' : '')} data-state={state}>
        {bubble && !open && (!motion || dunking) && (
          <div className="av-bubble" role="status">
            <button type="button" className="av-bubble-x" onClick={() => (kind === 'tour' ? endTour() : hush())} aria-label="Dismiss">×</button>
            {kind === 'tour' && <span className="av-step">Tour · {tourIndex + 1} / {list.length}</span>}
            <p>{bubble.text}</p>
            <div className="av-bubble-actions">
              {kind === 'tour' ? <>
                <button type="button" className="av-primary" onClick={() => tourStep(tourIndex + 1)}>{tourIndex + 1 < list.length ? 'Next →' : 'Finish 🏁'}</button>
                <button type="button" className="av-hide" onClick={endTour}>End tour</button>
              </> : kind === 'party' ? <>
                <a className="av-primary" href="#contact" onClick={dunkContact}>Contact {first}</a>
              </> : kind === 'tour-end' || kind === 'yes' ? <>
                <a className="av-primary" href="#contact" onClick={dunkContact}>Message {first}</a>
                <button type="button" className="av-ask" onClick={onOpen}>Ask me anything</button>
              </> : kind === 'fit' ? <>
                <button type="button" className="av-primary" onClick={yes}>Absolutely! 🎉</button>
                <button type="button" className="av-ask" onClick={() => onAsk('Why is he a great fit for an AI engineering role?')}>Convince me</button>
              </> : <>
                {tourButton}
                {questions.slice(0, 1).map(q => <button type="button" key={q} className="av-ask" onClick={() => onAsk(q)}>{q}</button>)}
                <button type="button" className="av-ask" onClick={onOpen}>Chat with me</button>
              </>}
            </div>
          </div>
        )}
        <button type="button" className="av-hit" onClick={onPress} onDoubleClick={onDouble} aria-label={`${name}, ${first}'s assistant: tour or chat`} title="Click me! (or double-click 😉)">
          <Character svgRef={svgRef} pose={pose} motion={(seated ? 'is-seated ' : '') + (motion ? 'is-' + motion : '')} mood={mood} faceLeft={faceLeft} look={look} torch={dark ? (torchActive ? 'torch-held has-torch' : 'torch-held') : ''} />
        </button>
      </div>
      <Torch svgRef={svgRef} avatarRef={wrap} dark={dark && !hidden} active={torchActive} section={section} reducedMotion={reduced()} />
      {party && <Party key={party.id} still={party.still} />}
    </>
  );
}
