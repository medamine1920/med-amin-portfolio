import React, { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import '@fontsource-variable/bricolage-grotesque/standard.css';
import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import './site.css';
import { api, external } from '../api.js';
import { useReveal, useInView, trackPointer, parseStat, formatStat, reducedMotion, useScrollProgress } from './motion.js';

const NAV = [['work', 'Work'], ['approach', 'Approach'], ['experience', 'Experience'], ['contact', 'Contact']];
const initials = name => (name || 'Portfolio').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();

export default function Site({ data, preview = false }) {
  const root = useRef(null);
  useReveal(root, [data]);
  const [theme, toggleTheme] = useTheme(preview);

  useEffect(() => {
    if (preview) return;
    // Content renders after /api/site loads, so the browser's own jump to #section has already missed; redo it.
    const target = location.hash.length > 1 && document.getElementById(decodeURIComponent(location.hash.slice(1)));
    if (target) {
      // Jump once now, and again after the web fonts load and change the layout (unless the visitor already scrolled).
      let jumped = 0;
      const go = () => { target.scrollIntoView({ behavior: 'instant' }); jumped = scrollY; };
      requestAnimationFrame(go);
      Promise.all([document.fonts?.ready, new Promise(r => setTimeout(r, 250))]).then(() => { if (Math.abs(scrollY - jumped) < 4 || scrollY === 0) go(); });
    }
    fetch('/api/view', { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: location.pathname, referrer: document.referrer }) }).catch(() => {});
  }, [preview]);

  return (
    <div className="site" ref={root} data-theme={theme} onPointerMove={magnet} onPointerOut={unmagnet}>
      {!preview && <CursorGlow />}
      {!preview && <a className="skip-link" href="#main">Skip to content</a>}
      {preview && <div className="preview-ribbon">Draft preview · Only you can see this version</div>}
      <Header data={data} preview={preview} theme={theme} toggleTheme={toggleTheme} />
      <main id="main">
        <Hero data={data} />
        <Proof stats={data.stats} skills={data.skills} />
        <Work projects={data.projects} />
        <Approach />
        <Experience data={data} />
        <Contact data={data} preview={preview} />
      </main>
      <footer className="footer">
        <div className="container footer-row">
          <span>© {new Date().getFullYear()} {data.brand}</span>
          <a href="#main" className="to-top">Back to top ↑</a>
        </div>
      </footer>
    </div>
  );
}

// ---- Theme ------------------------------------------------------------------
const THEME_COLOR = { dark: '#0a1210', light: '#f4f7f2' };
function storedTheme() { try { const t = localStorage.getItem('theme'); return t === 'light' || t === 'dark' ? t : null; } catch { return null; } }
const systemTheme = () => (typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');

// Follows the system setting until the visitor picks a theme, then remembers the choice.
function useTheme(preview) {
  const [theme, setTheme] = useState(() => storedTheme() || systemTheme());
  useEffect(() => {
    if (preview) return;
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[theme]);
  }, [theme, preview]);
  useEffect(() => {
    if (typeof matchMedia !== 'function') return;
    const mq = matchMedia('(prefers-color-scheme: light)');
    const onChange = e => { if (!storedTheme()) setTheme(e.matches ? 'light' : 'dark'); };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  const toggle = e => {
    const next = theme === 'light' ? 'dark' : 'light';
    try { localStorage.setItem('theme', next); } catch { /* private mode: still switch for this visit */ }
    const apply = () => flushSync(() => setTheme(next));
    if (preview || !document.startViewTransition || reducedMotion()) { apply(); return; }
    // Circular reveal of the new theme, starting from the toggle button.
    const r = e.currentTarget.getBoundingClientRect();
    document.documentElement.style.setProperty('--vt-x', r.left + r.width / 2 + 'px');
    document.documentElement.style.setProperty('--vt-y', r.top + r.height / 2 + 'px');
    document.startViewTransition(apply);
  };
  return [theme, toggle];
}

function ThemeToggle({ theme, onToggle }) {
  const light = theme === 'light';
  return (
    <button type="button" className={'theme-toggle' + (light ? ' is-light' : '')} data-magnetic onClick={onToggle} aria-label={light ? 'Switch to dark theme' : 'Switch to light theme'} title={light ? 'Dark theme' : 'Light theme'}>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <mask id="moon-cut"><rect width="24" height="24" fill="#fff" /><circle className="moon-cut" cx="17.5" cy="6.5" r="6.5" fill="#000" /></mask>
        <circle className="sun-core" cx="12" cy="12" r="8.5" mask="url(#moon-cut)" />
        <g className="sun-rays">{[0, 45, 90, 135, 180, 225, 270, 315].map(a => <line key={a} x1="12" y1="1.5" x2="12" y2="3.6" transform={`rotate(${a} 12 12)`} />)}</g>
      </svg>
    </button>
  );
}

// ---- Pointer effects (fine pointers only, never with reduced motion) ----------
const finePointer = () => typeof matchMedia === 'function' && matchMedia('(pointer: fine)').matches && !reducedMotion();

// Magnetic elements drift toward the cursor. Uses the CSS `translate` property so it never fights hover transforms.
function magnet(e) {
  const el = e.target.closest?.('[data-magnetic]');
  if (!el || !finePointer()) return;
  const r = el.getBoundingClientRect();
  const clamp = v => Math.max(-10, Math.min(10, v)).toFixed(1) + 'px';
  el.style.setProperty('--tx', clamp((e.clientX - (r.left + r.width / 2)) * 0.25));
  el.style.setProperty('--ty', clamp((e.clientY - (r.top + r.height / 2)) * 0.35));
}
function unmagnet(e) {
  const el = e.target.closest?.('[data-magnetic]');
  if (el && !el.contains(e.relatedTarget)) { el.style.setProperty('--tx', '0px'); el.style.setProperty('--ty', '0px'); }
}

// A soft light that trails the cursor.
function CursorGlow() {
  const ref = useRef(null);
  useEffect(() => {
    if (!finePointer()) return;
    const el = ref.current;
    let x = innerWidth / 2, y = innerHeight / 3, tx = x, ty = y, frame = 0;
    const loop = () => {
      x += (tx - x) * 0.14; y += (ty - y) * 0.14;
      el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
      frame = Math.abs(tx - x) + Math.abs(ty - y) > 0.5 ? requestAnimationFrame(loop) : 0;
    };
    const onMove = e => { tx = e.clientX; ty = e.clientY; el.classList.add('is-on'); if (!frame) frame = requestAnimationFrame(loop); };
    const onLeave = () => el.classList.remove('is-on');
    addEventListener('pointermove', onMove, { passive: true });
    document.documentElement.addEventListener('pointerleave', onLeave);
    return () => { removeEventListener('pointermove', onMove); document.documentElement.removeEventListener('pointerleave', onLeave); cancelAnimationFrame(frame); };
  }, []);
  return <div className="cursor-glow" ref={ref} aria-hidden="true" />;
}

function Typewriter({ text, delay = 450, speed = 34 }) {
  const [count, setCount] = useState(() => (reducedMotion() ? text.length : 0));
  useEffect(() => {
    if (reducedMotion()) { setCount(text.length); return; }
    setCount(0);
    let i = 0, timer;
    const start = setTimeout(() => { timer = setInterval(() => { i += 1; setCount(i); if (i >= text.length) clearInterval(timer); }, speed); }, delay);
    return () => { clearTimeout(start); clearInterval(timer); };
  }, [text, delay, speed]);
  return <><span className="sr-only">{text}</span><span aria-hidden="true">{text.slice(0, count)}<span className={'caret' + (count >= text.length ? ' is-done' : '')} /></span></>;
}

function Header({ data, preview, theme, toggleTheme }) {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState('');
  const bar = useRef(null);

  useEffect(() => {
    if (preview) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      setScrolled(scrollY > 12);
      const max = document.documentElement.scrollHeight - innerHeight;
      bar.current?.style.setProperty('--scroll', max > 0 ? (scrollY / max).toFixed(4) : '0');
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(update); };
    update();
    addEventListener('scroll', onScroll, { passive: true });
    return () => { removeEventListener('scroll', onScroll); cancelAnimationFrame(frame); };
  }, [preview]);

  useEffect(() => {
    if (preview || !('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver(entries => { for (const e of entries) if (e.isIntersecting) setActive(e.target.id); }, { rootMargin: '-45% 0px -50% 0px' });
    ['top', ...NAV.map(([id]) => id)].forEach(id => { const el = document.getElementById(id); if (el) io.observe(el); });
    return () => io.disconnect();
  }, [preview]);

  useEffect(() => {
    if (!open) return;
    const onKey = e => { if (e.key === 'Escape') setOpen(false); };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <header className={'header' + (scrolled ? ' is-scrolled' : '') + (open ? ' is-open' : '') + (preview ? ' is-preview' : '')}>
      <div className="container header-row">
        <a className="brand" href="#main" onClick={() => setOpen(false)}>
          <span className="brand-mark" aria-hidden="true">{initials(data.brand)}</span>
          <span className="brand-name">{data.brand}</span>
        </a>
        <div className="header-tools">
          <ThemeToggle theme={theme} onToggle={toggleTheme} />
          <button className="menu-button" aria-expanded={open} aria-controls="site-nav" onClick={() => setOpen(o => !o)}>
            <span className="sr-only">{open ? 'Close menu' : 'Open menu'}</span>
            <span className="menu-icon" aria-hidden="true"><i /><i /></span>
          </button>
        </div>
        <nav id="site-nav" aria-label="Main navigation">
          {NAV.map(([id, label]) => (
            <a key={id} href={'#' + id} data-magnetic={id === 'contact' ? '' : undefined} className={(id === 'contact' ? 'nav-cta' : '') + (active === id ? ' is-active' : '')} aria-current={active === id ? 'true' : undefined} onClick={() => setOpen(false)}>{label}</a>
          ))}
        </nav>
      </div>
      <div className="scroll-bar" ref={bar} aria-hidden="true" />
    </header>
  );
}

function Hero({ data }) {
  const words = (data.headline || '').split(/\s+/).filter(Boolean);
  return (
    <section className="hero" id="top" onPointerMove={trackPointer}>
      <div className="hero-grid" aria-hidden="true" />
      <div className="mesh" aria-hidden="true"><i /><i /><i /><i /></div>
      <div className="container hero-layout">
        <div className="hero-copy">
          <p className="role-line"><span className="live-dot" aria-hidden="true" /><Typewriter text={data.role || ''} /></p>
          <h1 className="headline" aria-label={data.headline}>
            {words.map((w, i) => (
              <React.Fragment key={i}><span className="word" aria-hidden="true"><span className={'word-inner' + (i >= 2 ? ' accent' : '')} style={{ '--i': i }}>{w}</span></span>{i < words.length - 1 ? ' ' : ''}</React.Fragment>
            ))}
          </h1>
          <p className="lede" data-reveal style={{ '--d': '0.35s' }}>{data.intro}</p>
          <div className="hero-actions" data-reveal style={{ '--d': '0.45s' }}>
            <a className="button primary" href="#work" data-magnetic>See the work <span aria-hidden="true">↘</span></a>
            <a className="button ghost" href={data.resume || '/resume.pdf'} download data-magnetic>Download résumé <span aria-hidden="true">↓</span></a>
          </div>
          <dl className="hero-facts" data-reveal style={{ '--d': '0.55s' }}>
            {data.availability && <div><dt>Available for</dt><dd>{data.availability}</dd></div>}
            {data.location && <div><dt>Based in</dt><dd>{data.location}</dd></div>}
          </dl>
        </div>
        <div className="hero-visual" data-reveal style={{ '--d': '0.25s' }}>
          <Portrait data={data} />
          <TraceCard />
        </div>
      </div>
    </section>
  );
}

function Portrait({ data }) {
  const [failed, setFailed] = useState(false);
  const show = data.portrait && !failed;
  return (
    <div className="portrait" onPointerMove={trackPointer} onPointerLeave={e => { e.currentTarget.style.setProperty('--px', '0'); e.currentTarget.style.setProperty('--py', '0'); }}>
      <div className="portrait-ring" aria-hidden="true"><span /></div>
      <div className="portrait-frame">
        {show
          ? <img src={data.portrait} alt={data.portraitAlt || `Portrait of ${data.brand}`} onError={() => setFailed(true)} />
          : <div className="portrait-monogram" role="img" aria-label={data.brand}>{initials(data.brand)}</div>}
      </div>
    </div>
  );
}

const TRACE = [
  ['q', 'ask', 'Which region drove Q3 revenue growth?'],
  ['m', 'plan', '3 steps · revenue_growth by region'],
  ['c', 'tool', 'semantic_layer.query(revenue, by=region)'],
  ['c', 'exec', 'computed in code · 4 rows · 212 ms'],
  ['m', 'review', 'numbers match the source ✓'],
  ['a', 'answer', 'EMEA, +18% QoQ, 61% of total growth.'],
];

function TraceCard() {
  const [cycle, setCycle] = useState(0);
  const [ref, inView] = useInView({ threshold: 0.2 });
  useEffect(() => {
    if (!inView || reducedMotion()) return;
    const t = setInterval(() => setCycle(c => c + 1), 9000);
    return () => clearInterval(t);
  }, [inView]);
  return (
    <figure className={'trace' + (inView ? ' is-running' : '')} ref={ref} aria-label="Example agent trace: a question is planned by the model, computed in code, reviewed, then answered.">
      <figcaption className="trace-head">
        <span className="trace-dots" aria-hidden="true"><i /><i /><i /></span>
        <span>agent trace</span>
        <span className="trace-legend" aria-hidden="true"><b className="m">model</b><b className="c">code</b></span>
      </figcaption>
      <ol className="trace-lines" key={cycle} aria-hidden="true">
        {TRACE.map(([kind, tag, text], i) => (
          <li key={i} className={'t-' + kind} style={{ '--i': i }}><span className="t-tag">{tag}</span><span className="t-text">{text}</span></li>
        ))}
      </ol>
    </figure>
  );
}

function CountUp({ value }) {
  const [ref, inView] = useInView({ threshold: 0.6 });
  const parsed = parseStat(value);
  const [shown, setShown] = useState(() => (parsed && !reducedMotion() ? formatStat(parsed, 0) : value));
  useEffect(() => {
    if (!inView || !parsed || reducedMotion()) { setShown(value); return; }
    let frame, start;
    const step = t => {
      start ??= t;
      const k = Math.min(1, (t - start) / 1300), eased = 1 - Math.pow(1 - k, 4);
      setShown(formatStat(parsed, parsed.number * eased));
      if (k < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inView, value]);
  return <strong ref={ref} aria-label={value}><span aria-hidden="true">{shown}</span></strong>;
}

function Proof({ stats = [], skills = [] }) {
  if (!stats.length && !skills.length) return null;
  return (
    <section className="proof" aria-label="Highlights">
      {stats.length > 0 && (
        <div className="container stats">
          {stats.map((s, i) => (
            <div className="stat" key={s.id} data-reveal style={{ '--d': i * 0.08 + 's' }}>
              <CountUp value={s.value} />
              <span>{s.label}</span>
            </div>
          ))}
        </div>
      )}
      {skills.length > 0 && (
        <div className="marquee">
          <p className="sr-only">Skills: {skills.join(', ')}</p>
          <div className="marquee-track" aria-hidden="true">
            {[0, 1].map(copy => (
              <ul key={copy}>{skills.map((s, i) => <li key={i}>{s}</li>)}</ul>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function SectionHead({ eyebrow, title, children }) {
  return (
    <div className="section-head">
      <div>
        <p className="eyebrow" data-reveal>{eyebrow}</p>
        <h2 data-reveal style={{ '--d': '0.06s' }}>{title}</h2>
      </div>
      {children && <p className="section-note" data-reveal style={{ '--d': '0.12s' }}>{children}</p>}
    </div>
  );
}

// "~55% faster document lookup" → ["~55%", "faster document lookup"], for the featured card's big number.
const bigResult = text => { const m = String(text || '').match(/^(\S*\d\S*)\s+(.+)$/); return m ? [m[1], m[2]] : null; };

const resetTilt = e => { e.currentTarget.style.setProperty('--px', '0'); e.currentTarget.style.setProperty('--py', '0'); };

function Project({ p, i }) {
  const [open, setOpen] = useState(false);
  const big = !p.image && p.featured && bigResult(p.result);
  const paragraphs = (p.details || '').split(/\n\s*\n/).map(x => x.trim()).filter(Boolean);
  const caseId = 'case-' + p.id;
  return (
    <article className={'project' + (p.featured ? ' is-featured' : '') + (open ? ' is-open' : '')} onPointerMove={trackPointer} onPointerLeave={resetTilt} data-reveal style={{ '--d': (i % 2) * 0.08 + 's' }}>
      <div className="project-body">
        <div className="project-meta">
          <span>{String(i + 1).padStart(2, '0')} — {p.category}</span>
          {p.featured && <span className="badge">Featured</span>}
        </div>
        <h3>{p.name}</h3>
        <p>{p.summary}</p>
        {p.result && <p className="result"><span aria-hidden="true">↗</span> {p.result}</p>}
        {p.flow?.length >= 2 && <Flow steps={p.flow} />}
        {paragraphs.length > 0 && (
          <div className="case" id={caseId} inert={!open}>
            <div className="case-inner">{paragraphs.map((t, j) => <p key={j}>{t}</p>)}</div>
          </div>
        )}
        <div className="project-foot">
          <ul className="tags" aria-label="Technologies">{p.tags?.map((t, j) => <li key={j}>{t}</li>)}</ul>
          <div className="project-actions">
            {paragraphs.length > 0 && <button type="button" className="case-toggle" aria-expanded={open} aria-controls={caseId} onClick={() => setOpen(o => !o)}>{open ? 'Close case study' : 'Read case study'} <span aria-hidden="true">+</span></button>}
            {p.link && external(p.link) && <a className="project-link" href={p.link} target="_blank" rel="noopener noreferrer">View project <span aria-hidden="true">↗</span><span className="sr-only"> (opens in a new tab)</span></a>}
          </div>
        </div>
      </div>
      {p.image
        ? <div className="project-shot"><img src={p.image} alt={p.imageAlt || `Screenshot of ${p.name}`} loading="lazy" /></div>
        : big && <div className="project-aside" aria-hidden="true"><CountUp value={big[0]} /><span>{big[1]}</span></div>}
    </article>
  );
}

// Pipeline mini-diagram: nodes joined by links with a pulse travelling along them.
function Flow({ steps }) {
  return (
    <ol className="flow" aria-label={'Pipeline: ' + steps.join(' → ')}>
      {steps.map((s, i) => (
        <li key={i} style={{ '--i': i }}>
          <span className="flow-node">{s}</span>
          {i < steps.length - 1 && <span className="flow-link" aria-hidden="true"><i /></span>}
        </li>
      ))}
    </ol>
  );
}

function Work({ projects = [] }) {
  if (!projects.length) return null;
  return (
    <section className="section container" id="work">
      <SectionHead eyebrow="Selected work" title="Systems with a job to do.">Applied AI and data engineering, each with a measured outcome.</SectionHead>
      <div className="projects">
        {projects.map((p, i) => <Project key={p.id} p={p} i={i} />)}
      </div>
    </section>
  );
}

const STEPS = [
  ['Prepare', 'Parse documents, OCR scanned files, and model the data so every source stays usable and traceable.'],
  ['Retrieve', 'Find the right evidence with hybrid search, metadata and access-aware filtering.'],
  ['Compute', 'Let the model plan and explain; let code compute every number and call every API.'],
  ['Evaluate', 'Held-out questions, reviewers and logs decide what ships, not a good-looking demo.'],
];

function Approach() {
  const ref = useRef(null);
  useScrollProgress(ref);
  return (
    <section className="approach" id="approach">
      <div className="container">
        <SectionHead eyebrow="How I work" title="From raw data to dependable decisions." />
        <ol className="steps" ref={ref}>
          {STEPS.map(([title, text], i) => (
            <li key={title} data-reveal style={{ '--d': i * 0.1 + 's' }}>
              <span className="step-num">{String(i + 1).padStart(2, '0')}</span>
              <h3>{title}</h3>
              <p>{text}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function Timeline({ items = [] }) {
  const ref = useRef(null);
  useScrollProgress(ref);
  return (
    <ol className="timeline" ref={ref}>
      {items.map((item, i) => (
        <li key={item.id} data-reveal style={{ '--d': Math.min(i, 3) * 0.05 + 's' }}>
          <time>{item.period}</time>
          <div className="tl-main">
            <h3>{item.role}</h3>
            <span className="tl-org">{item.company}</span>
            {item.description && <p>{item.description}</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}

function Experience({ data }) {
  return (
    <section className="section container" id="experience">
      <SectionHead eyebrow="Background" title="Experience.">{data.about}</SectionHead>
      <Timeline items={data.experience} />
      {data.education?.length > 0 && (
        <div className="education">
          <p className="eyebrow" data-reveal>Education</p>
          <Timeline items={data.education} />
        </div>
      )}
    </section>
  );
}

const EMPTY = { name: '', email: '', message: '', website: '' };

function Contact({ data, preview }) {
  const [form, setForm] = useState(EMPTY);
  const [state, setState] = useState('idle');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const set = key => e => setForm(f => ({ ...f, [key]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    if (preview) { setError('Draft preview: messages are disabled here.'); return; }
    setState('sending'); setError('');
    try {
      await api('/api/contact', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      setForm(EMPTY); setState('sent');
    } catch (err) { setError(err.message); setState('idle'); }
  }

  async function copy() {
    try { await navigator.clipboard.writeText(data.email); setCopied(true); setTimeout(() => setCopied(false), 2200); } catch { location.href = 'mailto:' + data.email; }
  }

  const links = [data.linkedin && ['LinkedIn', data.linkedin], data.github && ['GitHub', data.github], ...(data.otherLinks || []).map(l => [l.label, l.url])].filter(Boolean);

  return (
    <section className="contact" id="contact">
      <div className="contact-glow" aria-hidden="true" />
      <div className="container contact-layout">
        <div className="contact-copy">
          <p className="eyebrow" data-reveal>Let's talk</p>
          <h2 data-reveal style={{ '--d': '0.06s' }}>{data.contactHeadline}</h2>
          <p data-reveal style={{ '--d': '0.12s' }}>{data.contactText}</p>
          {data.email && (
            <div className="email-row" data-reveal style={{ '--d': '0.18s' }}>
              <a className="email" href={'mailto:' + data.email}>{data.email}</a>
              <button type="button" className="copy-button" onClick={copy}>{copied ? 'Copied ✓' : 'Copy'}</button>
              <span className="sr-only" role="status">{copied ? 'Email address copied' : ''}</span>
            </div>
          )}
          <ul className="socials" data-reveal style={{ '--d': '0.24s' }}>
            {links.map(([label, url]) => <li key={label + url}><a data-magnetic href={url} target="_blank" rel="noopener noreferrer">{label} <span aria-hidden="true">↗</span><span className="sr-only"> (opens in a new tab)</span></a></li>)}
          </ul>
        </div>
        <div className="form-card" data-reveal style={{ '--d': '0.1s' }}>
          {state === 'sent' ? (
            <div className="sent" role="status">
              <svg viewBox="0 0 52 52" aria-hidden="true"><circle cx="26" cy="26" r="24" /><path d="M15 27l7 7 15-16" /></svg>
              <h3>Message sent.</h3>
              <p>Thanks for reaching out. I'll reply to your email soon.</p>
              <button className="button ghost" onClick={() => setState('idle')}>Send another</button>
            </div>
          ) : (
            <form onSubmit={submit}>
              <h3>Send a message</h3>
              <div className="float">
                <input id="c-name" required maxLength="120" autoComplete="name" placeholder=" " value={form.name} onChange={set('name')} />
                <label htmlFor="c-name">Your name</label>
              </div>
              <div className="float">
                <input id="c-email" required type="email" maxLength="254" autoComplete="email" placeholder=" " value={form.email} onChange={set('email')} />
                <label htmlFor="c-email">Email</label>
              </div>
              <div className="float">
                <textarea id="c-msg" required minLength="10" maxLength="3000" rows="5" placeholder=" " value={form.message} onChange={set('message')} />
                <label htmlFor="c-msg">What are you working on?</label>
              </div>
              <div className="honeypot" aria-hidden="true"><label>Website<input tabIndex="-1" autoComplete="off" value={form.website} onChange={set('website')} /></label></div>
              <button className="button primary wide" data-magnetic disabled={state === 'sending'}>{state === 'sending' ? <><span className="spinner" aria-hidden="true" /> Sending…</> : <>Send message <span aria-hidden="true">→</span></>}</button>
              <p className="form-error" role="alert">{error}</p>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}
