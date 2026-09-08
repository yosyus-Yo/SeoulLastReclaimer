import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialState, free, tick } from '../src/simulation.js';
import { findPath, followPath, segmentClear, nearestWalkablePoint } from '../src/navigation.js';
test('open street uses a direct destination', () => { assert.deepEqual(findPath({ x: 0, z: 10 }, { x: 0, z: -10 }), [{ x: 0, z: -10 }]); });
test('route around the van contains collision-free segments', () => {
  const start = { x: 1, z: 13 }, goal = { x: 4, z: 16 }, path = findPath(start, goal);
  assert.ok(path.length > 1); assert.deepEqual(path.at(-1), goal);
  let previous = start; for (const point of path) { assert.ok(segmentClear(previous, point)); previous = point; }
});
test('blocked and out-of-bounds clicks choose walkable destinations', () => {
  for (const point of [{ x: 3.6, z: 13 }, { x: -4.2, z: 5 }, { x: 200, z: -100 }]) {
    const result = nearestWalkablePoint(point); assert.ok(result && free(result.x, result.z));
  }
  assert.equal(nearestWalkablePoint({ x: NaN, z: 0 }), null);
});
test('walk and run both arrive around the van without oscillation', () => {
  for (const running of [false, true]) {
    const state = initialState(); state.x = 1; const goal = { x: 4, z: 16 }; const path = findPath(state, goal);
    for (let i = 0; i < 1000 && path.length; i++) { followPath(state, path, 1 / 60, running); assert.ok(free(state.x, state.z)); }
    assert.equal(path.length, 0); assert.ok(Math.hypot(state.x - goal.x, state.z - goal.z) < .04);
    const stopped = { x: state.x, z: state.z }; followPath(state, path, 1 / 60, running); assert.deepEqual({ x: state.x, z: state.z }, stopped);
  }
});
test('short final steps do not overshoot', () => {
  const state = initialState(); const goal = { x: state.x, z: state.z - .045 }; const path = [goal];
  followPath(state, path, .05, true); assert.equal(state.z, goal.z); assert.equal(path.length, 0);
});
test('replacing a route follows the most recent order', () => {
  const state = initialState(); const path = findPath(state, { x: 0, z: -10 });
  path.splice(0, path.length, ...findPath(state, { x: 0, z: 18 }));
  for (let i = 0; i < 400 && path.length; i++) followPath(state, path, 1 / 60);
  assert.ok(Math.abs(state.z - 18) < .04);
});
