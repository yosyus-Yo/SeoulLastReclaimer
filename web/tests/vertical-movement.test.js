import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialState, tick, jump, dash, shield, nearby, move } from '../src/simulation.js';
import { fallDamage, bodyClear, supportAt, recoverPosition } from '../src/collision-world.js';
import { zones } from '../src/zones.js';
import { attack, takeDamage } from '../src/combat.js';
import { findPath, followPath } from '../src/navigation.js';
import { storyNearby, installSupport, newCampaign, advanceMission } from '../src/campaign.js';
import { SimulationClock } from '../src/simulation-clock.js';

const still = { x: 0, z: 0 };
function run(s, seconds, movement = still, hz = 60) { for (let i = 0; i < Math.round(seconds * hz); i++) tick(s, 1 / hz, movement); }
test('jump leaves the ground, peaks near 1.1m and lands once without damage at 30/60 FPS', () => {
  const results = [30, 60].map(hz => {
    const s = initialState('training', true); assert.ok(jump(s)); assert.equal(jump(s), false);
    let peak = 0;
    for (let i = 0; i < hz * 2; i++) { tick(s, 1 / hz, still); peak = Math.max(peak, s.y); }
    assert.ok(peak > 1.05 && peak < 1.15); assert.equal(s.y, 0); assert.equal(s.grounded, true); assert.equal(s.hp, 120); assert.equal(s.landingCount, 1);
    return peak;
  });
  assert.ok(Math.abs(results[0] - results[1]) < .05);
});
test('a raised platform supports a landing, blocks its sides, and releases the actor at its edge', () => {
  const p = zones.training.platforms[0], s = initialState('training');
  Object.assign(s, { x: p.x, z: p.z, y: p.height + 1, vy: -1, grounded: false, fallPeak: p.height + 1 });
  run(s, 1); assert.equal(s.y, p.height); assert.equal(s.grounded, true);
  assert.equal(bodyClear(p.x, 0, p.z, 'training'), false);
  assert.equal(bodyClear(p.x, p.height, p.z, 'training'), true);
  run(s, 2, { x: 1, z: 0 }); assert.equal(s.y, 0); assert.equal(s.grounded, true);
});
test('jumping under the marked canopy stops at its underside', () => {
  const roof = zones.training.platforms.find(p => p.base > 0), s = initialState('training');
  Object.assign(s, { x: roof.x, z: roof.z }); assert.ok(jump(s)); let peak = 0;
  for (let i = 0; i < 120; i++) { tick(s, 1 / 60, still); peak = Math.max(peak, s.y); }
  assert.ok(peak <= roof.base - 1.82 + .001); assert.ok(peak > .1); assert.equal(s.y, 0);
});
test('fall damage thresholds are bounded and a landing applies damage once despite shield, dash or mission complete', () => {
  assert.deepEqual([0, 3, 4, 5, 6, 7].map(h => fallDamage(h)), [0, 0, 9, 38, 86, 120]);
  const s = initialState('training'); Object.assign(s, { y: 5, vy: -1, grounded: false, fallPeak: 5, shield: 3, shieldHp: 70, dash: .28, complete: true });
  run(s, 2); assert.equal(s.hp, 82); assert.equal(s.landingCount, 1);
  run(s, 2); assert.equal(s.hp, 82);
});
test('lethal falling stops gameplay and retry state starts safely without retained fall velocity', () => {
  const s = initialState('training'); Object.assign(s, { y: 9, vy: -1, grounded: false, fallPeak: 9 });
  run(s, 2); assert.equal(s.dead, true); assert.equal(s.hp, 0); assert.equal(jump(s), false);
  const retry = initialState('training'); assert.equal(retry.hp, 120); assert.equal(retry.y, 0); assert.equal(retry.vy, 0);
});
test('safe plaza landings do not hurt and invalid positions recover to a valid ground point', () => {
  const s = initialState('plaza'); Object.assign(s, { y: 8, vy: -1, grounded: false, fallPeak: 8 });
  run(s, 2); assert.equal(s.hp, 120);
  Object.assign(s, { x: 999, y: -50, z: 999, vy: -40 }); recoverPosition(s);
  assert.ok(bodyClear(s.x, s.y, s.z, s.zone)); assert.equal(s.y, 0); assert.equal(s.vy, 0); assert.equal(s.grounded, true);
});
test('airborne actors cannot attack, shield, dash, collect, talk or install support', () => {
  const s = initialState('logistics', true); Object.assign(s, { x: -1.1, z: 9 }); jump(s);
  assert.deepEqual(attack(s, { x: 0, z: 4 }), []); assert.equal(shield(s), false); assert.equal(dash(s), false); assert.equal(nearby(s), null);
  s.missionPhase = 'supports'; Object.assign(s, zones.logistics.supports[0]); assert.equal(installSupport(s), null);
  const hub = initialState('plaza', true); Object.assign(hub, zones.plaza.npcs[0]); jump(hub); assert.equal(storyNearby(hub, newCampaign()), null);
});
test('height differences do not allow flat combat or interaction through floors', () => {
  const s = initialState('logistics', true); s.y = 4; s.grounded = true;
  s.enemies[0].x = s.x; s.enemies[0].z = s.z - 2;
  attack(s, s.enemies[0]); assert.equal(s.enemies[0].hp, 60);
  assert.equal(takeDamage(s, 20, s.enemies[0]), null); assert.equal(s.hp, 120);
  Object.assign(s, { x: -1.1, z: 9 }); assert.equal(nearby(s), null);
});
test('same-platform click movement works but routes across heights or unsupported gaps are rejected', () => {
  const p = zones.training.platforms[0], s = initialState('training'); Object.assign(s, { x: p.x, z: p.z, y: p.height });
  const route = findPath(s, { x: p.x + .5, z: p.z, y: p.height }); assert.ok(route.length);
  for (let i = 0; i < 120; i++) followPath(s, route, 1 / 60);
  assert.ok(Math.abs(s.x - p.x - .5) < .05);
  assert.deepEqual(findPath(s, { x: 0, z: 12, y: 0 }), []);
  assert.equal(supportAt(0, 12, 0, 'training').y, 0);
});
test('airborne motion cannot escape the existing map perimeter or tunnel through a side wall', () => {
  const s = initialState('logistics'); jump(s); move(s, 200, 0); assert.ok(s.x <= 4.6);
  Object.assign(s, { x: 1, z: 13, y: .8 }); move(s, 9, 0); assert.ok(s.x < 2.41);
});
test('training never advances or grants campaign rewards', () => {
  const s = initialState('training', true), c = newCampaign();
  assert.equal(s.exploring, true); assert.equal(advanceMission(s, .05), null); assert.equal(c.credits, 0);
});
test('the complete eight-platform course can be climbed with real jump and movement steps', () => {
  const s = initialState('training'), platforms = zones.training.platforms.filter(p => p.id.startsWith('step-'));
  Object.assign(s, { x: platforms[0].x, z: platforms[0].z + 2.6 });
  for (let index = 0; index < platforms.length; index++) {
    const p = platforms[index], previous = platforms[index - 1];
    const dir = previous && p.x !== previous.x ? { x: 1, z: 0 } : { x: 0, z: -1 };
    if (previous) {
      const goal = { x: previous.x + dir.x * 1.3, z: previous.z + dir.z * 1.3 };
      for (let i = 0; i < 180; i++) {
        const dx = goal.x - s.x, dz = goal.z - s.z, d = Math.hypot(dx, dz); if (d < .001) break;
        tick(s, 1 / 60, { x: dx / d * Math.min(1, d / (4.4 / 60)), z: dz / d * Math.min(1, d / (4.4 / 60)) }, true);
      }
    }
    run(s, .25); assert.ok(jump(s), `takeoff ${p.id}`);
    for (let i = 0; i < 120 && !s.grounded; i++) tick(s, 1 / 60, dir, true);
    assert.equal(s.y, p.height, `landing ${p.id}`); assert.equal(s.hp, 120);
  }
  assert.equal(s.y, 4.8);
});
test('fixed logic steps work at 30/60 Hz and discard pause/loading backlog', () => {
  for (const hz of [30, 60]) { const clock = new SimulationClock(); let n = 0; for (let i = 0; i < hz; i++) clock.advance(1 / hz, true, () => n++); assert.equal(n, 60); }
  const clock = new SimulationClock(); let n = 0; clock.advance(30, false, () => n++); clock.advance(1 / 60, true, () => n++); assert.equal(n, 1);
  clock.advance(30, true, () => n++); assert.ok(n <= 7);
});
