import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialState, tick, jump, dash } from '../src/simulation.js';
import { bodyClear, collisionBoxes, supportAt } from '../src/collision-world.js';
import { interactTraversal, releaseClimb } from '../src/traversal.js';
import { zones } from '../src/zones.js';
import { attack } from '../src/combat.js';

const directions = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
const clear = s => bodyClear(s.x, s.y, s.z, s.zone, .3, 1.82, s);
const position = s => `${s.zone}:(${s.x.toFixed(4)},${s.y.toFixed(4)},${s.z.toFixed(4)})`;
function verify(s, context, repairs = 0) {
  assert.ok(clear(s), `${context} embedded at ${position(s)}`);
  assert.equal(s.collisionRepairs || 0, repairs, `${context}: ordinary movement needed emergency recovery`);
  assert.ok(s.hp >= 0 && s.hp <= 120);
}

test('regression: walking, running and dashing off the 4.8m ledge never embed the body and movement continues', () => {
  for (const mode of ['walk','run','dash']) {
    const s = initialState('training'); Object.assign(s, { x: 5, y: 4.8, z: -8, fallPeak: 4.8, dx: 1, dz: 0 });
    if (mode === 'dash') dash(s);
    for (let i = 0; i < 240; i++) { tick(s, 1 / 60, mode === 'dash' ? { x: 0, z: 0 } : { x: 1, z: 0 }, mode === 'run'); verify(s, mode); }
    assert.equal(s.hp, 89); assert.equal(s.y, 0);
    const before = s.x; for (let i = 0; i < 60; i++) tick(s, 1 / 60, { x: 1, z: 0 });
    assert.ok(s.x > before + 1, `${mode}: cannot leave the landing point`);
  }
});

test('all finite collider tops: edge and corner departures remain nonpenetrating at 20/30/60 FPS', t => {
  let cases = 0, steps = 0;
  for (const zone of Object.values(zones)) {
    const template = initialState(zone.id);
    for (const box of collisionBoxes(zone.id, template).filter(b => Number.isFinite(b.height))) {
      for (const hz of [20,30,60]) for (const [dx,dz] of directions) for (const mode of ['walk','run','jump']) {
        const s = initialState(zone.id); Object.assign(s, { x: box.x, y: box.height, z: box.z, fallPeak: box.height });
        if (!clear(s) || !supportAt(s.x, s.z, s.y, zone.id, s)) continue;
        cases++; if (mode === 'jump') jump(s);
        for (let i = 0; i < hz * 3; i++) { tick(s, 1 / hz, { x: dx, z: dz }, mode === 'run'); steps++; verify(s, `${box.id || 'post'}/${hz}/${dx},${dz}/${mode}`); if (s.dead) break; }
      }
    }
  }
  assert.ok(cases > 500); t.diagnostic(`finite-top cases=${cases}; checked steps=${steps}`);
});

test('all five zones: every collider side/corner and perimeter resists walking, running, jumping and dash sweeps', t => {
  let cases = 0, steps = 0;
  for (const zone of Object.values(zones)) {
    const template = initialState(zone.id), b = zone.bounds;
    const seeds = [];
    for (const box of collisionBoxes(zone.id, template)) for (const [dx,dz] of directions) seeds.push({ x: box.x + dx * (box.w / 2 + .32), z: box.z + dz * (box.d / 2 + .32), dx: -dx, dz: -dz });
    for (const [dx,dz] of directions) seeds.push({ x: dx ? dx < 0 ? b.minX + .31 : b.maxX - .31 : zone.spawn.x, z: dz ? dz < 0 ? b.minZ + .31 : b.maxZ - .31 : zone.spawn.z, dx, dz });
    for (const seed of seeds) for (const mode of ['walk','run','jump','dash']) {
      const s = initialState(zone.id); Object.assign(s, seed); if (!clear(s)) continue;
      cases++; if (mode === 'jump') jump(s); if (mode === 'dash') { const d = Math.hypot(seed.dx, seed.dz); s.dx /= d; s.dz /= d; dash(s); }
      for (let i = 0; i < 60; i++) { tick(s, 1 / 30, { x: seed.dx, z: seed.dz }, mode === 'run'); steps++; verify(s, `${zone.id}/${mode}`); if (s.dead) break; }
    }
  }
  assert.ok(cases > 300); t.diagnostic(`collider/perimeter cases=${cases}; checked steps=${steps}`);
});

test('release at every attachment/mount frame and across the marked wall cannot trap the player', t => {
  let cases = 0;
  const route = zones.training.climbRoutes[0];
  for (const phase of ['attach','mount']) for (const side of [-1,0,1]) for (let frame = 0; frame <= 24; frame++) {
    const s = initialState('training'); Object.assign(s, route.bottom, { z: side }); interactTraversal(s);
    if (phase === 'mount') for (let i = 0; i < 400 && s.climb?.phase !== 'mount'; i++) tick(s, 1 / 60, { x: 0, z: -1 });
    for (let i = 0; i < frame; i++) tick(s, 1 / 60, { x: 0, z: 0 });
    if (!s.climb) continue;
    releaseClimb(s); cases++;
    for (let i = 0; i < 180; i++) { tick(s, 1 / 60, { x: 0, z: 0 }); verify(s, `${phase}/${side}/${frame}`); }
    const before = s.x; for (let i = 0; i < 30; i++) tick(s, 1 / 60, { x: -1, z: 0 });
    assert.ok(s.x < before - .5, 'cannot walk away after dropping');
  }
  t.diagnostic(`climb cancellation cases=${cases}`);
});

test('existing overlapped positions are repaired in every zone without healing or changing progress', () => {
  for (const zone of Object.values(zones)) for (const box of collisionBoxes(zone.id, initialState(zone.id)).filter(b => !(b.base > 0))) {
    const s = initialState(zone.id); s.hp = 73; s.recovered.fill(true);
    Object.assign(s, { x: box.x + box.w / 2 + .2, y: 0, z: box.z }); if (clear(s)) continue;
    const recovered = [...s.recovered], doors = { ...s.doors };
    tick(s, 1 / 60, { x: 0, z: 0 }); assert.ok(clear(s), position(s)); assert.equal(s.hp, 73);
    assert.deepEqual(s.recovered, recovered); assert.deepEqual(s.doors, doors); assert.ok(s.collisionRepairs > 0);
  }
});

test('seeded mixed inputs in all zones never produce an overlap or rely on emergency recovery', t => {
  let steps = 0;
  for (const zone of Object.values(zones)) for (const hz of [20,30,60]) for (let seed = 1; seed <= 4; seed++) {
    let value = seed; const random = () => { value = (Math.imul(value,1664525) + 1013904223) >>> 0; return value / 4294967296; };
    let s = initialState(zone.id); for (const id in s.doors) s.doors[id] = true;
    let direction = directions[0];
    for (let i = 0; i < 1000; i++) {
      if (i % 20 === 0) direction = directions[Math.floor(random() * 8)];
      if (random() < .035) jump(s); if (random() < .025) dash(s);
      tick(s, 1 / hz, { x: direction[0], z: direction[1] }, random() > .4); steps++;
      verify(s, `seed=${seed},step=${i},hz=${hz}`);
      if (s.dead) s = initialState(zone.id);
    }
  }
  t.diagnostic(`seeded mixed-input steps=${steps}`);
});

test('top-down attachment cancellation is safe at every animation frame', () => {
  const route = zones.training.climbRoutes[0];
  for (let frame = 0; frame <= 24; frame++) {
    const s = initialState('training'); Object.assign(s, route.top, { fallPeak: route.top.y }); interactTraversal(s);
    for (let i = 0; i < frame; i++) tick(s, 1 / 60, { x: 0, z: 0 });
    releaseClimb(s);
    for (let i = 0; i < 180; i++) { tick(s, 1 / 60, { x: 0, z: 0 }); verify(s, `descent attach/${frame}`); }
    assert.equal(s.y, 0); assert.equal(s.hp, 107);
  }
});

test('door closing checks the whole body and the door top cannot embed a falling actor', () => {
  for (const x of [18.399,18.401,18.69,18.71,20,21.29,21.31,21.599,21.601]) for (const z of [6.599,6.601,7,7.399,7.401]) {
    const s = initialState('training'); s.doors['warehouse-door'] = true; Object.assign(s,{x,z});
    if (!clear(s)) continue;
    interactTraversal(s); verify(s,'door toggle');
    for (let i=0;i<60;i++) { tick(s,1/60,{x:0,z:-1}); verify(s,'door passage'); }
  }
  for (const opened of [false,true]) {
    const s=initialState('training'); s.doors['warehouse-door']=opened;
    Object.assign(s,{x:20,y:5.4,z:7,fallPeak:5.4,grounded:false,vy:-1});
    for(let i=0;i<180;i++){tick(s,1/60,{x:0,z:1});verify(s,'door/lintel fall');}
  }
});

test('sub-millimeter ledge/corner offsets do not fall inside the body footprint', () => {
  const p=zones.training.platforms.find(p=>p.id==='step-8');
  for(const delta of [-.001,-.000001,0,.000001,.001]) for(const [dx,dz] of directions) {
    const s=initialState('training'); Object.assign(s,{x:p.x+dx*(p.w/2+.3+delta),y:p.height,z:p.z+dz*(p.d/2+.3+delta),fallPeak:p.height});
    if(!clear(s))continue;
    for(let i=0;i<180;i++){tick(s,1/60,{x:dx,z:dz});verify(s,`corner epsilon ${delta}`);}
  }
});

test('projectile obstruction uses the same open/closed door state as movement', () => {
  for (const opened of [false,true]) {
    // Domain-only combat fixture; training gameplay remains non-combat/non-rewarding.
    const s=initialState('training'); Object.assign(s,{x:20,z:8.4,exploring:false});
    s.doors['warehouse-door']=opened; s.enemies=[{id:'door-test',kind:'chaser',x:20,z:4.8,hp:60}];
    attack(s,s.enemies[0]); assert.equal(s.enemies[0].hp,opened?40:60);
  }
});
