// One budget for each expensive render feature; art geometry is shared by all tiers.
export const graphicsPresets = Object.freeze({
  low: { label: 'ECO', pixelRatio: 1, reflectionSize: 256, reflectionHz: 10, shadowSize: 1024, shadowHz: 10, bloom: false, ao: false },
  balanced: { label: 'BALANCED', pixelRatio: 1.25, reflectionSize: 512, reflectionHz: 20, shadowSize: 2048, shadowHz: 15, bloom: true, ao: false },
  high: { label: 'HIGH', pixelRatio: 1.5, reflectionSize: 1024, reflectionHz: 30, shadowSize: 2048, shadowHz: 20, bloom: true, ao: true },
});
export function graphicsOptions(value = {}) {
  return { quality: Object.hasOwn(graphicsPresets, value?.quality) ? value.quality : 'balanced', fps: Number(value?.fps) === 30 ? 30 : 60 };
}

// Deadline carry prevents 60 FPS becoming 40/48 FPS on 120/144 Hz displays.
// No catch-up rendering after tab suspension or an expensive scene load.
export class FramePacer {
  reset() { this.last = undefined; this.deadline = undefined; this.cap = undefined; }
  step(now, cap) {
    const interval = 1000 / cap;
    if (this.last === undefined || this.cap !== cap) {
      this.last = now; this.deadline = now + interval; this.cap = cap;
      return interval / 1000;
    }
    if (now + .25 < this.deadline) return null;
    const seconds = (now - this.last) / 1000;
    this.last = now;
    this.deadline += Math.max(1, Math.floor((now - this.deadline) / interval) + 1) * interval;
    return seconds;
  }
}
