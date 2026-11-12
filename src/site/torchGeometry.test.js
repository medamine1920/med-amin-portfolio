import test from 'node:test';
import assert from 'node:assert/strict';
import { apply, beamPolygon, chain, ellipseRadiusAlong, invert, limbRotationToward, multiply, parseCssMatrix, rotate, rotationToAim, scale, spotFromRect, svgRootToScreen, translate } from './torchGeometry.js';

const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);
const closeP = (p, q, eps = 1e-6) => { close(p.x, q.x, eps); close(p.y, q.y, eps); };
const GRIP = { x: 54, y: 174 }, LENS = { x: 54, y: 150 };

test('inverse matrices undo scaled, rotated, mirrored transforms', () => {
  const m = chain(translate(300, 120), rotate(37, 10, 20), scale(-0.75, 0.75));
  for (const p of [{ x: 0, y: 0 }, { x: 54, y: 150 }, { x: -12, y: 400 }]) closeP(apply(invert(m), apply(m, p)), p);
});

test('svg root mapping handles responsive scale and the mirrored pose', () => {
  const box = { left: 1000, top: 600, width: 120, height: 202.5 };       // 160x270 viewBox rendered at 120px
  const plain = svgRootToScreen(box, null, 160, 270);
  closeP(apply(plain, { x: 0, y: 0 }), { x: 1000, y: 600 });
  closeP(apply(plain, { x: 160, y: 270 }), { x: 1120, y: 802.5 });
  const mirrored = svgRootToScreen(box, parseCssMatrix('matrix(-1, 0, 0, 1, 0, 0)'), 160, 270);
  closeP(apply(mirrored, { x: 0, y: 0 }), { x: 1120, y: 600 });           // left edge maps to the right edge
  closeP(apply(mirrored, { x: 54, y: 174 }), { x: 1120 - 54 * 0.75, y: 600 + 174 * 0.75 });
  // Mid-turn (scaleX animating through 0.5) is still exact.
  const half = svgRootToScreen(box, parseCssMatrix('matrix(0.5, 0, 0, 1, 0, -3)'), 160, 270);
  closeP(apply(half, { x: 80, y: 0 }), { x: 1060, y: 597 });
});

test('rotationToAim points the grip→lens axis at the target, in any frame', () => {
  for (const target of [{ x: 300, y: 40 }, { x: -80, y: 120 }, { x: 54, y: 400 }, { x: 54.0001, y: -10 }]) {
    const rot = rotationToAim(GRIP, LENS, target);
    const lens = apply(rotate(rot, GRIP.x, GRIP.y), LENS);
    const want = Math.atan2(target.y - GRIP.y, target.x - GRIP.x), got = Math.atan2(lens.y - GRIP.y, lens.x - GRIP.x);
    close(Math.cos(want), Math.cos(got)); close(Math.sin(want), Math.sin(got));
  }
});

test('aiming through a parent transform (rotated forearm, mirrored, scaled) hits the screen target', () => {
  const box = { left: 200, top: 300, width: 84, height: 141.75 };
  const root = svgRootToScreen(box, parseCssMatrix('matrix(-1, 0, 0, 1, 0, 0)'), 160, 270);
  const forearm = chain(translate(0, 30), rotate(-40, 54, 112), rotate(25, 54, 140));   // body offset + arm + elbow
  const parentToScreen = multiply(root, forearm);
  const targetScreen = { x: 40, y: 120 };
  const rot = rotationToAim(GRIP, LENS, apply(invert(parentToScreen), targetScreen));
  const torchToScreen = multiply(parentToScreen, rotate(rot, GRIP.x, GRIP.y));
  const grip = apply(torchToScreen, GRIP), lens = apply(torchToScreen, LENS);
  // The lens lies on the screen line from the grip to the target, between them.
  const cross = (lens.x - grip.x) * (targetScreen.y - grip.y) - (lens.y - grip.y) * (targetScreen.x - grip.x);
  close(cross, 0, 1e-6);
  assert.ok(Math.hypot(targetScreen.x - lens.x, targetScreen.y - lens.y) < Math.hypot(targetScreen.x - grip.x, targetScreen.y - grip.y));
});

test('limbs hanging down rotate toward targets', () => {
  close(limbRotationToward({ x: 0, y: 0 }, { x: 0, y: 10 }), 0);
  close(limbRotationToward({ x: 0, y: 0 }, { x: 10, y: 0 }), -90);
  close(limbRotationToward({ x: 0, y: 0 }, { x: -10, y: 0 }), 90);
});

test('beam starts at the lens edges and spreads to the spotlight width', () => {
  const spot = spotFromRect({ left: 100, top: 50, width: 80, height: 20 });
  assert.deepEqual(spot, { cx: 140, cy: 60, rx: 50, ry: 16 });
  const a = { x: 400, y: 410 }, b = { x: 400, y: 390 };
  const poly = beamPolygon(a, b, spot);
  assert.equal(poly.length, 4);
  assert.ok([a, b].includes(poly[0]) && [a, b].includes(poly[3]) && poly[0] !== poly[3]);
  const half = Math.hypot(poly[1].x - poly[2].x, poly[1].y - poly[2].y) / 2;
  const dx = spot.cx - 400, dy = spot.cy - 400, len = Math.hypot(dx, dy);
  close(half, ellipseRadiusAlong(spot.rx, spot.ry, -dy / len, dx / len));
  closeP({ x: (poly[1].x + poly[2].x) / 2, y: (poly[1].y + poly[2].y) / 2 }, { x: spot.cx, y: spot.cy });
  // Same-side pairing: the quadrilateral's sides don't cross.
  const side = (p, q, r) => Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x));
  assert.equal(side(poly[0], poly[1], poly[3]), side(poly[0], poly[1], poly[2]));
});

test('ellipse radius along the axes', () => {
  close(ellipseRadiusAlong(50, 16, 1, 0), 50);
  close(ellipseRadiusAlong(50, 16, 0, 1), 16);
});
