import React, { useEffect, useRef, useState } from 'react';
import './avatar.css';

// A cartoon (Bitmoji-style) version of the portfolio owner who walks around the page, pitches him, dunks
// on the buttons visitors click, and can give a guided tour. Everything he says is written here from the
// published content, so he never invents facts. Drawing: 160x270 SVG units, floor at y=262.

const VB_W = 160, VB_H = 270;
const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const phone = () => typeof matchMedia === 'function' && matchMedia('(max-width: 640px)').matches;
const pick = list => list[Math.floor(Math.random() * list.length)];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const vw = () => document.documentElement.clientWidth;

// ---- What he says ---------------------------------------------------------------------------------
function pitch(section, data, first, name) {
  const stat = data.stats?.[0];
  const top = data.projects?.find(p => p.featured) || data.projects?.[0];
  const recent = data.experience?.[0];
  switch (section) {
    case 'top': return { side: 'right', pose: 'wave', lines: [`Hi! I'm ${name}, the cartoon version of ${first}. The real one is busy building AI that doesn't make things up.`, `Hey 👋 I'm ${name}. Recruiting? I come with demos, results and zero hallucinations.`] };
    case 'proof': return stat && { side: 'left', pose: 'point', lines: [`${stat.value} ${stat.label}. I'd frame it, but it keeps getting better.`, `See ${stat.value}? Not a typo. I asked twice.`] };
    case 'work': return top && { side: 'left', pose: 'point', lines: [`Start with ${top.name}.${top.result ? ` ${top.result}.` : ''} Want my 30-second pitch?`, `My favourite: ${top.name}. Click "View details" and watch me dunk it.`] };
    case 'approach': return { side: 'right', pose: 'think', lines: [`The trick: code computes every number, the model just explains it.`, `Rule #1: if an AI can't show its work, it doesn't ship.`] };
    case 'experience': return { side: 'left', pose: 'thumbs', lines: [recent ? `Most recently ${recent.role} at ${recent.company}. Real jobs, real results.` : `Real jobs, real results.`, `Every line here shipped to real users. I checked the receipts.`] };
    case 'contact': return { side: 'right', pose: 'present', lines: [`Here's the deal: one message from you lands on ${first}'s phone in seconds. 📱`, `Go on, say hi. I'll pretend I'm not excited.`] };
    default: return null;
  }
}
function tourSteps(data, first) {
  const stat = data.stats?.[0], recent = data.experience?.[0], top = data.projects?.find(p => p.featured) || data.projects?.[0];
  return [
    stat && { sel: '.proof', side: 'left', pose: 'point', text: `Stop 1, the numbers: ${stat.value} ${stat.label}. Measured, not guessed.` },
    top && { sel: '#work', side: 'left', pose: 'present', text: `Stop 2, the projects. ${top.name} is the star${top.result ? `: ${top.result}` : ''}. Every card opens into the full story.` },
    { sel: '#approach', side: 'right', pose: 'think', text: `Stop 3, how ${first} works: prepare the data, find the evidence, let code compute, then evaluate everything.` },
    { sel: '#experience', side: 'left', pose: 'thumbs', text: recent ? `Stop 4, where he's done it for real. Most recently ${recent.role} at ${recent.company}.` : `Stop 4, where he's done it for real.` },
    { sel: '#contact', side: 'right', pose: 'present', text: `Last stop! A message here reaches ${first} in seconds. Shall we make it official?` },
  ].filter(Boolean);
}
const SAD = [`So… will you give me a chance or not? 😢`, `Animations off? Fine. I'll just stand here… hoping. 😢`];
const HIRE = ['Hire me! 🙏', 'Psst… hire me? 🥺', 'Hiiire meee!', 'Did I mention? Hire me! 😄', 'H-I-R-E  M-E. Just saying.'];
const FIT = ['Do I meet the requirements? 😄', 'So… do I meet the requirements? 😄'];
const CHEERS = ['Boom! 🏀', 'Slam dunk!', 'Nice pick!', 'Ooh, good one!', 'Let\'s go!', 'And he scores!'];
const WANDER = [
  { pose: 'shrug', line: 'Still deciding? Take your time. I\'m paid in clicks.' },
  { pose: 'wave', line: 'Psst. I answer questions too. Click me.' },
  { pose: 'thumbs', line: 'Fun fact: I never sleep. He does, occasionally.' },
  { pose: 'happy', line: null },
  { pose: 'look', line: null },
];

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

// ---- The drawing ----------------------------------------------------------------------------------
function Character({ pose, motion, mood, faceLeft, look }) {
  return (
    <svg className={`av-svg pose-${pose} mood-${mood} ${motion ? 'is-' + motion : ''} ${faceLeft ? 'face-left' : ''}`} viewBox={`0 0 ${VB_W} ${VB_H}`} aria-hidden="true"
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
          <g className="av-fore av-fore-l"><rect x="46" y="136" width="16" height="34" rx="8" className="av-sleeve" /><circle cx="54" cy="174" r="8" className="av-hand" /><ellipse className="av-thumb" cx="60" cy="168" rx="3" ry="5" /></g></g>
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

// ---- Behaviour ------------------------------------------------------------------------------------
export default function Avatar({ data, first, name = 'Parker', open, mood: chatMood, questions, onOpen, onAsk }) {
  const section = useSection();
  const wrap = useRef(null);
  const pos = useRef({ x: 0, y: 0 });
  const busy = useRef(0);          // token of the running move; 0 when idle
  const said = useRef(new Set());
  const timers = useRef({});
  const [pose, setPose] = useState('wave');
  const [motion, setMotion] = useState('');
  const [mood, setMood] = useState('smile');
  const [faceLeft, setFaceLeft] = useState(true);
  const [look, setLook] = useState([0, 0]);
  const [bubble, setBubble] = useState(null);   // { text, kind: 'pitch' | 'tour' | 'tour-end' }
  const [tour, setTour] = useState(-1);
  const [bursts, setBursts] = useState([]);
  const steps = useRef(tourSteps(data, first)).current;

  const size = () => { const w = wrap.current?.offsetWidth || 120; return { w, h: w * VB_H / VB_W, s: w / VB_W }; };
  const tr = (x, y) => `translate3d(${Math.round(x)}px,${Math.round(y)}px,0)`;
  const place = (x, y = 0) => { pos.current = { x, y }; if (wrap.current) wrap.current.style.transform = tr(x, y); };
  const sideX = side => { const { w } = size(); if (phone()) return vw() - w - 4; if (open) return Math.max(8, vw() - 420 - w); return side === 'left' ? 12 : vw() - w - 12; };
  const faceContent = () => setFaceLeft(pos.current.x > vw() / 2);
  const clearT = name => clearTimeout(timers.current[name]);
  const later = (name, ms, fn) => { clearT(name); timers.current[name] = setTimeout(fn, ms); };

  const speak = (text, kind = 'pitch', ms = 7500) => {
    setBubble({ text, kind });
    setMood('talk'); later('mouth', 1700, () => setMood(m => (m === 'talk' ? 'smile' : m)));
    if (kind === 'pitch' || kind === 'hire') later('bubble', ms, () => setBubble(b => (b?.kind === kind ? null : b)));
  };

  // Run one WAAPI step on the wrapper; resolves when done (or immediately when superseded).
  const step = (to, duration, easing) => new Promise(resolve => {
    const el = wrap.current; if (!el) return resolve();
    const from = tr(pos.current.x, pos.current.y);
    const a = el.animate([{ transform: from }, { transform: tr(to.x, to.y) }], { duration, easing, fill: 'forwards' });
    a.onfinish = () => { place(to.x, to.y); a.cancel(); resolve(); };
    a.oncancel = resolve;
  });
  const begin = () => { wrap.current?.getAnimations().forEach(a => a.cancel()); busy.current = Math.random(); return busy.current; };
  const alive = t => busy.current === t;
  const end = t => { if (alive(t)) { busy.current = 0; setMotion(''); } };

  async function walkTo(x, run = false) {
    const t = begin(), from = pos.current.x, dist = Math.abs(x - from);
    if (reduced() || dist < 6) { place(x, 0); faceContent(); return end(t); }
    setBubble(b => (b?.kind === 'pitch' ? null : b));
    setFaceLeft(x < from); setMotion(run ? 'run' : 'walk');
    await step({ x, y: 0 }, dist / (run ? 520 : 190) * 1000, 'linear');
    if (!alive(t)) return; faceContent(); end(t);
  }

  async function jumpTo(x) {
    const t = begin(), from = { ...pos.current };
    if (reduced()) { place(x, 0); faceContent(); return end(t); }
    setBubble(b => (b?.kind === 'pitch' ? null : b));
    setFaceLeft(x < from.x);
    setMotion('crouch'); await sleep(160); if (!alive(t)) return;
    setMotion('air');
    await step({ x: (from.x + x) / 2, y: -150 }, 380, 'cubic-bezier(.2,.7,.4,1)'); if (!alive(t)) return;
    await step({ x, y: 0 }, 380, 'cubic-bezier(.6,0,.8,.4)'); if (!alive(t)) return;
    setMotion('land'); await sleep(260); if (!alive(t)) return;
    faceContent(); end(t);
  }

  const moveTo = x => (Math.abs(x - pos.current.x) > 320 ? jumpTo(x) : walkTo(x));

  function burst(x, y, text) {
    const id = Math.random();
    setBursts(b => [...b, { id, x, y, text }]);
    setTimeout(() => setBursts(b => b.filter(i => i.id !== id)), 900);
  }

  // Leap so the raised hand meets the button, slam it, land and celebrate. onSlam runs at the moment of impact.
  async function dunk(target, onSlam) {
    const r = target.getBoundingClientRect();
    const t = begin(), { w, h, s } = size();
    if (reduced() || phone()) { onSlam?.(); celebrate(); return end(t); }
    setBubble(b => (b?.kind === 'tour' || b?.kind === 'tour-end' ? b : null));
    const bx = r.left + r.width / 2, by = r.top + r.height / 2;
    const goingLeft = bx < pos.current.x + w / 2;
    setFaceLeft(goingLeft);
    const handX = (goingLeft ? VB_W - 112 : 112) * s, handY = 40 * s;      // raised hand, relative to the wrapper
    const floorTop = innerHeight - 4 - h;
    const tx = Math.max(0, Math.min(vw() - w, bx - handX)), ty = Math.min(0, by - handY - floorTop);
    setMood('surprised'); setPose('dunk'); setMotion('crouch'); await sleep(140); if (!alive(t)) { onSlam?.(); return; }
    setMotion('air');
    await step({ x: tx, y: ty }, Math.min(800, 360 + Math.abs(ty) * 0.6), 'cubic-bezier(.15,.75,.35,1)');
    if (!alive(t)) { onSlam?.(); return; }
    setPose('slam'); setMood('happy');
    target.classList.add('av-dunked'); setTimeout(() => target.classList.remove('av-dunked'), 450);
    burst(bx, by, pick(CHEERS));
    onSlam?.();
    await sleep(110); if (!alive(t)) return;
    await step({ x: tx, y: 0 }, Math.min(650, 240 + Math.abs(ty) * 0.45), 'cubic-bezier(.55,0,.9,.45)'); if (!alive(t)) return;
    setMotion('land'); await sleep(240); if (!alive(t)) return;
    setMotion(''); setPose('happy');
    await step({ x: tx, y: -26 }, 160, 'ease-out'); await step({ x: tx, y: 0 }, 160, 'ease-in');
    if (!alive(t)) return;
    later('calm', 900, () => { setMood('smile'); setPose('idle'); });
    end(t);
  }

  async function celebrate() {
    const t = begin();
    setMood('happy'); setPose('happy');
    if (!reduced()) { setMotion('crouch'); await sleep(120); setMotion('air'); await step({ x: pos.current.x, y: -50 }, 220, 'ease-out'); await step({ x: pos.current.x, y: 0 }, 220, 'ease-in'); setMotion('land'); await sleep(200); }
    later('calm', 1000, () => { setMood('smile'); setPose('idle'); });
    end(t);
  }

  // Enter: jump in from beyond the right edge.
  useEffect(() => {
    if (reduced()) {
      place(sideX('right'), 0); faceContent(); setPose('sad');
      later('enter', 600, () => { speak(pick(SAD), 'sad'); setMood('sad'); });
      return () => Object.values(timers.current).forEach(clearTimeout);
    }
    place(vw() + 30, 0);
    later('enter', 400, async () => { await jumpTo(sideX('right')); setPose('wave'); if (!said.current.has('top')) { said.current.add('top'); speak(pitch('top', data, first, name).lines[0] + ''); } });
    return () => Object.values(timers.current).forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Section pitches (each once per visit), unless a tour is running or the chat is open.
  useEffect(() => {
    if (open || tour >= 0 || section === 'top') return;
    const p = pitch(section, data, first, name);
    if (!p) return;
    later('section', 350, async () => {
      if (busy.current) return;
      await moveTo(sideX(p.side));
      // With motion turned off he stays sad until the visitor gives him a chance.
      const sad = reduced() && !accepted.current;
      setPose(sad ? 'sad' : p.pose);
      if (!said.current.has(section)) { said.current.add(section); speak(pick(p.lines)); if (sad) setMood('sad'); }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section, open, tour]);

  // Free wandering when nothing else is going on.
  useEffect(() => {
    if (open || reduced()) return;
    let stop = false;
    const tick = () => later('wander', 14000 + Math.random() * 10000, async () => {
      if (stop) return;
      if (!busy.current && tour < 0 && !bubble) {
        const { w } = size();
        const x = phone() ? vw() - w - 4 - Math.random() * Math.min(120, vw() / 3) : 12 + Math.random() * (vw() - w - 24);
        await walkTo(x, Math.random() < 0.2);
        const w8 = pick(WANDER);
        setPose(w8.pose); if (w8.pose === 'happy') celebrate();
        if (w8.line && Math.random() < 0.6) speak(w8.line, 'pitch', 5500);
      }
      tick();
    });
    tick();
    return () => { stop = true; clearT('wander'); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, tour, bubble]);

  // The chat: step beside the panel and act the conversation.
  useEffect(() => { if (open) { setBubble(null); setTour(-1); walkTo(sideX('right'), true); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!open) return;
    if (chatMood === 'thinking') { setPose('think'); setMood('think'); }
    else if (chatMood === 'talking') { setPose('present'); setMood('talk'); }
    else { setPose('listen'); setMood('smile'); }
  }, [open, chatMood]);

  // Dunk on the buttons the visitor clicks. In-page links wait for the slam, then navigate.
  useEffect(() => {
    const onClick = e => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || open) return;
      const el = e.target.closest?.('a, button');
      if (!el || el.closest('.av, .ai, form') || !el.closest('.site')) return;
      const href = el.tagName === 'A' ? el.getAttribute('href') : null;
      if (href && /^#[\w-]+$/.test(href) && !reduced() && !phone() && !busy.current) {
        e.preventDefault();
        dunk(el, () => {
          if (location.hash === href) document.querySelector(href)?.scrollIntoView({ behavior: 'smooth' });
          else location.hash = href;
        });
      } else if (!busy.current) {
        dunk(el);
      }
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Eyes follow the cursor.
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
  const faceLeftRef = useRef(faceLeft); faceLeftRef.current = faceLeft;

  useEffect(() => {
    const onResize = () => { if (!busy.current) place(Math.min(pos.current.x, vw() - size().w - 4), 0); };
    addEventListener('resize', onResize);
    return () => removeEventListener('resize', onResize);
  }, []);

  // ---- Guided tour ----
  async function goTour(i, button) {
    if (button) await dunk(button);
    if (i >= steps.length) {
      setTour(-1); setPose('happy'); setMood('happy'); celebrate();
      const r = wrap.current.getBoundingClientRect(); burst(r.left + r.width / 2, r.top + 20, '🎉 Tour complete!');
      speak(`That's the tour! 🎉 You now know ${first} better than his LinkedIn does. Want to ask me something, or message him directly?`, 'tour-end');
      return;
    }
    const s = steps[i];
    setTour(i); setBubble(null);
    document.querySelector(s.sel)?.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'start' });
    await sleep(reduced() ? 50 : 650);
    await moveTo(sideX(s.side));
    setPose(s.pose);
    speak(s.text, 'tour');
  }

  // "Hire me!" every 30-45 seconds while nothing else is happening.
  const bubbleRef = useRef(null); bubbleRef.current = bubble;
  const accepted = useRef(false);
  useEffect(() => {
    if (open) return;
    const tick = () => later('hire', 30000 + Math.random() * 15000, () => {
      if (!busy.current && tour < 0 && !bubbleRef.current) {
        const still = reduced() && !accepted.current;
        setPose(still ? 'sad' : pick(['wave', 'present', 'happy']));
        speak(pick(HIRE), 'hire', 4000);
        if (still) setMood('sad');
      }
      tick();
    });
    tick();
    return () => clearT('hire');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, tour]);

  // Single click: what shall we do? Double click: happy, and fishing for a compliment.
  function onPress() {
    later('click', 260, () => {
      if (!busy.current) celebrate();
      later('menu', reduced() ? 0 : 650, () => speak(pick(['At your service! 😄 What shall we do?', 'You rang? Tour, questions, or straight to the point?', 'Hey! Want the grand tour or a quick chat?']), 'menu'));
    });
  }
  function onDouble() {
    clearT('click'); clearT('menu');
    accepted.current = true;
    celebrate();
    later('menu', reduced() ? 0 : 650, () => { speak(pick(FIT), 'fit'); setMood('happy'); setPose('happy'); });
  }
  function yes() {
    accepted.current = true;
    celebrate();
    const r = wrap.current?.getBoundingClientRect(); if (r) burst(r.left + r.width / 2, r.top + 20, '🥳');
    later('menu', reduced() ? 0 : 650, () => { speak(pick(['Knew it! 🥳 Let\'s make it official.', 'Yesss! You won\'t regret it. 🥳']), 'yes'); setMood('happy'); setPose('happy'); });
  }

  const hidden = open && phone();
  const onLeft = pos.current.x < vw() / 2;
  const kind = bubble?.kind;
  const tourButton = tour < 0 && steps.length > 1 && <button type="button" className="av-primary" onClick={e => goTour(0, e.currentTarget)}>Take the 60-second tour 🎯</button>;
  return (
    <>
      <div ref={wrap} className={'av' + (hidden ? ' is-hidden' : '') + (onLeft ? ' on-left' : '')}>
        {bubble && !open && !motion && (
          <div className={'av-bubble' + (kind === 'hire' ? ' is-short' : '')} role="status">
            <button type="button" className="av-bubble-x" onClick={() => { setBubble(null); setTour(-1); }} aria-label="Dismiss">×</button>
            {kind === 'tour' && <span className="av-step">Tour · {tour + 1} / {steps.length}</span>}
            <p>{bubble.text}</p>
            <div className="av-bubble-actions">
              {kind === 'tour' ? <>
                <button type="button" className="av-primary" onClick={e => goTour(tour + 1, e.currentTarget)}>{tour + 1 < steps.length ? 'Next stop →' : 'Finish the tour 🏁'}</button>
                <button type="button" className="av-hide" onClick={() => { setTour(-1); setBubble(null); }}>End tour</button>
              </> : kind === 'tour-end' || kind === 'yes' ? <>
                <a className="av-primary" href="#contact" onClick={() => setBubble(null)}>Message {first}</a>
                <button type="button" className="av-ask" onClick={onOpen}>Ask me anything</button>
              </> : kind === 'sad' ? <>
                <button type="button" className="av-primary" onClick={yes}>Of course! 😊</button>
                {tourButton}
                <button type="button" className="av-ask" onClick={onOpen}>Chat with me</button>
              </> : kind === 'fit' ? <>
                <button type="button" className="av-primary" onClick={yes}>Absolutely! 🎉</button>
                <button type="button" className="av-ask" onClick={() => onAsk('Why is he a great fit for an AI engineering role?')}>Convince me</button>
              </> : kind === 'hire' ? <>
                <button type="button" className="av-ask" onClick={() => onAsk('Why should I hire him?')}>Why should I? 🤔</button>
              </> : <>
                {tourButton}
                {questions.slice(0, 1).map(q => <button type="button" key={q} className="av-ask" onClick={() => onAsk(q)}>{q}</button>)}
                <button type="button" className="av-ask" onClick={onOpen}>Chat with me</button>
              </>}
            </div>
          </div>
        )}
        <button type="button" className="av-hit" onClick={onPress} onDoubleClick={onDouble} aria-label={`${name}, ${first}'s assistant: tour or chat`} title="Click me! (or double-click 😉)">
          <Character pose={pose} motion={motion} mood={mood} faceLeft={faceLeft} look={look} />
        </button>
      </div>
      {bursts.map(b => <span key={b.id} className="av-burst" style={{ left: b.x, top: b.y }} aria-hidden="true">{b.text}</span>)}
    </>
  );
}
