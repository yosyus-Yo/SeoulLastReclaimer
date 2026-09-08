import { zoneFor } from './zones.js';

export const BODY_HEIGHT = 1.82, BODY_RADIUS = .3, GRAVITY = 18, JUMP_SPEED = Math.sqrt(2 * GRAVITY * 1.1);
const EPS = 1e-5;
const staticBoxes = new WeakMap();
const overlaps = (x, z, b, radius = 0) => Math.abs(x - b.x) < b.w / 2 + radius && Math.abs(z - b.z) < b.d / 2 + radius;
export function collisionBoxes(zoneId, state) {
  const zone = zoneFor(zoneId);
  // Existing decorative props are intentionally still non-climbable columns.
  if (!staticBoxes.has(zone)) staticBoxes.set(zone, [...zone.obstacles.map(o => ({ base: 0, height: Infinity, ...o })), ...(zone.platforms || [])]);
  const base = staticBoxes.get(zone);
  return zone.doors?.length ? [...base, ...zone.doors.filter(d => !state?.doors?.[d.id])] : base;
}
export function bodyClear(x, y, z, zoneId, radius = BODY_RADIUS, height = BODY_HEIGHT, state) {
  if (![x, y, z].every(Number.isFinite)) return false;
  const b = zoneFor(zoneId).bounds;
  if (x < b.minX + radius || x > b.maxX - radius || z < b.minZ + radius || z > b.maxZ - radius || y < -EPS) return false;
  return !collisionBoxes(zoneId, state).some(o => overlaps(x, z, o, radius) && y < o.height - EPS && y + height > (o.base || 0) + EPS);
}
export function supportAt(x, z, maxY, zoneId, state, radius = BODY_RADIUS) {
  let surface = maxY >= -EPS ? { y: 0, id: 'ground' } : null;
  // Vertical contact must use the SAME footprint as side collision, including wall/post tops.
  // Otherwise an actor can lose support while its body still intersects the solid below it.
  for (const p of collisionBoxes(zoneId, state)) {
    if (Number.isFinite(p.height) && p.height <= maxY + EPS && overlaps(x, z, p, radius) && (!surface || p.height > surface.y)) surface = { y: p.height, id: p.id || 'solid-top', kind: p.kind };
  }
  return surface;
}
export function walkableAt(x, z, y, zoneId, radius = BODY_RADIUS, state) {
  const support = supportAt(x, z, y, zoneId, state, radius);
  return bodyClear(x, y, z, zoneId, radius, BODY_HEIGHT, state) && support && Math.abs(support.y - y) < .02;
}
export function fallDamage(height, maxHp = 120) { return Math.floor(maxHp * Math.min(1, .08 * Math.max(0, height - 3) ** 2)); }
export function recoverPosition(s) {
  const saved = s.lastSafe, spawn = zoneFor(s.zone).spawn;
  const point = saved && walkableAt(saved.x, saved.z, 0, s.zone, BODY_RADIUS, s) ? saved : spawn;
  Object.assign(s, { x: point.x, y: 0, z: point.z, vy: 0, grounded: true, fallPeak: 0, airTime: 0, dash: 0, shield: 0, shieldHp: 0, landTimer: 0, supportId: 'ground', climb: null });
}
export function resolvePenetration(s) {
  if (bodyClear(s.x, s.y, s.z, s.zone, BODY_RADIUS, BODY_HEIGHT, s)) return false;
  s.collisionRepairs = (s.collisionRepairs || 0) + 1;
  const original = { x: s.x, y: s.y, z: s.z }, candidates = [];
  if ([s.x, s.y, s.z].every(Number.isFinite)) {
    const b = zoneFor(s.zone).bounds, skin = .001;
    candidates.push({ x: Math.max(b.minX + BODY_RADIUS, Math.min(b.maxX - BODY_RADIUS, s.x)), y: Math.max(0, s.y), z: Math.max(b.minZ + BODY_RADIUS, Math.min(b.maxZ - BODY_RADIUS, s.z)) });
    for (const box of collisionBoxes(s.zone, s)) {
      if (!overlaps(s.x, s.z, box, BODY_RADIUS) || s.y >= box.height - EPS || s.y + BODY_HEIGHT <= (box.base || 0) + EPS) continue;
      for (const sign of [-1, 1]) {
        candidates.push({ x: box.x + sign * (box.w / 2 + BODY_RADIUS + skin), y: s.y, z: s.z });
        candidates.push({ x: s.x, y: s.y, z: box.z + sign * (box.d / 2 + BODY_RADIUS + skin) });
      }
      if (Number.isFinite(box.height) && box.height - s.y <= .221) candidates.push({ x: s.x, y: box.height, z: s.z });
      const ceiling = (box.base || 0) - BODY_HEIGHT;
      if (ceiling >= 0 && s.y - ceiling <= .221) candidates.push({ x: s.x, y: ceiling, z: s.z });
    }
  }
  const distance = p => Math.hypot(p.x - original.x, p.y - original.y, p.z - original.z);
  const nearest = candidates.filter(p => distance(p) <= 1.5 && bodyClear(p.x, p.y, p.z, s.zone, BODY_RADIUS, BODY_HEIGHT, s)).sort((a,b) => distance(a) - distance(b))[0];
  if (!nearest) { recoverPosition(s); return true; }
  Object.assign(s, nearest); s.climb = null; s.dash = 0;
  const surface = supportAt(s.x, s.z, s.y, s.zone, s);
  s.grounded = !!surface && Math.abs(surface.y - s.y) < EPS;
  if (s.grounded) { s.vy = 0; s.supportId = surface.id; }
  return true;
}
export function updateVertical(s, dt) {
  const bounds = zoneFor(s.zone).bounds;
  if (![s.x, s.y, s.z, s.vy].every(Number.isFinite) || s.y < -20 || s.x < bounds.minX || s.x > bounds.maxX || s.z < bounds.minZ || s.z > bounds.maxZ) { recoverPosition(s); return; }
  s.landTimer = Math.max(0, (s.landTimer || 0) - dt);
  const support = supportAt(s.x, s.z, s.y, s.zone, s);
  if (s.grounded && support && s.y - support.y <= .221 && (support.kind === 'stair' || s.supportId?.startsWith('warehouse-stair'))) s.y = support.y;
  if (s.grounded && support && Math.abs(support.y - s.y) < .02) {
    s.y = support.y; s.vy = 0; s.supportId = support.id; s.airTime = 0;
    if (s.y === 0 && bodyClear(s.x, 0, s.z, s.zone, BODY_RADIUS, BODY_HEIGHT, s)) s.lastSafe = { x: s.x, z: s.z };
    return;
  }
  if (s.grounded) { s.grounded = false; s.fallPeak = s.y; s.airTime = 0; }
  s.airTime = (s.airTime || 0) + dt;
  const before = s.y, velocity = s.vy;
  let next = before + velocity * dt - .5 * GRAVITY * dt * dt;
  s.vy -= GRAVITY * dt;
  if (next > before) {
    for (const box of collisionBoxes(s.zone, s)) {
      const ceiling = (box.base || 0) - BODY_HEIGHT;
      if (overlaps(s.x, s.z, box, BODY_RADIUS) && before <= ceiling + EPS && next > ceiling) { next = ceiling; s.vy = 0; }
    }
  }
  s.fallPeak = Math.max(s.fallPeak || 0, before, next);
  const landing = next <= before ? supportAt(s.x, s.z, before, s.zone, s) : null;
  if (landing && next <= landing.y + EPS) {
    s.y = landing.y; s.vy = 0; s.grounded = true; s.supportId = landing.id; s.airTime = 0;
    const height = Math.max(0, s.fallPeak - s.y), damage = zoneFor(s.zone).safe ? 0 : fallDamage(height);
    s.landTimer = height > 3 ? .35 : .16;
    s.hp = Math.max(0, s.hp - damage); s.hurtFlash = damage > 0 ? .22 : s.hurtFlash;
    s.landingCount = (s.landingCount || 0) + 1;
    s.landingEvent = { type: 'land', x: s.x, y: s.y, z: s.z, height, damage };
    if (s.hp === 0) { s.dead = true; s.dash = 0; s.shield = 0; s.shieldHp = 0; }
    s.fallPeak = s.y;
  } else s.y = next;
}
