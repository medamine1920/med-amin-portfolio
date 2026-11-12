// Pure 2D geometry for Parker's flashlight. Matrices use the SVG/DOMMatrix 2D form {a,b,c,d,e,f}:
//   x' = a·x + c·y + e,   y' = b·x + d·y + f
// No DOM access here, so it can be unit-tested in Node.

export const identity = () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
export const translate = (x, y) => ({ a: 1, b: 0, c: 0, d: 1, e: x, f: y });
export const scale = (sx, sy = sx) => ({ a: sx, b: 0, c: 0, d: sy, e: 0, f: 0 });
export const rotate = (deg, cx = 0, cy = 0) => {
  const r = deg * Math.PI / 180, cos = Math.cos(r), sin = Math.sin(r);
  return multiply(translate(cx, cy), multiply({ a: cos, b: sin, c: -sin, d: cos, e: 0, f: 0 }, translate(-cx, -cy)));
};

// multiply(m1, m2): apply m2 first, then m1 (same order as DOMMatrix m1.multiply(m2)).
export function multiply(m1, m2) {
  return {
    a: m1.a * m2.a + m1.c * m2.b,
    b: m1.b * m2.a + m1.d * m2.b,
    c: m1.a * m2.c + m1.c * m2.d,
    d: m1.b * m2.c + m1.d * m2.d,
    e: m1.a * m2.e + m1.c * m2.f + m1.e,
    f: m1.b * m2.e + m1.d * m2.f + m1.f,
  };
}
export const chain = (...ms) => ms.reduce((acc, m) => multiply(acc, m), identity());

export function invert(m) {
  const det = m.a * m.d - m.b * m.c;
  if (!det) throw new Error('Matrix is not invertible');
  return {
    a: m.d / det, b: -m.b / det, c: -m.c / det, d: m.a / det,
    e: (m.c * m.f - m.d * m.e) / det, f: (m.b * m.e - m.a * m.f) / det,
  };
}

export const apply = (m, p) => ({ x: m.a * p.x + m.c * p.y + m.e, y: m.b * p.x + m.d * p.y + m.f });

// Maps SVG user units of an <svg> with a viewBox (0 0 vbW vbH) to the viewport, given its untransformed
// layout box and its CSS transform (e.g. the scaleX(-1) mirror, possibly mid-transition). CSS transforms on
// the <svg> box use transform-origin 50% 50%.
export function svgRootToScreen(box, css, vbW, vbH) {
  const ox = box.width / 2, oy = box.height / 2;
  return chain(
    translate(box.left, box.top),
    translate(ox, oy), css || identity(), translate(-ox, -oy),
    scale(box.width / vbW, box.height / vbH),
  );
}

const angleOf = (from, to) => Math.atan2(to.y - from.y, to.x - from.x) * 180 / Math.PI;
const normalize = deg => ((deg + 540) % 360) - 180;

// Rotation (degrees, around `grip`) that makes the grip→lens axis point at `target`. All in one local frame.
export const rotationToAim = (grip, lens, target) => normalize(angleOf(grip, target) - angleOf(grip, lens));

// Rotation for a limb that hangs straight down (+y) from `pivot`, so it points toward `target`.
export const limbRotationToward = (pivot, target) => normalize(angleOf(pivot, target) - 90);

// Spotlight ellipse sized to a rendered text line (a DOMRect-like box), with a little padding.
export function spotFromRect(r, padX = 10, padY = 6) {
  return { cx: r.left + r.width / 2, cy: r.top + r.height / 2, rx: r.width / 2 + padX, ry: r.height / 2 + padY };
}

// Distance from an ellipse's centre to its edge along the unit direction (ux, uy).
export const ellipseRadiusAlong = (rx, ry, ux, uy) => 1 / Math.sqrt((ux / rx) ** 2 + (uy / ry) ** 2);

// Cone from the lens (its two edge points) to the spotlight: the far side is the ellipse's width
// perpendicular to the beam, so the cone's spread matches the spot. Returns 4 points in drawing order.
export function beamPolygon(lensA, lensB, spot) {
  const lens = { x: (lensA.x + lensB.x) / 2, y: (lensA.y + lensB.y) / 2 };
  const dx = spot.cx - lens.x, dy = spot.cy - lens.y, len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len, ny = dx / len;                          // unit normal to the beam
  const r = ellipseRadiusAlong(spot.rx, spot.ry, nx, ny);
  const far1 = { x: spot.cx + nx * r, y: spot.cy + ny * r }, far2 = { x: spot.cx - nx * r, y: spot.cy - ny * r };
  // Pair each lens edge with the far point on the same side so the polygon never self-intersects.
  const sideA = (lensA.x - lens.x) * nx + (lensA.y - lens.y) * ny;
  return sideA >= 0 ? [lensA, far1, far2, lensB] : [lensB, far1, far2, lensA];
}

// Parses a computed CSS transform ("none", "matrix(a, b, c, d, e, f)") into a 2D matrix.
export function parseCssMatrix(value) {
  if (!value || value === 'none') return identity();
  const m = value.match(/^matrix\(([^)]+)\)$/);
  if (!m) return identity();
  const [a, b, c, d, e, f] = m[1].split(',').map(Number);
  return { a, b, c, d, e, f };
}
