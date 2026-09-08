import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { zoneFor } from './zones.js';

export function createCombatView(scene, camera, state) {
  const firstAid = zoneFor(state.zone).aid;
  const models = new Map(), dropModels = new Map(), effects = [], numbers = [];
  const labelRoot = document.createElement('div'); labelRoot.className = 'combat-labels'; document.body.append(labelRoot);
  const orange = new THREE.MeshBasicMaterial({ color: 0xef985e, transparent: true, opacity: .6, side: THREE.DoubleSide, depthWrite: false });
  const energyMat = new THREE.MeshStandardMaterial({ color: 0xa7e9d7, emissive: 0x7ac8b8, emissiveIntensity: 1.7, roughness: .2, metalness: .4 });
  function part(root, geometry, material, x, y, z) {
    const mesh = new THREE.Mesh(geometry, material); mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true; root.add(mesh); return mesh;
  }
  function block(root, m, x, y, z, w, h, d) { return part(root, new THREE.BoxGeometry(w, h, d), m, x, y, z); }
  function makeModel(target) {
    const root = new THREE.Group(); root.userData.targetId = target.id; scene.add(root);
    const body = new THREE.MeshStandardMaterial({ color: target.kind ? 0x4a4140 : 0x5e7974, roughness: .55, metalness: .68 });
    const eye = new THREE.MeshStandardMaterial({ color: 0xdeb486, emissive: 0xdd7e45, emissiveIntensity: 1.2 });
    let core;
    if (target.kind) {
      core = part(root, new THREE.IcosahedronGeometry(target.kind === 'chaser' ? .46 : .56, 0), body, 0, .75, 0);
      block(root, eye, 0, .79, .38, .4, .12, .16);
      for (let i = 0; i < 4; i++) {
        const x = i % 2 ? .5 : -.5, z = i < 2 ? -.35 : .35;
        const leg = block(root, body, x, .35, z, .13, .7, .16); leg.rotation.z = x > 0 ? .45 : -.45;
        block(root, body, x * 1.25, .09, z, .27, .12, .31);
      }
      if (target.isBoss) { for (const x of [-.4, .4]) block(root, body, x, .28, .85, .12, .12, 1.1); }
      if (target.kind === 'ranged') {
        part(root, new THREE.TorusGeometry(.42, .055, 5, 24), eye, 0, 1.1, 0).rotation.x = Math.PI / 2;
        block(root, body, 0, 1.3, 0, .16, .5, .2);
      } else for (const x of [-.25, .25]) { const tooth = part(root, new THREE.ConeGeometry(.1, .48, 4), body, x, .4, .52); tooth.rotation.x = Math.PI / 2; }
    } else {
      core = part(root, new THREE.CylinderGeometry(.35, .4, .85, 12), body, 0, .48, 0);
      part(root, new THREE.TorusGeometry(.35, .045, 5, 20), energyMat, 0, .52, 0).rotation.x = Math.PI / 2;
      block(root, energyMat, 0, .5, .4, .16, .27, .03);
    }
    // Keep the animated core separate; batch the static limbs into one draw call.
    const limbs = root.children.filter(o => o.isMesh && o !== core && o.material === body);
    if (limbs.length > 1) {
      root.updateMatrixWorld(true);
      const parts = limbs.map(o => o.geometry.clone().applyMatrix4(o.matrix));
      part(root, mergeGeometries(parts, false), body, 0, 0, 0);
      for (const o of limbs) { root.remove(o); o.geometry.dispose(); }
      for (const g of parts) g.dispose();
    }
    const warning = new THREE.Mesh(target.kind === 'ranged' ? new THREE.CircleGeometry(1.6, 48) : new THREE.PlaneGeometry(1.1, 4.05), orange);
    warning.rotation.x = -Math.PI / 2; warning.position.y = .032; warning.visible = false; scene.add(warning);
    const outline = new THREE.Mesh(new THREE.RingGeometry(target.kind ? .66 : .48, target.kind ? .70 : .52, 32), orange);
    outline.rotation.x = -Math.PI / 2; outline.position.y = .045; root.add(outline);
    const label = document.createElement('div'); label.className = 'enemy-label'; label.id = 'target-' + target.id;
    label.innerHTML = `<span>${target.isBoss ? '앵커 융합체' : target.kind === 'chaser' ? '균열 추적체' : target.kind === 'ranged' ? '잔류 포격체' : '잔향 용기'}</span><b></b><div><i></i></div>`;
    labelRoot.append(label);
    models.set(target.id, { root, body, core, warning, label, outline });
  }
  for (const target of [...state.enemies, ...state.props]) makeModel(target);
  const aid = new THREE.Group(); aid.position.set(firstAid.x, 0, firstAid.z); scene.add(aid);
  const aidMat = new THREE.MeshStandardMaterial({ color: 0xe0d7c3, roughness: .7 });
  const cross = new THREE.MeshStandardMaterial({ color: 0xa95339, roughness: .65 });
  block(aid, aidMat, 0, .3, 0, .65, .45, .5); block(aid, cross, 0, .532, 0, .34, .015, .09); block(aid, cross, 0, .532, 0, .09, .015, .34);
  const aidLabel = document.createElement('div'); aidLabel.className = 'enemy-label aid-label'; aidLabel.textContent = 'E 구급함 · 체력 +50'; labelRoot.append(aidLabel);
  const v = new THREE.Vector3();
  function project(label, x, y, z, show = true) {
    v.set(x, y, z).project(camera);
    label.hidden = !show || v.z < -1 || v.z > 1 || Math.abs(v.x) > .96 || Math.abs(v.y) > .9;
    label.style.left = `${(v.x * .5 + .5) * innerWidth}px`; label.style.top = `${(-v.y * .5 + .5) * innerHeight}px`;
  }
  function update(s, dt, elapsed, enabled) {
    labelRoot.hidden = !enabled;
    for (const t of [...s.enemies, ...s.props]) {
      if (!models.has(t.id)) makeModel(t);
      const m = models.get(t.id); m.root.position.set(t.x, 0, t.z); m.root.userData.alive = t.hp > 0;
      m.root.scale.setScalar((t.hp > 0 ? 1 : .55) * (t.isBoss ? 1.6 : 1)); m.root.rotation.z = t.hp > 0 ? 0 : Math.PI * .45;
      const dx = t.phase === 'charge' || (t.kind === 'chaser' && t.phase === 'telegraph') ? t.aimX : s.x - t.x;
      const dz = t.phase === 'charge' || (t.kind === 'chaser' && t.phase === 'telegraph') ? t.aimZ : s.z - t.z;
      if (t.kind && t.hp > 0) m.root.rotation.y = Math.atan2(dx, dz);
      m.body.emissive.setHex(t.hitFlash > 0 ? 0xbd7455 : 0x000000); m.body.emissiveIntensity = t.hitFlash > 0 ? 1.2 : 0;
      if (t.hp > 0) m.core.position.y = (t.kind ? .75 : .48) + (t.kind ? Math.sin(elapsed * 4) * .06 : 0);
      m.outline.visible = t.hp > 0;
      m.warning.visible = t.hp > 0 && t.phase === 'telegraph';
      if (m.warning.visible) {
        if (t.kind === 'ranged') { m.warning.position.set(t.aimX, .035, t.aimZ); m.warning.scale.setScalar(.8 + .2 * (1 - t.timer / 1.1)); }
        else {
          m.warning.position.set(t.x + t.aimX * 2.025, .035, t.z + t.aimZ * 2.025);
          m.warning.rotation.set(-Math.PI / 2, 0, -Math.atan2(t.aimX, t.aimZ));
        }
      }
      const max = t.maxHp || 40;
      m.label.querySelector('b').textContent = `${t.hp}/${max}`;
      m.label.querySelector('i').style.width = `${t.hp / max * 100}%`;
      m.label.classList.toggle('warning', t.phase === 'telegraph');
      project(m.label, t.x, t.kind ? 1.9 : 1.3, t.z, t.hp > 0 && Math.hypot(t.x - s.x, t.z - s.z) < 11);
    }
    for (const d of s.drops) {
      if (!dropModels.has(d.id)) {
        const mesh = new THREE.Mesh(new THREE.OctahedronGeometry(.19), energyMat); scene.add(mesh); dropModels.set(d.id, mesh);
      }
      const m = dropModels.get(d.id); m.visible = d.amount > 0; m.position.set(d.x, .42 + Math.sin(elapsed * 4) * .08, d.z); m.rotation.set(elapsed, elapsed * .8, .3);
    }
    for (const [id, m] of dropModels) if (!s.drops.some(d => d.id === id)) m.visible = false;
    aid.visible = !s.aidUsed && !zoneFor(s.zone).training; project(aidLabel, firstAid.x, 1.2, firstAid.z, aid.visible && Math.hypot(firstAid.x - s.x, firstAid.z - s.z) < 7);
    for (let i = effects.length - 1; i >= 0; i--) {
      const e = effects[i]; e.life -= dt;
      if (e.expand) e.mesh.scale.addScalar(dt * 3);
      e.mesh.material.opacity = Math.max(0, e.life / e.duration);
      if (e.life <= 0) { scene.remove(e.mesh); e.mesh.geometry.dispose(); e.mesh.material.dispose(); effects.splice(i, 1); }
    }
    for (let i = numbers.length - 1; i >= 0; i--) {
      const n = numbers[i]; n.life -= dt; project(n.label, n.x, 1.8 + (1 - n.life) * .6, n.z); n.label.style.opacity = Math.max(0, n.life);
      if (n.life <= 0) { n.label.remove(); numbers.splice(i, 1); }
    }
  }
  function addEffect(mesh, duration, expand = false) { scene.add(mesh); effects.push({ mesh, duration, life: duration, expand }); }
  function play(events) {
    for (const event of events) {
      if (event.type === 'shot') {
        const a = new THREE.Vector3(event.from.x, 1.15, event.from.z), b = new THREE.Vector3(event.to.x, 1.05, event.to.z);
        const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([a, b]), new THREE.LineBasicMaterial({ color: 0xc9fff2, transparent: true, opacity: 1 })); addEffect(line, .16);
        const light = new THREE.Mesh(new THREE.OctahedronGeometry(.16), new THREE.MeshBasicMaterial({ color: 0xc8f8e7, transparent: true })); light.position.copy(b); addEffect(light, .16, true);
      } else {
        const color = ['block', 'dodge', 'collect'].includes(event.type) ? 0xb8f4df : 0xe79865;
        const ring = new THREE.Mesh(new THREE.RingGeometry(.3, .36, 32), new THREE.MeshBasicMaterial({ color, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
        ring.rotation.x = -Math.PI / 2; ring.position.set(event.x, (event.y || 0) + .055, event.z); addEffect(ring, event.type === 'blast' ? .5 : .25, true);
        if (event.damage || event.blocked || event.type === 'dodge') {
          const label = document.createElement('span'); label.className = 'damage-number ' + event.type;
          label.textContent = event.type === 'block' ? `방어 ${event.blocked}${event.damage ? ' · 피해 ' + event.damage : ''}` : event.type === 'dodge' ? '회피' : '−' + event.damage;
          labelRoot.append(label); numbers.push({ label, x: event.x, z: event.z, life: 1 });
        }
      }
    }
  }
  function reset() {
    for (const e of effects) { scene.remove(e.mesh); e.mesh.geometry.dispose(); e.mesh.material.dispose(); } effects.length = 0;
    for (const n of numbers) n.label.remove(); numbers.length = 0;
  }
  return { update, play, reset, dispose() { reset(); labelRoot.remove(); },
    pick(ray) { const hit = ray.intersectObjects([...models.values()].filter(m => m.root.userData.alive).map(m => m.root), true)[0]; if (!hit) return null; let o = hit.object; while (o && !o.userData.targetId) o = o.parent; return o?.userData.targetId || null; },
    visible(t) { v.set(t.x, 1, t.z).project(camera); return v.z > -1 && v.z < 1 && Math.abs(v.x) < .93 && Math.abs(v.y) < .84; },
  };
}
