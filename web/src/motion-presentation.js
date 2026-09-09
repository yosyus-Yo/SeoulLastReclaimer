// Fixed-step state remains authoritative. Rendering interpolates only the presentation.
export class MotionPresentation {
  previous = { x: 0, y: 0, z: 0 };
  current = { x: 0, y: 0, z: 0 };
  output = { x: 0, y: 0, z: 0, speed: 0, climbSpeed: 0, active: true };
  speed = 0;
  climbSpeed = 0;
  reset(state) {
    for (const axis of ['x','y','z']) this.previous[axis] = this.current[axis] = this.output[axis] = state[axis] || 0;
    this.speed = this.climbSpeed = 0;
  }
  beforeStep(state) {
    if (Math.hypot(state.x-this.current.x, state.y-this.current.y, state.z-this.current.z) > .001) this.reset(state);
    Object.assign(this.previous, this.current);
  }
  afterStep(state, dt) {
    const distance = Math.hypot(state.x-this.previous.x,state.z-this.previous.z);
    if (Math.hypot(distance,state.y-this.previous.y) > .75) { this.reset(state); return; }
    this.speed = distance / dt;
    this.climbSpeed = state.climb ? Math.hypot(distance,state.y-this.previous.y) / dt : 0;
    this.current.x=state.x; this.current.y=state.y; this.current.z=state.z;
  }
  sample(state, alpha, active = true) {
    if (!active) this.reset(state);
    if (Math.hypot(state.x-this.current.x,state.y-this.current.y,state.z-this.current.z) > .001) this.reset(state);
    const t = active ? Math.max(0,Math.min(1,alpha)) : 1;
    for (const axis of ['x','y','z']) this.output[axis] = this.previous[axis] + (this.current[axis]-this.previous[axis])*t;
    this.output.speed=active?this.speed:0; this.output.climbSpeed=active?this.climbSpeed:0; this.output.active=active;
    return this.output;
  }
}
