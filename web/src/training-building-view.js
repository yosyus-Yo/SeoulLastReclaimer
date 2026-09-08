import * as THREE from 'three';
import { insideBuilding } from './traversal.js';

export function createTrainingBuilding(scene, kit, zone) {
  const root = new THREE.Group(); root.name = '훈련동 · 실내와 옥상'; scene.add(root);
  const { box, cylinder, board, mats: m } = kit;
  const walls = [], roof = new THREE.Group(); root.add(roof);
  const shell = m.brick.clone(); shell.transparent = true;
  for (const w of zone.obstacles.filter(o => o.id?.includes('wall') || o.id?.startsWith('front-') || o.id === 'door-lintel')) {
    const part = box(w.x, ((w.base || 0) + w.height) / 2, w.z, w.w, w.height - (w.base || 0), w.d, shell, root);
    walls.push({ part, front: w.id.startsWith('front') || w.id === 'door-lintel' || w.id === 'east-wall' });
  }
  for (const p of zone.platforms.filter(p => p.id.startsWith('warehouse-'))) {
    const group = p.kind === 'roof' ? roof : root;
    box(p.x, ((p.base || 0) + p.height) / 2, p.z, p.w, p.height - (p.base || 0), p.d, p.kind === 'furniture' ? m.rust : m.concrete, group);
    if (p.kind === 'stair') box(p.x, p.height + .006, p.z + p.d / 2 - .035, p.w, .012, .05, m.paint, root);
  }
  // Floor and room furnishings, with open access between the door and staircase.
  box(20, .008, 0, 11.7, .016, 13.7, m.cream, root);
  for (let z = -6; z < 7; z += 1) box(20, .018, z, 11.7, .004, .015, m.dark, root);
  for (let i = 0; i < 3; i++) box(17.3 + i * .7, 1.0, -2.5, .45, .35, .55, m.metal, root);
  const consoleSign = new THREE.Group(); root.add(consoleSign); consoleSign.position.set(18, 0, -3.25);
  board(consoleSign, 0, 1.7, 0, 3.4, .7, '장비 정비실', '내부 계단 → 옥상 · 외벽 등반', '#36544b', '#e4e5c5');
  const door = zone.doors[0], doorPanel = box(door.x, door.height / 2, door.z, door.w, door.height, door.d, m.metal, root);
  const handle = box(.95, 0, .15, .07, .5, .08, m.paint, doorPanel);
  handle.castShadow = false;
  const exteriorSign = new THREE.Group(); root.add(exteriorSign); exteriorSign.position.set(20, 0, 7.16);
  board(exteriorSign, 0, 3.35, 0, 6.2, .75, '귀환방재 · 실내 훈련동', 'E 출입문 · 내부 계단으로 옥상', '#304b46', '#eae4c9');
  // Hold strip on the west wall: this is the designated climb surface, not every facade.
  for (const z of [-1.35, 1.35]) cylinder(13.78, 2.1, z, .035, 4.2, m.paint, root);
  for (let y = .35; y < 4.2; y += .42) for (const z of [-.75, .75]) box(13.72, y, z, .22, .09, .48, m.orange, root);
  const climbSign = new THREE.Group(); root.add(climbSign); climbSign.position.set(13.7, 0, 0); climbSign.rotation.y = -Math.PI / 2;
  board(climbSign, 0, 1.15, 0, 2.1, .45, 'E 외벽 등반', 'W/S 이동 · Space 놓기', '#45604b', '#eee3ad');
  const light = new THREE.PointLight(0xffe0b2, 30, 10, 2); light.position.set(19, 3.3, 0); root.add(light);
  box(19, 3.6, 0, 1.4, .08, .25, m.warm, root);
  return { update(s, dt) {
    const inside = insideBuilding(s), climbing = !!s.climb;
    const nearClimb = s.x > 11.8 && s.x < 14 && Math.abs(s.z) < 2 && s.y < 4.21;
    roof.visible = !inside && !climbing && !nearClimb;
    for (const w of walls) w.part.visible = !(inside && w.front);
    shell.opacity = climbing || nearClimb ? .2 : 1; shell.depthWrite = !(climbing || nearClimb);
    const targetX = door.x + (s.doors[door.id] ? 2.8 : 0);
    doorPanel.position.x += (targetX - doorPanel.position.x) * (1 - Math.exp(-12 * dt));
    exteriorSign.visible = !inside;
    climbSign.visible = !climbing;
  } };
}
