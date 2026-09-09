import { tick } from './simulation.js';
import { zoneFor } from './zones.js';
import { walkableAt, collisionBoxes, BODY_HEIGHT } from './collision-world.js';

const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function segmentClear(a, b, radius = .3, zoneId = a.zone || 'logistics', state = a.doors ? a : b.doors ? b : undefined) {
  return segmentChecker(zoneId, state, radius)(a, b);
}

// Compile the ground-level collision slice once per route, not twice per sample.
// Keep the original 8 cm samples (and elevated support checks) so narrow gaps,
// open doors and platform edges retain exactly the same navigation semantics.
function segmentChecker(zoneId, state, radius = .3) {
  const bounds = zoneFor(zoneId).bounds;
  const boxes = collisionBoxes(zoneId, state).filter(o => o.height > 1e-5 && BODY_HEIGHT > (o.base || 0) + 1e-5);
  return (a, b) => {
  const y = a.y || 0;
  if (Math.abs(y - (b.y || 0)) > .02) return false;
  const steps = Math.max(1, Math.ceil(distance(a, b) / .08));
  if (y === 0) {
    if (![a.x, a.z, b.x, b.z].every(Number.isFinite)) return false;
    const minX = Math.min(a.x, b.x), maxX = Math.max(a.x, b.x), minZ = Math.min(a.z, b.z), maxZ = Math.max(a.z, b.z);
    if (minX < bounds.minX + radius || maxX > bounds.maxX - radius || minZ < bounds.minZ + radius || maxZ > bounds.maxZ - radius) return false;
    for (const box of boxes) {
      const halfX = box.w / 2 + radius, halfZ = box.d / 2 + radius;
      if (maxX <= box.x - halfX || minX >= box.x + halfX || maxZ <= box.z - halfZ || minZ >= box.z + halfZ) continue;
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        if (Math.abs(a.x + (b.x - a.x) * t - box.x) < halfX && Math.abs(a.z + (b.z - a.z) * t - box.z) < halfZ) return false;
      }
    }
    return true;
  }
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    if (!walkableAt(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t, y, zoneId, radius, state)) return false;
  }
  return true;
  };
}

export function nearestWalkablePoint(point, zoneId = 'logistics', state) {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.z)) return null;
  const zone = zoneFor(zoneId), b = zone.bounds, y = point.y || 0;
  const obstacles = [...zone.obstacles, ...(zone.platforms || []), ...(zone.doors || []).filter(d => !state?.doors?.[d.id])];
  const p = { x: clamp(point.x, b.minX + .35, b.maxX - .35), z: clamp(point.z, b.minZ + .35, b.maxZ - .35) };
  if (y) p.y = y;
  if (walkableAt(p.x, p.z, y, zoneId, .3, state)) return p;
  const candidates = [];
  for (const o of obstacles) {
    const left = o.x - o.w / 2 - .34, right = o.x + o.w / 2 + .34;
    const top = o.z - o.d / 2 - .34, bottom = o.z + o.d / 2 + .34;
    candidates.push({ x: left, z: clamp(p.z, top, bottom) }, { x: right, z: clamp(p.z, top, bottom) },
      { x: clamp(p.x, left, right), z: top }, { x: clamp(p.x, left, right), z: bottom });
  }
  if (y) candidates.forEach(p => { p.y = y; });
  return candidates.filter(p => walkableAt(p.x, p.z, y, zoneId, .3, state)).sort((a, b) => distance(a, p) - distance(b, p))[0] ?? null;
}

// Visibility graph around the four expanded obstacle corners. Clearance matches the player radius.
export function findPath(start, requested) {
  const zoneId = start.zone || 'logistics', zone = zoneFor(zoneId), y = start.y || 0;
  if (start.grounded === false || Math.abs(y - (requested.y || 0)) > .02) return [];
  // The training room has one ground-level doorway: don't search a sealed room graph.
  if (zone.building && y < .1 && zone.doors.every(d => !start.doors?.[d.id])) {
    const b = zone.building, inside = p => p.x > b.minX && p.x < b.maxX && p.z > b.minZ && p.z < b.maxZ;
    if (inside(start) !== inside(requested)) return [];
  }
  const obstacles = [...zone.obstacles, ...(zone.platforms || []), ...(zone.doors || []).filter(d => !start.doors?.[d.id])];
  const goal = nearestWalkablePoint(requested, zoneId, start);
  if (!goal || !walkableAt(start.x, start.z, y, zoneId, .3, start) || distance(start, goal) < .04) return [];
  const clear = segmentChecker(zoneId, start);
  if (clear(start, goal)) return [goal];
  const points = [{ x: start.x, z: start.z, ...(y ? { y } : {}) }, goal];
  for (const o of obstacles) for (const x of [-1, 1]) for (const z of [-1, 1]) {
    const p = { x: o.x + x * (o.w / 2 + .34), z: o.z + z * (o.d / 2 + .34) };
    if (y) p.y = y;
    if (walkableAt(p.x, p.z, y, zoneId, .3, start)) points.push(p);
  }
  const costs = points.map(() => Infinity), previous = points.map(() => -1), visited = new Set();
  costs[0] = 0;
  while (visited.size < points.length) {
    let at = -1;
    for (let i = 0; i < points.length; i++) if (!visited.has(i) && (at === -1 || costs[i] < costs[at])) at = i;
    if (at === -1 || !Number.isFinite(costs[at])) return [];
    if (at === 1) break;
    visited.add(at);
    for (let i = 0; i < points.length; i++) {
      if (visited.has(i) || !clear(points[at], points[i])) continue;
      const cost = costs[at] + distance(points[at], points[i]);
      if (cost < costs[i]) { costs[i] = cost; previous[i] = at; }
    }
  }
  if (previous[1] < 0) return [];
  const path = [];
  for (let i = 1; i !== 0; i = previous[i]) path.unshift(points[i]);
  return path;
}

export function followPath(state, path, dt, running = false) {
  if (state.grounded === false || (path.length && Math.abs((state.y || 0) - (path[0].y || 0)) > .02)) path.length = 0;
  while (path.length && distance(state, path[0]) < .04) path.shift();
  if (!path.length) return tick(state, dt, { x: 0, z: 0 }, running);
  const next = path[0], d = distance(state, next), step = (running ? 4.4 : 2.65) * Math.min(.05, Math.max(0, dt));
  if (step === 0) return false;
  const strength = Math.min(1, d / step);
  const before = { x: state.x, z: state.z };
  const moving = tick(state, dt, { x: (next.x - state.x) / d * strength, z: (next.z - state.z) / d * strength }, running);
  if (distance(state, next) < 1e-8) { state.x = next.x; state.z = next.z; }
  if (distance(state, next) < .04) path.shift();
  else if (distance(before, state) < .00001 && state.dash === 0) path.length = 0;
  return moving;
}
