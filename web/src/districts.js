import * as THREE from 'three';
import { pavingMaterial, waterMaterial, addPlazaTrees, skyMaterial } from './scene-detail.js';

export function buildDistrict(k, zone) {
  const { box, cylinder, mesh, line, board, root, mats: m, lamp } = k, b = zone.bounds;
  const width = b.maxX - b.minX, depth = b.maxZ - b.minZ;
  box(0, -.13, 0, width + 4, .22, depth + 4, zone.id === 'archive' ? m.road : m.concrete);
  function building(x, z, w, d, h, label, rotation = 0) {
    box(x, h / 2, z, w, h, d, m.brick); box(x, h + .1, z, w + .4, .22, d + .4, m.concrete);
    const front = new THREE.Group(); root.add(front); front.position.set(x, 0, z + d / 2 + .04); front.rotation.y = rotation;
    board(front, 0, 3, .1, Math.min(w - 1, 13), 1, label, '위상재난 대응 · 전원 귀환', '#34534d', '#e8e2c5', true);
    for (let y = 5; y < h - .7; y += 2.4) for (let xx = -w / 2 + 1.3; xx < w / 2 - .8; xx += 2.2) {
      box(xx, y, .06, 1.5, 1.65, .1, m.dark, front);
      box(xx, y, .14, 1.28, 1.4, .08, Math.round(xx + y) % 4 === 0 ? m.warm : m.glass, front);
      box(xx, y, .2, .05, 1.45, .04, m.cream, front);
      box(xx, y - .86, .24, 1.7, .12, .4, m.concrete, front);
    }
    return front;
  }
  if (zone.id === 'plaza') {
    const tile = pavingMaterial(); k.compareMaterials.push(tile);
    box(0, -.007, 0, 32, .018, 34, tile).castShadow = false;
    // Thin bronze inlays and a circular memorial apron break up the paving.
    for (const x of [-11.5, 11.5]) box(x, .004, 0, .045, .004, 33, m.rust).castShadow = false;
    const apron = mesh(new THREE.RingGeometry(2.66, 3.65, 80), m.concrete, 0, .008, 0); apron.rotation.x = -Math.PI / 2; apron.castShadow = false;
    for (const radius of [3.56, 3.65]) {
      const inlay = mesh(new THREE.RingGeometry(radius, radius + .025, 80), m.rust, 0, .011, 0); inlay.rotation.x = -Math.PI / 2; inlay.castShadow = false;
    }
    mesh(new THREE.CylinderGeometry(2.65, 2.65, .45, 80), m.concrete, 0, .23, 0);
    mesh(new THREE.CylinderGeometry(2.36, 2.36, .07, 80), m.dark, 0, .49, 0);
    const water = mesh(new THREE.CircleGeometry(2.28, 80), waterMaterial(k.animations), 0, .532, 0); water.rotation.x = -Math.PI / 2; water.castShadow = false;
    for (const radius of [2.48, 2.61]) { const rim = mesh(new THREE.TorusGeometry(radius, .075, 8, 80), m.concrete, 0, .52, 0); rim.rotation.x = Math.PI / 2; }
    cylinder(0, 1, 0, .65, 1.4, m.metal);
    for (let i = 0; i < 3; i++) { const ring = mesh(new THREE.TorusGeometry(1.1, .1, 8, 40), m.cream, 0, 2.3, 0); ring.rotation.y = i * Math.PI / 3; }
    const plaque = new THREE.Group(); plaque.position.set(0, 0, 2.2); root.add(plaque); board(plaque, 0, .75, 0, 2.2, .4, '다시, 함께 돌아오다', '', '#304338', '#e9e5cc');
    addPlazaTrees(k, zone.obstacles.slice(1));
    building(0, -23, 23, 9, 11, '구로 공동 방재거점');
    building(-25, -10, 10, 15, 10, '회수자 협동 창고');
    building(25, -12, 10, 16, 8, '새벽 의원');
    for (const x of [-13, 13]) for (const z of [-13, 13]) {
      cylinder(x, 2.8, z, .07, 5.6, m.metal); box(x, 5.5, z, .8, .14, .7, m.warm); lamp(x, 5.3, z, 0xffd7a1, 26, 11);
    }
    const notice = new THREE.Group(); root.add(notice); notice.position.set(zone.board.x, 0, zone.board.z);
    for (const x of [-.8, .8]) box(x, .85, 0, .08, 1.7, .09, m.metal, notice);
    board(notice, 0, 1.65, 0, 2.2, 1, '귀환 현장 게시판', 'E 출동 · J 임무와 의뢰', '#c4c7aa', '#23413b');
    for (const x of [-12, 12]) { box(x, .4, 18.5, 3.8, .15, .7, m.rust); box(x, .8, 18.8, 3.8, .7, .1, m.rust); }
  } else if (zone.id === 'school') {
    const court = new THREE.MeshStandardMaterial({ color: 0x5b7467, roughness: .88 });
    box(1, .007, 3, 20, .02, 24, court);
    for (const x of [-8.5, 10.5]) box(x, .025, 3, .08, .012, 22, m.cream);
    for (const z of [-8, 3, 14]) box(1, .025, z, 19, .012, .08, m.cream);
    mesh(new THREE.RingGeometry(2, 2.07, 48), m.cream, 1, .04, 3).rotation.x = -Math.PI / 2;
    building(0, -25, 32, 9, 12, '구로새빛학교');
    box(-18, 5, -1, 7, 10, 37, m.concrete);
    for (let z = -17; z < 17; z += 4) { box(-14.45, 5.2, z, .1, 2, 2.5, m.glass); box(-14.43, 8, z, .1, 2, 2.5, m.glass); }
    for (const o of zone.obstacles) { box(o.x, .55, o.z, o.w, 1.1, o.d, m.concrete); for (let i = 0; i < 3; i++) mesh(new THREE.IcosahedronGeometry(.6, 1), m.greenery, o.x + (i - 1) * .6, 1.25, o.z); }
    for (const x of [-10, 10]) { cylinder(x, 1.9, 10, .08, 3.8, m.metal); box(x, 3.2, 10, 1.5, .9, .1, m.cream); }
    const gate = new THREE.Group(); gate.position.set(0, 0, 21); gate.rotation.y = Math.PI; root.add(gate);
    board(gate, 0, 3.5, 0, 12, .8, '학교의 안전선', '대피 집결지 · 전원 확인', '#d0c7a8', '#28483e');
    for (const x of [-10, 10]) lamp(x, 4, -17, 0xffd5a0, 35, 12);
  } else {
    const steel = new THREE.MeshStandardMaterial({ color: 0x536966, roughness: .62, metalness: .6 });
    box(0, -.08, 0, width + 2, .10, depth + 2, m.road);
    for (const o of zone.obstacles) {
      box(o.x, 1.5, o.z, o.w, 3, o.d, steel);
      for (let i = -.5 * o.d + .2; i < o.d * .5; i += .4) { box(o.x - o.w / 2 - .025, 1.5, o.z + i, .06, 2.8, .06, m.metal); box(o.x + o.w / 2 + .025, 1.5, o.z + i, .06, 2.8, .06, m.metal); }
    }
    building(0, -25, 36, 9, 12, '태산위상 · 기록보존동');
    for (const x of [-19, 19]) {
      box(x, 2.2, 2, 5, 4.4, 34, m.concrete); box(x, 4.5, 2, 5.2, .16, 34.2, m.metal);
      for (const z of [-14, 0, 14]) { cylinder(x * .8, 3.6, z, .075, 7.2, m.metal); lamp(x * .8, 7, z, 0xc5dfdc, 34, 11); }
    }
    for (let x = -12; x <= 12; x += 6) for (const z of [-18, 18]) box(x, .01, z, 3.6, .015, .12, m.paint);
    line([[-16, 8, -18], [0, 6.5, -17], [16, 8, -18]], .03, m.dark);
  }
}

export function buildBackdrop(k, zone) {
  const { box, cylinder, mesh, root, mats: m, board } = k, b = zone.bounds;
  // Render bounds extend far beyond movement/camera limits, including all photo-mode angles.
  box(0, -.5, 0, 800, .55, 800, m.road);
  const frontage = b.maxZ + 11;
  box(0, -.16, b.maxZ + 3.5, b.maxX - b.minX + 38, .05, 7, m.road);
  for (let x = b.minX - 17; x <= b.maxX + 17; x += 5) box(x, -.125, b.maxZ + 3.5, 2.4, .015, .10, m.paint);
  for (let x = b.minX - 12; x < b.maxX + 13; x += 11) {
    const h = 3.4 + Math.abs(x % 3) * .25;
    box(x, h / 2, frontage, 9.4, h, 8, m.brick); box(x, h + .1, frontage, 9.8, .2, 8.4, m.metal);
    for (const dx of [-2.8, 0, 2.8]) box(x + dx, 1.8, frontage - 4.03, 2, 1.8, .08, m.glass);
    const shop = new THREE.Group(); root.add(shop); shop.position.set(x, 0, frontage - 4.1); shop.rotation.y = Math.PI;
    board(shop, 0, 2.9, 0, 7.7, .55, '구로 생활상가', '통제선 밖 · 일반 도로', '#566255', '#e0dfc2');
  }
  if (zone.id !== 'logistics') for (const side of [-1, 1]) {
    const x = side < 0 ? b.minX - 9 : b.maxX + 9;
    box(x, 2.1, 13, 8, 4.2, 9, m.concrete); box(x, 4.3, 13, 8.3, .2, 9.3, m.metal);
  }
  for (const z of [-45, 43, 90, -95]) {
    box(0, -.19, z, 300, .04, 12, m.road);
    for (let x = -145; x < 145; x += 6) box(x, -.16, z, 2.8, .02, .11, m.paint);
  }
  for (const x of [-42, 42, -88, 88]) box(x, -.18, 0, 11, .04, 290, m.road);
  for (let x = -135; x <= 135; x += 23) for (let z = -135; z <= 135; z += 25) {
    if (Math.abs(x) < 34 && Math.abs(z) < 36) continue;
    if (Math.abs(Math.abs(x) - 42) < 9 || Math.abs(Math.abs(x) - 88) < 9 || Math.abs(z - 43) < 9 || Math.abs(z + 45) < 9) continue;
    const h = 9 + ((Math.abs(x * 7 + z * 3)) % 24), w = 10 + Math.abs(x % 5), d = 12 + Math.abs(z % 5);
    box(x, h / 2 - .2, z, w, h, d, Math.abs(x + z) % 2 ? m.brick : m.concrete);
    box(x, h, z, w + .4, .35, d + .4, m.metal);
    for (let y = 3; y < h - 1; y += 3.5) for (const dx of [-w / 3, 0, w / 3]) box(x + dx, y, z + d / 2 + .03, 1.4, 1.7, .08, ((x + z + y) % 4 < 1) ? m.warm : m.glass);
  }
  // Visible safety perimeter communicates why the adjacent, fully modelled city is inaccessible.
  for (const z of [b.minZ - .2, b.maxZ + .2]) {
    for (let x = b.minX; x <= b.maxX; x += 2.2) { cylinder(x, .5, z, .055, 1, m.orange); box(x, .72, z, 2.05, .07, .045, m.paint); }
  }
  if (zone.id !== 'logistics') for (const x of [b.minX - .2, b.maxX + .2]) {
    for (let z = b.minZ; z <= b.maxZ; z += 2.2) { cylinder(x, .6, z, .05, 1.2, m.metal); box(x, .84, z, .05, .07, 2.05, m.metal); }
  }
  const sign = new THREE.Group(); root.add(sign); sign.position.set(b.maxX - 1, 0, b.maxZ - .15); sign.rotation.y = Math.PI;
  board(sign, 0, 1.4, 0, 2.5, .7, '현장 통제선', '이 너머는 비작전 구역', '#a9793b', '#f0e8c9');
  // Sky is a dome, not a flat unmodelled background at the edge of the floor.
  const sky = mesh(new THREE.SphereGeometry(180, 24, 12), skyMaterial(), 0, 0, 0);
  sky.castShadow = false;
}
