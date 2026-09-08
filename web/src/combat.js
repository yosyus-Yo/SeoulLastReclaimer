import { free, move } from './simulation.js';
import { segmentClear } from './navigation.js';

export const ATTACK_RANGE = 6.5;
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
export function facePoint(state, point) {
  const d = distance(state, point);
  if (Number.isFinite(d) && d > .02) { state.dx = (point.x - state.x) / d; state.dz = (point.z - state.z) / d; }
}

export function takeDamage(s, amount, source) {
  if (s.dead || s.complete) return null;
  if (s.dash > 0) return { type: 'dodge', x: s.x, z: s.z };
  let blocked = 0;
  const d = distance(s, source) || 1;
  const frontal = ((source.x - s.x) * s.guardX + (source.z - s.z) * s.guardZ) / d >= Math.cos(50 * Math.PI / 180);
  if (s.shield > 0 && s.shieldHp > 0 && frontal) {
    blocked = Math.min(s.shieldHp, amount); s.shieldHp -= blocked; amount -= blocked;
    if (s.shieldHp === 0) s.shield = 0;
  }
  s.hp = Math.max(0, s.hp - amount); if (amount > 0) s.hurtFlash = .22;
  if (s.hp === 0) { s.dead = true; s.shield = 0; s.shieldHp = 0; }
  return { type: blocked ? 'block' : 'hurt', x: s.x, z: s.z, damage: amount, blocked };
}

export function attack(s, aim) {
  if (s.zone === 'plaza' || s.exploring || s.dead || s.complete || s.dash > 0 || s.attackCooldown > 0 || !Number.isFinite(aim.x) || !Number.isFinite(aim.z)) return [];
  facePoint(s, aim); s.attackCooldown = .45; s.attackPose = .22;
  const from = { x: s.x, z: s.z };
  let end = { x: s.x, z: s.z };
  // Resolve the first solid obstruction before targets, not just the target's position.
  for (let d = .08; d <= ATTACK_RANGE; d += .08) {
    const p = { x: s.x + s.dx * d, z: s.z + s.dz * d };
    if (!free(p.x, p.z, .04, s.zone)) break; end = p;
  }
  const range = distance(from, end);
  const targets = [...s.enemies, ...s.props].filter(e => e.hp > 0).map(e => {
    const x = e.x - s.x, z = e.z - s.z;
    return { e, along: x * s.dx + z * s.dz, across: Math.abs(x * s.dz - z * s.dx) };
  }).filter(t => t.along >= 0 && t.along <= range && t.across < .68 && segmentClear(s, t.e, .04)).sort((a, b) => a.along - b.along);
  const hit = targets[0]?.e;
  const events = [];
  if (hit) {
    const damage = hit.kind === 'ranged' ? 18 : 20;
    hit.hp = Math.max(0, hit.hp - damage); hit.hitFlash = .18; end = { x: hit.x, z: hit.z };
    events.push({ type: 'hit', x: hit.x, z: hit.z, damage, id: hit.id });
    if (hit.hp === 0) {
      if (hit.kind) { s.kills++; hit.phase = 'dead'; }
      s.drops.push({ id: 'drop-' + hit.id, x: hit.x, z: hit.z, amount: hit.kind ? 18 : 25 });
      events.push({ type: 'break', x: hit.x, z: hit.z, id: hit.id });
    }
  }
  events.unshift({ type: 'shot', from, to: end });
  return events;
}

export function updateCombat(s, seconds, visible = () => true) {
  const events = [], dt = Math.min(.05, Math.max(0, seconds));
  if (s.dead || s.complete) return events;
  s.attackCooldown = Math.max(0, s.attackCooldown - dt); s.attackPose = Math.max(0, s.attackPose - dt); s.hurtFlash = Math.max(0, s.hurtFlash - dt);
  for (const prop of s.props) prop.hitFlash = Math.max(0, (prop.hitFlash || 0) - dt);
  for (const e of s.enemies) {
    e.hitFlash = Math.max(0, e.hitFlash - dt);
    if (e.hp <= 0 || s.dead) continue;
    e.timer -= dt;
    const d = distance(s, e), line = segmentClear(e, s, .04);
    if (e.phase === 'idle') {
      if (d > (e.kind === 'chaser' ? 5 : 6.2) || !line || !visible(e)) continue;
      if (e.kind === 'chaser' && d > 3.5) move(e, (s.x - e.x) / d * dt * 1.6, (s.z - e.z) / d * dt * 1.6);
      else {
        e.phase = 'telegraph'; e.timer = e.kind === 'chaser' ? .9 : 1.1; e.hit = false;
        if (e.kind === 'chaser') { e.aimX = (s.x - e.x) / (d || 1); e.aimZ = (s.z - e.z) / (d || 1); }
        else { e.aimX = s.x; e.aimZ = s.z; }
      }
    } else if (e.phase === 'telegraph' && e.timer <= 0) {
      if (e.kind === 'ranged') {
        if (distance(s, { x: e.aimX, z: e.aimZ }) < 1.6 && segmentClear(e, s, .04)) {
          const hit = takeDamage(s, 24, e); if (hit) events.push(hit);
        }
        events.push({ type: 'blast', x: e.aimX, z: e.aimZ }); e.phase = 'recover'; e.timer = 2.3;
      } else { e.phase = 'charge'; e.timer = .45; }
    } else if (e.phase === 'charge') {
      // Sweep the motion so a low frame rate cannot skip the player's collision circle.
      const steps = Math.max(1, Math.ceil(dt * 9 / .10));
      for (let i = 0; i < steps; i++) {
        move(e, e.aimX * dt * 9 / steps, e.aimZ * dt * 9 / steps);
        if (!e.hit && distance(e, s) < .85 && segmentClear(e, s, .04)) {
          const hit = takeDamage(s, 18, e); if (hit) events.push(hit); e.hit = true;
        }
      }
      if (e.timer <= 0) { e.phase = 'recover'; e.timer = 1.6; }
    } else if (e.phase === 'recover' && e.timer <= 0) e.phase = 'idle';
  }
  return events;
}
