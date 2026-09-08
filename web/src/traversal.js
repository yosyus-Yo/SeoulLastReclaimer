import { zoneFor } from './zones.js';
import { bodyClear } from './collision-world.js';
const distance = (a, b) => Math.hypot(a.x - b.x, (a.y || 0) - (b.y || 0), a.z - b.z);
export function insideBuilding(s) {
  const b = zoneFor(s.zone).building;
  return !!b && s.x > b.minX + .12 && s.x < b.maxX - .12 && s.z > b.minZ + .12 && s.z < b.maxZ - .12 && s.y < b.roofY - .05;
}
export function traversalNearby(s) {
  if (s.dead) return null;
  if (s.climb) return { kind: 'climbDrop', x: s.x, y: s.y, z: s.z, label: '외벽 놓기 · Space / E' };
  if (s.grounded === false || s.climbCooldown > 0) return null;
  const zone = zoneFor(s.zone);
  for (const d of zone.doors || []) if (distance(s, d) < 1.7) return { ...d, kind: 'door', label: `${d.label} ${s.doors[d.id] ? '닫기' : '열기'}` };
  for (const r of zone.climbRoutes || []) {
    const bottom = s.x <= r.bottom.x + .12 && distance(s, r.bottom) < 1.5;
    const top = distance(s, r.top) < 1.5 && Math.abs(s.y - r.top.y) < .05;
    if (bottom || top) return { ...(top ? r.top : r.bottom), id: r.id, kind: 'climb', fromTop: top, label: `${r.label} · ${top ? '내려가기' : '붙기'}` };
  }
  return null;
}
export function interactTraversal(s) {
  const target = traversalNearby(s); if (!target) return null;
  if (target.kind === 'climbDrop') { releaseClimb(s); return { kind: 'climbDrop', message: '외벽을 놓았습니다. 높은 곳에서는 낙하 피해를 받습니다.' }; }
  if (target.kind === 'door') {
    if (s.doors[target.id] && Math.abs(s.x - target.x) < target.w / 2 + .3 && Math.abs(s.z - target.z) < target.d / 2 + .3 && s.y < target.height) return { kind: 'blocked', message: '문틈에서 벗어난 뒤 닫아주세요.' };
    s.doors[target.id] = !s.doors[target.id];
    const name = zoneFor(s.zone).doors.find(d => d.id === target.id).label;
    return { kind: 'door', message: `${name}을 ${s.doors[target.id] ? '열었습니다. 안으로 걸어 들어가세요.' : '닫았습니다.'}` };
  }
  const route = zoneFor(s.zone).climbRoutes.find(r => r.id === target.id);
  s.climb = { id: route.id, phase: 'attach', time: 0, from: { x: s.x, y: s.y, z: s.z }, to: { x: route.bottom.x, y: target.fromTop ? route.top.y : 0, z: Math.max(route.minZ, Math.min(route.maxZ, s.z)) } };
  s.grounded = false; s.vy = 0; s.dash = 0; s.shield = 0; s.shieldHp = 0;
  return { kind: 'climb', message: 'W/S 오르내리기 · A/D 좌우 이동 · Space 또는 E 놓기' };
}
export function releaseClimb(s) {
  if (!s.climb) return false;
  // Mount/attach transitions cross the lip at roof height. Drop from the outside lane,
  // not an intermediate point whose next gravity step would intersect the wall.
  const route = zoneFor(s.zone).climbRoutes.find(r => r.id === s.climb.id);
  if (route && bodyClear(route.bottom.x, s.y, s.z, s.zone, .3, 1.82, s)) s.x = route.bottom.x;
  s.climb = null; s.climbCooldown = .5; s.grounded = false; s.vy = 0; s.fallPeak = s.y; s.airTime = 0; return true;
}
export function updateClimb(s, dt, input) {
  const c = s.climb, route = zoneFor(s.zone).climbRoutes.find(r => r.id === c.id);
  s.dx = 1; s.dz = 0; s.vy = 0; s.landTimer = 0;
  if (c.phase !== 'climb') {
    c.time = Math.min(.4, c.time + dt); const t = c.time / .4;
    const x = c.from.x + (c.to.x - c.from.x) * t, y = c.from.y + (c.to.y - c.from.y) * t, z = c.from.z + (c.to.z - c.from.z) * t;
    if (!bodyClear(x, y, z, s.zone, .3, 1.82, s)) { releaseClimb(s); return false; }
    Object.assign(s, { x, y, z, fallPeak: y });
    if (c.time >= .4) {
      if (c.phase === 'mount') { s.climb = null; s.grounded = true; s.supportId = 'warehouse-roof-main'; s.climbCooldown = .25; }
      else c.phase = 'climb';
    }
    return true;
  }
  const dy = -input.z * 2.2 * dt, z = Math.max(route.minZ, Math.min(route.maxZ, s.z - input.x * 1.1 * dt));
  s.z = z; s.y = Math.max(0, Math.min(route.top.y, s.y + dy)); s.fallPeak = s.y;
  if (dy > 0 && s.y >= route.top.y) {
    c.phase = 'mount'; c.time = 0; c.from = { x: s.x, y: s.y, z: s.z }; c.to = { x: route.top.x, y: route.top.y, z: s.z };
  } else if (dy < 0 && s.y <= 0) { s.climb = null; s.grounded = true; s.supportId = 'ground'; s.climbCooldown = .25; }
  return !!(dy || input.x);
}
