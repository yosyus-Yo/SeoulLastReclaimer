import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FramePacer, graphicsOptions, graphicsPresets } from '../src/graphics.js';

test('invalid or unavailable preferences use balanced / 60, without touching campaign data', () => {
  for (const value of [null, {}, [], { quality: 'ultra', fps: -4 }, 'broken']) assert.deepEqual(graphicsOptions(value), { quality: 'balanced', fps: 60 });
  assert.deepEqual(graphicsOptions({ quality: 'low', fps: '30' }), { quality: 'low', fps: 30 });
});
test('costly quality settings rise monotonically and balanced does not run SAO', () => {
  for (const key of ['pixelRatio', 'reflectionSize', 'reflectionHz', 'shadowSize', 'shadowHz']) {
    assert.ok(graphicsPresets.low[key] <= graphicsPresets.balanced[key]);
    assert.ok(graphicsPresets.balanced[key] <= graphicsPresets.high[key]);
  }
  assert.equal(graphicsPresets.balanced.ao, false);
  assert.equal(graphicsPresets.low.bloom, false);
});
test('frame cap holds on 60/120/144/165 Hz displays without divisibility slowdown', () => {
  for (const refresh of [60, 120, 144, 165]) for (const cap of [30, 60]) {
    const pacer = new FramePacer(); let count = 0, elapsed = 0;
    for (let i = 0; i < refresh * 10; i++) {
      const dt = pacer.step(i * 1000 / refresh, cap);
      if (dt !== null) { count++; elapsed += dt; }
    }
    assert.ok(Math.abs(count - cap * 10) <= 1, `${refresh} Hz / ${cap}: ${count}`);
    assert.ok(Math.abs(elapsed - 10) < .05);
  }
});
test('suspension, load delays and cap changes do not trigger catch-up bursts', () => {
  const pacer = new FramePacer();
  pacer.step(0, 60); assert.equal(pacer.step(1, 60), null);
  pacer.step(10000, 60); assert.equal(pacer.step(10001, 60), null);
  pacer.reset(); assert.equal(pacer.step(20000, 30), 1 / 30);
  assert.equal(pacer.step(20001, 60), 1 / 60);
});
