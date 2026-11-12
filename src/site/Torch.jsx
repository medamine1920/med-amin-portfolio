import React, { useEffect, useRef } from 'react';
import { apply, beamPolygon, invert, limbRotationToward, rotationToAim, spotFromRect } from './torchGeometry.js';

// Parker's dark-mode flashlight. Every animation frame it reads the avatar's real transforms (the mirrored
// <svg>, breathing body, arm and elbow joints) and:
//   1. turns the left arm toward the highlighted word (CSS variable --torch-arm, smoothed by CSS),
//   2. rotates the flashlight around its grip so the lens points exactly at the word,
//   3. draws a warm cone from the lens edges to a spotlight sized to the rendered text line.
// Drawing coordinates (SVG units, verified against the drawing): grip = hand centre (54,174),
// lens centre (54,150), lens edges (44,150) and (64,150). Shoulder pivot (54,112).

const GRIP = { x: 54, y: 174 }, LENS = { x: 54, y: 150 }, LENS_A = { x: 44, y: 150 }, LENS_B = { x: 64, y: 150 };
const SHOULDER = { x: 54, y: 112 };
const SWITCH_MS = 4500, REFRESH_MS = 1000, SWEEP_MS = 1100, REST = `rotate(180 ${GRIP.x} ${GRIP.y})`;

// What is worth lighting in each section, in order of preference.
const TARGETS = {
  top: ['.headline .word-inner.accent', '.headline .word-inner', '.hero-actions .button.primary'],
  proof: ['.stat strong'],
  work: ['.pdetail h3', '.side-stat strong', '.pdetail-links .button', '.pcard-title', '.pcard .result', '.pills-tech li', '.pcard-actions .button'],
  approach: ['.steps h3'],
  experience: ['.timeline h3', '.tl-org'],
  contact: ['.contact h2', '.email', '.form-card .button.primary'],
};

const toMatrix = m => ({ a: m.a, b: m.b, c: m.c, d: m.d, e: m.e, f: m.f });

export default function Torch({ svgRef, avatarRef, dark, active, section, reducedMotion }) {
  const overlay = useRef(null), cone = useRef(null), spot = useRef(null), coneGrad = useRef(null), glow = useRef(null);

  useEffect(() => {
    const svg = svgRef.current;
    const torch = svg?.querySelector('.av-torch');
    if (!svg || !torch) return;
    const hide = () => { if (overlay.current) overlay.current.style.visibility = 'hidden'; };
    if (!dark || !active) { torch.setAttribute('transform', REST); svg.style.removeProperty('--torch-arm'); hide(); return; }

    const body = svg.querySelector('.av-body'), fore = svg.querySelector('.av-fore-l');
    let raf = 0, candidates = [], refreshAt = 0, switchAt = 0, index = -1, current = null, shown = null, prev = null, sweepStart = 0;
    const header = () => document.querySelector('.header')?.getBoundingClientRect().bottom || 0;
    const light = el => { if (current && current !== el) current.classList.remove('av-lit'); current = el; el?.classList.add('av-lit'); };

    // The first visible, unobstructed line of rendered text inside an element (not the whole block).
    function visibleLine(el) {
      if (!el.isConnected || el.closest('[data-reveal]:not(.is-in), [inert], .av, .ai')) return null;
      const range = document.createRange(); range.selectNodeContents(el);
      const top = header() + 6, vw = document.documentElement.clientWidth, av = avatarRef.current?.getBoundingClientRect();
      for (const r of range.getClientRects()) {
        if (r.width < 6 || r.height < 6 || r.top < top || r.bottom > innerHeight - 6 || r.left < 4 || r.right > vw - 4) continue;
        if (av && r.right > av.left - 8 && r.left < av.right + 8 && r.bottom > av.top - 8 && r.top < av.bottom) continue;
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        if (!hit || !(hit === el || el.contains(hit) || hit.contains(el))) continue;   // clipped or covered
        return r;
      }
      return null;
    }
    const collect = () => (TARGETS[section] || []).flatMap(sel => [...document.querySelectorAll(sel)]).filter((el, i, all) => all.indexOf(el) === i && visibleLine(el));

    function frame(t) {
      raf = requestAnimationFrame(frame);

      if (t >= refreshAt) { candidates = collect(); refreshAt = t + REFRESH_MS; }
      let line = current && visibleLine(current);
      if (!line || (!reducedMotion && t >= switchAt)) {
        let next = null;
        for (let k = 1; k <= candidates.length && !next; k++) { const el = candidates[(index + k) % candidates.length]; const r = visibleLine(el); if (r) { next = el; line = r; index = (index + k) % candidates.length; } }
        if (!next) { light(null); hide(); torch.setAttribute('transform', REST); svg.style.removeProperty('--torch-arm'); return; }
        if (current && current !== next) { prev = current; sweepStart = t; }
        light(next); switchAt = t + SWITCH_MS;
      }
      const goal = spotFromRect(line);
      // Sweep slowly from the previous word to the new one. Both ends are measured live every frame, so the
      // beam never lags behind scrolling; with reduced motion it jumps straight to the word.
      const prevLine = prev && !reducedMotion && visibleLine(prev);
      const p = prevLine ? Math.min(1, (t - sweepStart) / SWEEP_MS) : 1;
      const e = p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2;
      if (p >= 1) prev = null;
      const from = prevLine ? spotFromRect(prevLine) : goal;
      shown = { cx: from.cx + (goal.cx - from.cx) * e, cy: from.cy + (goal.cy - from.cy) * e, rx: from.rx + (goal.rx - from.rx) * e, ry: from.ry + (goal.ry - from.ry) * e };
      const target = { x: shown.cx, y: shown.cy };

      // getScreenCTM() maps each element's SVG units to the viewport, including the responsive viewBox scale,
      // the mirrored/animated CSS transform on the <svg> and every joint's live CSS transform. (Checked against
      // rendered positions: getCTM() alone stops at the svg viewport and would double-count the scale.)

      // 1) Arm toward the target, in the arm's parent (body) frame. Slightly under-aimed so it looks relaxed.
      const bodyToScreen = toMatrix(body.getScreenCTM());
      const armDeg = Math.max(-150, Math.min(150, limbRotationToward(SHOULDER, apply(invert(bodyToScreen), target)) * 0.85));
      svg.style.setProperty('--torch-arm', armDeg.toFixed(2) + 'deg');

      // 2) Flashlight around its grip, in the forearm frame (includes whatever the arm/elbow look like right now).
      const foreToScreen = toMatrix(fore.getScreenCTM());
      const rot = rotationToAim(GRIP, LENS, apply(invert(foreToScreen), target));
      torch.setAttribute('transform', `rotate(${rot.toFixed(3)} ${GRIP.x} ${GRIP.y})`);

      // 3) Beam from the transformed lens (not a bounding box), converted into the overlay's own coordinates.
      const torchToScreen = toMatrix(torch.getScreenCTM());
      const ov = overlay.current, toOverlay = invert(toMatrix(ov.getScreenCTM()));
      const P = p => apply(toOverlay, apply(torchToScreen, p));
      const a = P(LENS_A), b = P(LENS_B), lens = P(LENS);
      const c = apply(toOverlay, { x: shown.cx, y: shown.cy });
      const s = { cx: c.x, cy: c.y, rx: shown.rx, ry: shown.ry };
      cone.current.setAttribute('points', beamPolygon(a, b, s).map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' '));
      for (const [k, v] of [['x1', lens.x], ['y1', lens.y], ['x2', s.cx], ['y2', s.cy]]) coneGrad.current.setAttribute(k, v.toFixed(1));
      for (const [k, v] of [['cx', s.cx], ['cy', s.cy], ['rx', s.rx], ['ry', s.ry]]) spot.current.setAttribute(k, v.toFixed(1));
      for (const [k, v] of [['cx', lens.x], ['cy', lens.y]]) glow.current.setAttribute(k, v.toFixed(1));
      ov.style.visibility = 'visible';
    }
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      light(null); hide();
      torch.setAttribute('transform', REST);
      svg.style.removeProperty('--torch-arm');
    };
  }, [svgRef, avatarRef, dark, active, section, reducedMotion]);

  if (!dark) return null;
  return (
    <svg ref={overlay} className="torch-overlay" aria-hidden="true" style={{ visibility: 'hidden' }}>
      <defs>
        <linearGradient id="torch-cone" ref={coneGrad} gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#ffd89a" stopOpacity="0.42" />
          <stop offset="1" stopColor="#ffcf86" stopOpacity="0.1" />
        </linearGradient>
        <radialGradient id="torch-spot">
          <stop offset="0" stopColor="#ffdca0" stopOpacity="0.32" />
          <stop offset="0.7" stopColor="#ffd08a" stopOpacity="0.14" />
          <stop offset="1" stopColor="#ffd08a" stopOpacity="0" />
        </radialGradient>
      </defs>
      <polygon ref={cone} className="torch-cone" fill="url(#torch-cone)" />
      <ellipse ref={spot} className="torch-spot" fill="url(#torch-spot)" />
      <circle ref={glow} className="torch-glow" r="7" />
    </svg>
  );
}
