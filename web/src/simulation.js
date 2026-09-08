import { zoneFor } from './zones.js';
export const nodes = zoneFor().nodes, anchor = zoneFor().anchor, firstAid = zoneFor().aid, obstacles = zoneFor().obstacles;
export function initialState(zoneId = 'logistics', story = false) {
  const zone = zoneFor(zoneId);
  return { ...zone.spawn, zone: zone.id, story, hp: 120, dead: false, energy: 30, recovered: zone.nodes.map(() => false), complete: false,
    shield: 0, shieldHp: 0, guardX: 0, guardZ: -1, shieldCooldown: 0, dash: 0, dashCooldown: 0, dx: 0, dz: -1,
    attackCooldown: 0, attackPose: 0, hurtFlash: 0, aidUsed: false, kills: 0, drops: [],
    missionPhase: 'scan', supports: [false, false], evacuation: 0, rescued: 0,
    enemies: zone.enemies.map(e => ({ ...e, zone: zone.id, hp: e.kind === 'chaser' ? 60 : 90, maxHp: e.kind === 'chaser' ? 60 : 90,
        phase: 'idle', timer: 0, hitFlash: 0, aimX: 0, aimZ: 0, hit: false })),
    props: zone.props.map(p => ({ ...p })),
  };
}
export function free(x, z, radius = .3, zoneId = 'logistics') {
  const { bounds: b, obstacles } = zoneFor(zoneId);
  if (x < b.minX + radius || x > b.maxX - radius || z < b.minZ + radius || z > b.maxZ - radius) return false;
  return !obstacles.some(o => Math.abs(x - o.x) < o.w / 2 + radius && Math.abs(z - o.z) < o.d / 2 + radius);
}
export function move(s, dx, dz) {
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / .12));
  for (let i = 0; i < steps; i++) { if (free(s.x + dx / steps, s.z, .3, s.zone)) s.x += dx / steps; if (free(s.x, s.z + dz / steps, .3, s.zone)) s.z += dz / steps; }
}
export function tick(s, dt, movement, running = false) {
  if (s.dead) return false;
  dt = Math.min(.05, Math.max(0, dt));
  s.shield = Math.max(0, s.shield - dt); s.shieldCooldown = Math.max(0, s.shieldCooldown - dt); s.dashCooldown = Math.max(0, s.dashCooldown - dt);
  if (s.shield === 0) s.shieldHp = 0;
  if (s.dash > 0) { const duration = Math.min(s.dash, dt); s.dash -= duration; move(s, s.dx * 10 * duration, s.dz * 10 * duration); return true; }
  const length = Math.hypot(movement.x, movement.z);
  if (length > .01) { s.dx = movement.x / length; s.dz = movement.z / length; const step = (running ? 4.4 : 2.65) * dt * Math.min(1, length); move(s, s.dx * step, s.dz * step); }
  return length > .01;
}
export function nearby(s) {
  if (s.dead || s.exploring) return null;
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
export function shield(s) { if (s.dead || s.shieldCooldown > 0 || s.energy < 20) return false; s.energy -= 20; s.shield = 3; s.shieldHp = 70; s.guardX = s.dx; s.guardZ = s.dz; s.shieldCooldown = 4; return true; }
export function dash(s) { if (s.dead || s.dashCooldown > 0) return false; s.dash = .28; s.dashCooldown = 1.1; return true; }
