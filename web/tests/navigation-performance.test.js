import { test } from 'node:test';
import assert from 'node:assert/strict';
import { segmentClear, findPath } from '../src/navigation.js';
import { walkableAt } from '../src/collision-world.js';
import { zones } from '../src/zones.js';

// Original sample-by-sample oracle: optimization must not shortcut support checks.
function sampledClear(a, b, radius, zone, state) {
  if (Math.abs((a.y || 0) - (b.y || 0)) > .02) return false;
  const steps = Math.max(1, Math.ceil(Math.hypot(a.x - b.x, a.z - b.z) / .08));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    if (!walkableAt(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t, a.y || 0, zone, radius, state)) return false;
  }
  return true;
}

test('optimized segment checks match sampled collision oracle in every zone and door state', () => {
  let seed = 1893;
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
  for (const zone of Object.values(zones)) for (const open of [false, true]) {
    const state = { doors: Object.fromEntries((zone.doors || []).map(d => [d.id, open])) };
    const bounds = zone.bounds;
    const point = y => ({ x: bounds.minX - .5 + random() * (bounds.maxX - bounds.minX + 1), z: bounds.minZ - .5 + random() * (bounds.maxZ - bounds.minZ + 1), y });
    for (const y of [0, .6, 4.8]) for (let i = 0; i < 100; i++) {
      const a = point(y), b = point(y), radius = i % 2 ? .3 : .34;
      assert.equal(segmentClear(a, b, radius, zone.id, state), sampledClear(a, b, radius, zone.id, state), JSON.stringify({ zone: zone.id, open, a, b, radius }));
    }
  }
});

test('training long routes keep collision-free detours and react to door changes', () => {
  const zone = zones.training, start = { zone: zone.id, ...zone.spawn, doors: {} };
  for (const goal of [{ x: 28, z: -14 }, { x: -12, z: -14 }]) {
    const path = findPath(start, goal);
    assert.ok(path.length > 1);
    assert.deepEqual(path.at(-1), goal);
    let previous = start;
    for (const next of path) { assert.ok(sampledClear(previous, next, .3, zone.id, start)); previous = next; }
  }
  const door = zone.doors[0];
  const a = { x: door.x, z: door.z - 1 }, b = { x: door.x, z: door.z + 1 };
  assert.equal(segmentClear(a, b, .3, zone.id, start), false);
  start.doors[door.id] = true;
  assert.equal(segmentClear(a, b, .3, zone.id, start), true);
  start.doors[door.id] = false;
  assert.equal(segmentClear(a, b, .3, zone.id, start), false);
});
