import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialState, shield, dash, tick, interact, firstAid } from '../src/simulation.js';
import { attack, takeDamage, updateCombat } from '../src/combat.js';
function arena() { const s = initialState(); s.x = 0; s.z = 0; s.props = []; s.enemies = [{ ...s.enemies[0], x: 0, z: 3 }]; return s; }
function advance(s, seconds, visible) { const events = []; for (let i = 0; i < Math.ceil(seconds * 60); i++) events.push(...updateCombat(s, 1/60, visible)); return events; }
test('basic attack damages the first target once and uses no energy', () => {
  const s = arena(); s.enemies.push({ ...s.enemies[0], id: 'far', z: 5 });
  assert.ok(attack(s, { x: 0, z: 6 }).some(e => e.type === 'hit'));
  assert.equal(s.enemies[0].hp, 40); assert.equal(s.enemies[1].hp, 60); assert.equal(s.energy, 30);
  assert.deepEqual(attack(s, { x: 0, z: 6 }), []); assert.equal(s.enemies[0].hp, 40);
});
test('attack respects range and cannot shoot through the delivery van', () => {
  const s = arena(); s.enemies[0].z = 8; attack(s, { x: 0, z: 8 }); assert.equal(s.enemies[0].hp, 60);
  s.x = 1; s.z = 13; s.attackCooldown = 0; s.enemies[0].x = 4.5; s.enemies[0].z = 13;
  attack(s, { x: 5, z: 13 }); assert.equal(s.enemies[0].hp, 60);
});
test('enemy death awards one residue, never a duplicate', () => {
  const s = arena(); for (let i = 0; i < 5; i++) { s.attackCooldown = 0; attack(s, { x: 0, z: 3 }); }
  assert.equal(s.kills, 1); assert.equal(s.enemies[0].hp, 0); assert.equal(s.drops.length, 1); assert.equal(s.drops[0].amount, 18);
});
test('destructible residue container needs two hits and is separate from kill count', () => {
  const s = arena(); s.enemies = []; s.props = [{ id: 'CELL', x: 0, z: 3, hp: 40 }];
  for (let i = 0; i < 4; i++) { s.attackCooldown = 0; attack(s, { x: 0, z: 3 }); }
  assert.equal(s.props[0].hp, 0); assert.equal(s.kills, 0); assert.equal(s.drops.length, 1); assert.equal(s.drops[0].amount, 25);
});
test('frontal shield absorbs damage but rear attacks reach health', () => {
  const s = arena(); s.dx = 0; s.dz = 1; shield(s);
  const front = takeDamage(s, 24, { x: 0, z: 3 }); assert.equal(front.blocked, 24); assert.equal(s.hp, 120); assert.equal(s.shieldHp, 46);
  takeDamage(s, 24, { x: 0, z: -3 }); assert.equal(s.hp, 96); assert.equal(s.shieldHp, 46);
});
test('only excess damage passes through a broken shield', () => {
  const s = arena(); s.dz = 1; shield(s); s.shieldHp = 10;
  const e = takeDamage(s, 24, { x: 0, z: 3 }); assert.equal(e.blocked, 10); assert.equal(e.damage, 14); assert.equal(s.hp, 106); assert.equal(s.shield, 0);
});
test('dodge avoids damage and damage resumes after dodge ends', () => {
  const s = arena(); dash(s); assert.equal(takeDamage(s, 18, s).type, 'dodge'); assert.equal(s.hp, 120);
  for (let i = 0; i < 20; i++) tick(s, 1/60, { x: 0, z: 0 });
  takeDamage(s, 18, { x: 0, z: 3 }); assert.equal(s.hp, 102);
});
test('chaser telegraphs before damage and hits once per charge', () => {
  const s = arena(); updateCombat(s, .01); assert.equal(s.enemies[0].phase, 'telegraph');
  advance(s, .8); assert.equal(s.hp, 120);
  advance(s, .65); assert.equal(s.hp, 102);
});
test('an offscreen enemy cannot initiate a new attack', () => { const s = arena(); advance(s, 4, () => false); assert.equal(s.enemies[0].phase, 'idle'); assert.equal(s.hp, 120); });
test('ranged warning locks the impact point so walking out avoids it', () => {
  const s = arena(); s.enemies[0].kind = 'ranged'; updateCombat(s, .01);
  assert.equal(s.enemies[0].aimZ, 0); s.x = -2.5;
  const events = advance(s, 1.2); assert.ok(events.some(e => e.type === 'blast' && e.x === 0 && e.z === 0)); assert.equal(s.hp, 120);
});
test('ranged hit is blocked when shield faces the attacker', () => {
  const s = arena(); s.enemies[0].kind = 'ranged'; s.dz = 1; shield(s);
  const events = advance(s, 1.3); assert.ok(events.some(e => e.type === 'block')); assert.equal(s.hp, 120); assert.equal(s.shieldHp, 46);
});
test('death stops input and combat; a new run restores all encounter state', () => {
  const s = arena(); takeDamage(s, 200, { x: 0, z: 1 }); assert.equal(s.hp, 0); assert.equal(s.dead, true);
  assert.deepEqual(attack(s, { x: 0, z: 1 }), []); assert.equal(shield(s), false); assert.equal(dash(s), false); assert.equal(interact(s), null);
  const before = s.x; tick(s, .05, { x: 1, z: 0 }); assert.equal(s.x, before); assert.deepEqual(updateCombat(s, .05), []);
  Object.assign(s, initialState()); assert.equal(s.hp, 120); assert.equal(s.dead, false); assert.equal(s.enemies.length, 3); assert.ok(s.enemies.every(e => e.hp === e.maxHp));
});
test('first aid is single use and does not exceed maximum health', () => {
  const s = arena(); Object.assign(s, firstAid); s.hp = 100;
  assert.equal(interact(s).kind, 'aid'); assert.equal(s.hp, 120); s.hp = 70; assert.equal(interact(s), null); assert.equal(s.hp, 70);
});
test('dropped energy is partially recovered and preserved when full', () => {
  const s = arena(); s.recovered.fill(true); s.energy = 95; s.drops.push({ id: 'd', x: 0, z: 0, amount: 18 });
  assert.equal(interact(s).amount, 5); assert.equal(s.drops[0].amount, 13); assert.equal(interact(s).kind, 'full'); assert.equal(s.drops[0].amount, 13);
  s.energy = 50; interact(s); assert.equal(s.energy, 63); assert.equal(interact(s), null);
});
test('completed missions no longer accept combat damage', () => { const s = arena(); s.complete = true; assert.equal(takeDamage(s, 18, { x: 0, z: 1 }), null); assert.deepEqual(updateCombat(s, .05), []); assert.equal(s.hp, 120); });
test('first aid is preserved at full health and prioritised over nearby energy when injured', () => {
  const s = arena(); Object.assign(s, firstAid); assert.equal(interact(s).kind, 'healthy'); assert.equal(s.aidUsed, false);
  s.hp = 50; s.energy = 100; s.drops.push({ id: 'd', ...firstAid, amount: 18 });
  assert.equal(interact(s).kind, 'aid'); assert.equal(s.hp, 100); assert.equal(s.drops[0].amount, 18);
});
