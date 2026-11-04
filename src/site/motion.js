import { useEffect, useRef, useState } from 'react';

export const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

// Adds .is-in to every [data-reveal] element inside root once it scrolls into view.
export function useReveal(root, deps = []) {
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const items = [...el.querySelectorAll('[data-reveal]:not(.is-in)')];
    if (reducedMotion() || !('IntersectionObserver' in window)) { items.forEach(x => x.classList.add('is-in')); return; }
    const io = new IntersectionObserver(entries => {
      for (const e of entries) if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });
    items.forEach(x => io.observe(x));
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

export function useInView(options = { threshold: 0.3 }) {
  const ref = useRef(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!('IntersectionObserver' in window)) { setInView(true); return; }
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setInView(true); io.disconnect(); } }, options);
    io.observe(el);
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return [ref, inView];
}

// Sets --mx / --my (px inside the element) and --px / --py (-1..1) for pointer-driven effects.
export function trackPointer(e) {
  const el = e.currentTarget, r = el.getBoundingClientRect();
  const x = e.clientX - r.left, y = e.clientY - r.top;
  el.style.setProperty('--mx', x + 'px');
  el.style.setProperty('--my', y + 'px');
  el.style.setProperty('--px', ((x / r.width) * 2 - 1).toFixed(3));
  el.style.setProperty('--py', ((y / r.height) * 2 - 1).toFixed(3));
}

// "~55%" → {prefix:'~', number:55, decimals:0, suffix:'%'}; null when there is no number to animate.
export function parseStat(value) {
  const m = String(value ?? '').match(/^(\D*?)(\d[\d,]*(?:\.\d+)?)(.*)$/);
  if (!m) return null;
  const raw = m[2].replace(/,/g, '');
  return { prefix: m[1], number: Number(raw), decimals: (raw.split('.')[1] || '').length, suffix: m[3], grouped: m[2].includes(',') };
}

export function formatStat(p, n) {
  const fixed = n.toFixed(p.decimals);
  const shown = p.grouped ? Number(fixed).toLocaleString('en-US', { minimumFractionDigits: p.decimals }) : fixed;
  return p.prefix + shown + p.suffix;
}

// Scroll progress (0..1) of an element through the viewport, written to --progress.
export function useScrollProgress(ref) {
  useEffect(() => {
    const el = ref.current;
    if (!el || reducedMotion()) { el?.style.setProperty('--progress', '1'); return; }
    let frame = 0;
    const update = () => {
      frame = 0;
      const r = el.getBoundingClientRect(), vh = innerHeight;
      const p = Math.min(1, Math.max(0, (vh * 0.75 - r.top) / (r.height || 1)));
      el.style.setProperty('--progress', p.toFixed(3));
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(update); };
    update();
    addEventListener('scroll', onScroll, { passive: true });
    addEventListener('resize', onScroll);
    return () => { removeEventListener('scroll', onScroll); removeEventListener('resize', onScroll); cancelAnimationFrame(frame); };
  }, [ref]);
}
