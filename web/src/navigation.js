import { free, tick } from './simulation.js';
import { zoneFor } from './zones.js';

const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function segmentClear(a, b, radius = .3, zoneId = a.zone || 'logistics') {
  const steps = Math.max(1, Math.ceil(distance(a, b) / .08));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    if (!free(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t, radius, zoneId)) return false;
  }
  return true;
}

export function nearestWalkablePoint(point, zoneId = 'logistics') {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.z)) return null;
  const { bounds: b, obstacles } = zoneFor(zoneId);
  const p = { x: clamp(point.x, b.minX + .35, b.maxX - .35), z: clamp(point.z, b.minZ + .35, b.maxZ - .35) };
  if (free(p.x, p.z, .3, zoneId)) return p;
  const candidates = [];
  for (const o of obstacles) {
    const left = o.x - o.w / 2 - .34, right = o.x + o.w / 2 + .34;
    const top = o.z - o.d / 2 - .34, bottom = o.z + o.d / 2 + .34;
    candidates.push({ x: left, z: clamp(p.z, top, bottom) }, { x: right, z: clamp(p.z, top, bottom) },
      { x: clamp(p.x, left, right), z: top }, { x: clamp(p.x, left, right), z: bottom });
  }
  return candidates.filter(p => free(p.x, p.z, .3, zoneId)).sort((a, b) => distance(a, p) - distance(b, p))[0] ?? null;
}

// Visibility graph around the four expanded obstacle corners. Clearance matches the player radius.
export function findPath(start, requested) {
  const zoneId = start.zone || 'logistics', { obstacles } = zoneFor(zoneId);
  const goal = nearestWalkablePoint(requested, zoneId);
  if (!goal || !free(start.x, start.z, .3, zoneId) || distance(start, goal) < .04) return [];
  if (segmentClear(start, goal, .3, zoneId)) return [goal];
  const points = [{ x: start.x, z: start.z }, goal];
  for (const o of obstacles) for (const x of [-1, 1]) for (const z of [-1, 1]) {
    const p = { x: o.x + x * (o.w / 2 + .34), z: o.z + z * (o.d / 2 + .34) };
    if (free(p.x, p.z, .3, zoneId)) points.push(p);
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
      if (visited.has(i) || !segmentClear(points[at], points[i], .3, zoneId)) continue;
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
  while (path.length && distance(state, path[0]) < .04) path.shift();
  if (!path.length) return tick(state, dt, { x: 0, z: 0 }, running);
  const next = path[0], d = distance(state, next), step = (running ? 4.4 : 2.65) * Math.min(.05, Math.max(0, dt));
  if (step === 0) return false;
  const strength = Math.min(1, d / step);
  const before = { x: state.x, z: state.z };
  const moving = tick(state, dt, { x: (next.x - state.x) / d * strength, z: (next.z - state.z) / d * strength }, running);
  if (distance(state, next) < .04) path.shift();
  else if (distance(before, state) < .00001 && state.dash === 0) path.length = 0;
  return moving;
}
