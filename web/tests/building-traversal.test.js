import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialState, tick, jump, dash, shield } from '../src/simulation.js';
import { bodyClear, recoverPosition } from '../src/collision-world.js';
import { traversalNearby, interactTraversal, releaseClimb, insideBuilding } from '../src/traversal.js';
import { findPath, followPath } from '../src/navigation.js';
import { zones } from '../src/zones.js';
const still = { x: 0, z: 0 };
function run(s, seconds, movement = still) { for (let i = 0; i < Math.round(seconds * 60); i++) tick(s, 1 / 60, movement); }
function finishClimb(s, direction) { for (let i = 0; i < 600 && s.climb; i++) tick(s, 1 / 60, direction); run(s, .3); }
function atDoor() { const s = initialState('training', true); Object.assign(s, { x: 20, z: 8 }); return s; }

test('closed door blocks entry, E opens it, and the same room can be entered without reloading', () => {
  const s = atDoor(); s.hp = 89;
  assert.equal(bodyClear(20, 0, 7, 'training', .3, 1.82, s), false);
  assert.equal(traversalNearby(s).kind, 'door'); assert.equal(interactTraversal(s).kind, 'door');
  assert.equal(bodyClear(20, 0, 7, 'training', .3, 1.82, s), true);
  run(s, 2, { x: 0, z: -1 }); assert.ok(insideBuilding(s)); assert.equal(s.hp, 89); assert.equal(s.doors['warehouse-door'], true);
});
test('door cannot close on the player and remains closed on a new training attempt', () => {
  const s = atDoor(); interactTraversal(s); s.z = 7;
  assert.equal(interactTraversal(s).kind, 'blocked'); assert.equal(s.doors['warehouse-door'], true);
  s.z = 8; interactTraversal(s); assert.equal(s.doors['warehouse-door'], false);
  assert.equal(initialState('training').doors['warehouse-door'], false);
});
test('click routes honor the door state instead of walking through a closed door', () => {
  const s = atDoor(), goal = { x: 20, z: 4 };
  assert.deepEqual(findPath(s, goal), []);
  interactTraversal(s); const path = findPath(s, goal); assert.ok(path.length);
  for (let i = 0; i < 360 && path.length; i++) followPath(s, path, 1 / 60);
  assert.ok(Math.hypot(s.x - 20, s.z - 4) < .05);
});
test('the interior stairs reach the real roof without jumping and descend safely', () => {
  const s = initialState('training'); Object.assign(s, { x: 24, z: 5.5 });
  run(s, 4, { x: 0, z: -1 }); assert.ok(s.y >= 4.19); assert.ok(s.grounded); assert.equal(s.hp, 120);
  run(s, 4, { x: 0, z: 1 }); assert.equal(s.y, 0); assert.equal(s.hp, 120);
});
test('only the marked exterior wall permits climbing, with no air attack/dash/shield/jump', () => {
  const s = initialState('training'); assert.equal(traversalNearby(s), null);
  Object.assign(s, zones.training.climbRoutes[0].bottom);
  assert.equal(interactTraversal(s).kind, 'climb'); assert.ok(s.climb);
  assert.equal(jump(s), false); assert.equal(dash(s), false); assert.equal(shield(s), false);
  run(s, 1, { x: 0, z: -1 }); assert.ok(s.y > 1); assert.equal(s.x, zones.training.climbRoutes[0].bottom.x);
});
test('climb reaches a collision-free rooftop and E at the top allows a safe descent', () => {
  const s = initialState('training'), route = zones.training.climbRoutes[0]; Object.assign(s, route.bottom);
  interactTraversal(s); finishClimb(s, { x: 0, z: -1 });
  assert.equal(s.climb, null); assert.equal(s.y, 4.2); assert.ok(bodyClear(s.x, s.y, s.z, s.zone, .3, 1.82, s));
  assert.equal(traversalNearby(s).kind, 'climb'); interactTraversal(s); finishClimb(s, { x: 0, z: 1 });
  assert.equal(s.climb, null); assert.equal(s.y, 0); assert.ok(s.grounded); assert.equal(s.hp, 120);
});
test('letting go falls normally, prevents immediate reattachment, and pause does not advance climbing', () => {
  const s = initialState('training'); Object.assign(s, zones.training.climbRoutes[0].bottom); interactTraversal(s);
  run(s, 1.95, { x: 0, z: -1 }); const y = s.y; tick(s, 0, still); assert.equal(s.y, y);
  assert.ok(releaseClimb(s)); assert.equal(s.grounded, false); assert.equal(traversalNearby(s), null);
  run(s, 2); assert.equal(s.y, 0); assert.ok(s.hp < 120); assert.equal(s.climb, null);
});
test('recovering from climbing clears the traversal state without changing door progress', () => {
  const s = atDoor(); interactTraversal(s); Object.assign(s, zones.training.climbRoutes[0].bottom); interactTraversal(s);
  run(s, 1, { x: 0, z: -1 }); recoverPosition(s);
  assert.equal(s.climb, null); assert.equal(s.y, 0); assert.equal(s.doors['warehouse-door'], true);
});
