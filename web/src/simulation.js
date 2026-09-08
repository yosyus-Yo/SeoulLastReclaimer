import { zoneFor } from './zones.js';
import { bodyClear, updateVertical, supportAt, JUMP_SPEED, resolvePenetration } from './collision-world.js';
import { updateClimb } from './traversal.js';
export const nodes = zoneFor().nodes, anchor = zoneFor().anchor, firstAid = zoneFor().aid, obstacles = zoneFor().obstacles;
export function initialState(zoneId = 'logistics', story = false) {
  const zone = zoneFor(zoneId);
  return { ...zone.spawn, y: 0, vy: 0, grounded: true, fallPeak: 0, airTime: 0, landTimer: 0, landingCount: 0, landingEvent: null, supportId: 'ground', lastSafe: { ...zone.spawn },
    zone: zone.id, story, exploring: !!zone.training, hp: 120, dead: false, energy: 30, recovered: zone.nodes.map(() => false), complete: false,
    doors: Object.fromEntries((zone.doors || []).map(d => [d.id, false])), climb: null, climbCooldown: 0, collisionRepairs: 0,
    shield: 0, shieldHp: 0, guardX: 0, guardZ: -1, shieldCooldown: 0, dash: 0, dashCooldown: 0, dx: 0, dz: -1,
    attackCooldown: 0, attackPose: 0, hurtFlash: 0, aidUsed: false, kills: 0, drops: [],
    missionPhase: 'scan', supports: [false, false], evacuation: 0, rescued: 0,
    enemies: zone.enemies.map(e => ({ ...e, zone: zone.id, hp: e.kind === 'chaser' ? 60 : 90, maxHp: e.kind === 'chaser' ? 60 : 90,
        phase: 'idle', timer: 0, hitFlash: 0, aimX: 0, aimZ: 0, hit: false })),
    props: zone.props.map(p => ({ ...p })),
  };
}
export function free(x, z, radius = .3, zoneId = 'logistics', y = 0, state) { return bodyClear(x, y, z, zoneId, radius, 1.82, state); }
function horizontalStep(s, x, z) {
  if (free(x, z, .3, s.zone, s.y || 0, s)) { s.x = x; s.z = z; return; }
  if (!s.grounded) return;
  const stair = supportAt(x, z, s.y + .221, s.zone, s);
  if (stair?.kind === 'stair' && stair.y >= s.y && free(x, z, .3, s.zone, stair.y, s)) { s.x = x; s.z = z; s.y = stair.y; s.supportId = stair.id; }
}
export function move(s, dx, dz) {
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / .12));
  for (let i = 0; i < steps; i++) { horizontalStep(s, s.x + dx / steps, s.z); horizontalStep(s, s.x, s.z + dz / steps); }
}
export function tick(s, dt, movement, running = false) {
  if (s.dead) return false;
  dt = Math.min(.05, Math.max(0, dt));
  if (dt === 0) return false;
  resolvePenetration(s);
  let moving = false;
  const steps = Math.max(1, Math.ceil(dt * 120));
  for (let i = 0; i < steps && !s.dead; i++) {
    s.climbCooldown = Math.max(0, (s.climbCooldown || 0) - dt / steps);
    if (s.climb) { moving = updateClimb(s, dt / steps, movement) || moving; continue; }
    moving = stepMovement(s, dt / steps, movement, running) || moving;
    updateVertical(s, dt / steps);
  }
  return moving;
}
function stepMovement(s, dt, movement, running) {
  s.shield = Math.max(0, s.shield - dt); s.shieldCooldown = Math.max(0, s.shieldCooldown - dt); s.dashCooldown = Math.max(0, s.dashCooldown - dt);
  if (s.shield === 0) s.shieldHp = 0;
  if (s.dash > 0) { const duration = Math.min(s.dash, dt); s.dash -= duration; move(s, s.dx * 10 * duration, s.dz * 10 * duration); return true; }
  const length = Math.hypot(movement.x, movement.z);
  if (length > .01) { s.dx = movement.x / length; s.dz = movement.z / length; const step = (running ? 4.4 : 2.65) * dt * Math.min(1, length); move(s, s.dx * step, s.dz * step); }
  return length > .01;
}
export function jump(s) {
  const support = supportAt(s.x, s.z, s.y || 0, s.zone, s);
  if (s.dead || !s.grounded || s.dash > 0 || s.landTimer > .1 || s.attackPose > 0 || !support || Math.abs(support.y - s.y) > .02) return false;
  s.grounded = false; s.vy = JUMP_SPEED; s.fallPeak = s.y; s.airTime = 0; s.shield = 0; s.shieldHp = 0; return true;
}
export function nearby(s) {
  if (s.dead || s.exploring || s.grounded === false || Math.abs(s.y || 0) > .3) return null;
  const { nodes, aid: firstAid, anchor } = zoneFor(s.zone);
  const i = nodes.findIndex((n, i) => !s.recovered[i] && Math.hypot(n.x - s.x, n.z - s.z) < 2.5);
  if (i >= 0) return { kind: 'node', index: i };
  const canUseAid = !s.aidUsed && Math.hypot(firstAid.x - s.x, firstAid.z - s.z) < 2.5;
  if (canUseAid && s.hp < 120) return { kind: 'aid' };
  const drop = s.drops.find(d => d.amount > 0 && Math.hypot(d.x - s.x, d.z - s.z) < 2.5);
  if (drop) return { kind: 'drop', id: drop.id, x: drop.x, z: drop.z };
  if (canUseAid) return { kind: 'aid' };
  if (!s.story && !s.complete && s.recovered.every(Boolean) && Math.hypot(anchor.x - s.x, anchor.z - s.z) < 3) return { kind: 'anchor' };
  return null;
}
export function interact(s) {
  const target = nearby(s); if (!target) return null;
  if (target.kind === 'node') { s.recovered[target.index] = true; s.energy = Math.min(100, s.energy + 25); }
  else if (target.kind === 'drop') {
    const drop = s.drops.find(d => d.id === target.id), amount = Math.min(100 - s.energy, drop.amount);
    if (!amount) return { kind: 'full' };
    s.energy += amount; drop.amount -= amount; target.amount = amount;
  } else if (target.kind === 'aid') { if (s.hp >= 120) return { kind: 'healthy' }; s.aidUsed = true; s.hp = Math.min(120, s.hp + 50); }
  else if (s.enemies.some(e => e.hp > 0)) return { kind: 'unsafe' };
  else s.complete = true;
  return target;
}
export function shield(s) { if (s.dead || s.grounded === false || s.landTimer > .1 || s.shieldCooldown > 0 || s.energy < 20) return false; s.energy -= 20; s.shield = 3; s.shieldHp = 70; s.guardX = s.dx; s.guardZ = s.dz; s.shieldCooldown = 4; return true; }
export function dash(s) { if (s.dead || s.grounded === false || s.landTimer > .1 || s.dashCooldown > 0) return false; s.dash = .28; s.dashCooldown = 1.1; return true; }
