import * as THREE from 'three';
import { zoneFor, sideQuests, missions } from './zones.js';
import { createNpcSprites } from './npc-sprites.js';

export async function createQuestView(scene, camera, zoneId) {
  const zone = zoneFor(zoneId), root = new THREE.Group(); scene.add(root);
  const labels = document.createElement('div'); labels.className = 'combat-labels'; document.body.append(labels);
  const entries = [], people = [];
  const npcSprites = await createNpcSprites(root, camera, zone.npcs).catch(error => { labels.remove(); throw error; });
  const cyan = new THREE.MeshStandardMaterial({ color: 0xa2ddc9, emissive: 0x588c78, emissiveIntensity: .6, roughness: .6 });
  const gray = new THREE.MeshStandardMaterial({ color: 0x596c67, roughness: .7, metalness: .3 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xc19c7f, roughness: .9 });
  const cloth = new THREE.MeshStandardMaterial({ color: 0x9a927c, roughness: .9 });
  const markerMat = new THREE.MeshBasicMaterial({ color: 0xc9e8b1, side: THREE.DoubleSide, transparent: true, opacity: .7, depthWrite: false });
  function part(group, g, m, x, y, z) { const mesh = new THREE.Mesh(g, m); mesh.position.set(x, y, z); mesh.castShadow = true; group.add(mesh); return mesh; }
  function person(x, z, role = '') {
    const g = new THREE.Group(); root.add(g); g.position.set(x, 0, z);
    part(g, new THREE.CapsuleGeometry(.22, .6, 4, 8), role === 'seorin' ? cyan : cloth, 0, 1.05, 0);
    part(g, new THREE.SphereGeometry(.18, 10, 8), skin, 0, 1.65, 0);
    for (const s of [-1, 1]) { part(g, new THREE.BoxGeometry(.15, .58, .22), gray, s * .14, .35, .02); part(g, new THREE.CapsuleGeometry(.08, .42, 3, 6), cloth, s * .32, 1, 0); }
    return g;
  }
  function marker(point, kind, text, id = '') {
    const g = new THREE.Group(); root.add(g); g.position.set(point.x, 0, point.z);
    part(g, new THREE.RingGeometry(.55, .6, 32), markerMat, 0, .04, 0).rotation.x = -Math.PI / 2;
    if (kind === 'item' || kind === 'charge') {
      part(g, new THREE.BoxGeometry(.55, .55, .4), gray, 0, .3, 0);
      part(g, new THREE.BoxGeometry(.35, .10, .02), cyan, 0, .52, .22);
    }
    if (kind === 'support') {
      for (const x of [-.45, .45]) part(g, new THREE.BoxGeometry(.05, 2.2, .05), cyan, x, 1.1, 0);
      part(g, new THREE.BoxGeometry(1, .08, .08), cyan, 0, 2.2, 0);
    }
    const label = document.createElement('div'); label.className = 'enemy-label quest-label'; label.textContent = text; labels.append(label);
    const entry = { point, kind, text, id, group: g, label }; entries.push(entry); return entry;
  }
  for (const npc of zone.npcs) marker(npc, 'npc', 'E ' + npc.name + ' · ' + npc.role, npc.id);
  if (zone.board) marker(zone.board, 'board', 'E 출동 게시판 · J');
  for (const q of sideQuests) if (q.zone === zoneId) for (const p of q.points) {
    const e = marker(p, 'item', q.id === 'SQ04' ? 'E 배전함 복구' : 'E ' + q.name, p.id);
    if (q.id === 'SQ04') { e.powerLight = new THREE.PointLight(0xffdfa9, 0, 9); e.powerLight.position.y = 3; e.group.add(e.powerLight); }
  }
  for (let i = 0; i < zone.supports.length; i++) marker(zone.supports[i], 'support', 'Q 지지점 ' + (i + 1), String(i));
  if (!zone.safe) { marker({ x: 0, z: -11.5 }, 'charge', 'E 구조 장비 충전'); marker(zone.exit, 'exit', 'E 광장으로 귀환'); }
  const mission = missions.find(m => m.zone === zoneId);
  for (let i = 0; i < (mission?.rescued || 0); i++) people.push(person(-2 + (i % 4) * 1.25, -18 + Math.floor(i / 4) * .7));
  const projected = new THREE.Vector3();
  function update(state, campaign, dt, shown) {
    npcSprites.update(dt);
    labels.hidden = !shown;
    for (const e of entries) {
      let visible = true, text = e.text;
      if (e.kind === 'item') {
        const q = sideQuests.find(q => q.points.some(p => p.id === e.id));
        const taken = campaign.pickups.includes(e.id);
        visible = campaign.sideAccepted.includes(q.id) && !taken;
        if (q.id === 'SQ04' && taken) { visible = true; text = '복구 완료'; }
        if (e.powerLight) e.powerLight.intensity = taken ? 18 : 0;
      }
      if (e.kind === 'support') { visible = ['supports', 'evacuate', 'boss', 'extract', 'complete'].includes(state.missionPhase); text = state.supports[+e.id] ? '안전선 고정 완료' : e.text; }
      if (e.kind === 'charge') visible = state.missionPhase === 'supports';
      if (e.kind === 'exit') text = state.missionPhase === 'extract' ? 'E 귀환 확인 · 임무 완료' : e.text;
      if (state.exploring && e.kind !== 'exit') visible = false;
      e.group.visible = visible;
      projected.set(e.point.x, e.kind === 'support' ? 2.5 : 2, e.point.z).project(camera);
      e.label.hidden = !visible || projected.z < -1 || projected.z > 1 || Math.abs(projected.x) > .95 || Math.abs(projected.y) > .88 || Math.hypot(state.x - e.point.x, state.z - e.point.z) > 14;
      e.label.textContent = text; e.label.style.left = `${(projected.x * .5 + .5) * innerWidth}px`; e.label.style.top = `${(-projected.y * .5 + .5) * innerHeight}px`;
    }
    for (let i = 0; i < people.length; i++) {
      const p = people[i]; p.visible = state.missionPhase !== 'scan';
      const travel = Math.min(1, Math.max(0, state.evacuation / (mission.defendSeconds || 1) * 1.7 - i / people.length * .7));
      const startZ = -18 + Math.floor(i / 4) * .7, endZ = zone.exit.z - 1 - Math.floor(i / 4) * .65;
      p.position.set(-2 + (i % 4) * 1.25, 0, startZ + travel * (endZ - startZ));
      p.rotation.y = 0;
    }
  }
  return { update, dispose() { labels.remove(); npcSprites.dispose(); } };
}
