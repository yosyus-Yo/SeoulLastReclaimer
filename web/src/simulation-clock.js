export class SimulationClock {
  remainder = 0;
  reset() { this.remainder = 0; }
  advance(seconds, active, step) {
    if (!active) { this.reset(); return; }
    this.remainder += Math.min(.1, Math.max(0, seconds));
    while (this.remainder >= 1 / 60 - 1e-9) { step(1 / 60); this.remainder -= 1 / 60; }
    this.remainder = Math.max(0, this.remainder);
  }
}
