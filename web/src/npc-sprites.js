import * as THREE from 'three';
import { npcDesigns } from './npc-designs.js';

// Upright camera-facing cutout planes, not rigged or volumetric 3D characters.
export async function createNpcSprites(parent, camera, npcs) {
  if (!npcs.length) return { update() {}, dispose() {} };
  const response = await fetch('/assets/npcs/cutouts.json');
  if (!response.ok) throw new Error('NPC cutout manifest is unavailable');
  const manifest = await response.json(), loader = new THREE.TextureLoader();
  const loaded = await Promise.all(npcs.map(async npc => {
    const data = manifest.find(entry => entry.id === npc.id), design = npcDesigns[npc.id];
    if (!data || !data.hasAlpha || !design) throw new Error(`Missing transparent NPC asset: ${npc.id}`);
    const texture = await loader.loadAsync('/assets/npcs/' + data.file);
    texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4;
    return { npc, data, design, texture };
  }));
  const characters = [];
  for (const { npc, data, design, texture } of loaded) {
    const pixelsPerMetre = (data.contentBox[3] - data.contentBox[1]) / design.height;
    const root = new THREE.Group(); root.name = `${design.name} · 2.5D`; root.position.set(npc.x, 0, npc.z); parent.add(root);
    const body = new THREE.Group(); root.add(body);
    const material = new THREE.MeshBasicMaterial({ map: texture, color: 0xe3e8e2, alphaTest: .18, side: THREE.DoubleSide });
    const geometry = new THREE.PlaneGeometry(data.width / pixelsPerMetre, data.height / pixelsPerMetre);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set((data.width / 2 - data.footX) / pixelsPerMetre, (data.footY - data.height / 2) / pixelsPerMetre, 0);
    mesh.castShadow = true;
    mesh.customDepthMaterial = new THREE.MeshDepthMaterial({ map: texture, alphaTest: .18, depthPacking: THREE.RGBADepthPacking, side: THREE.DoubleSide });
    body.add(mesh);
    characters.push({ root, body, depth: mesh.customDepthMaterial, phase: characters.length * 1.7 });
  }
  let time = 0;
  return {
    update(dt) {
      time += dt;
      for (const c of characters) {
        c.root.rotation.y = Math.atan2(camera.position.x - c.root.position.x, camera.position.z - c.root.position.z);
        c.body.scale.y = 1 + Math.sin(time * 1.6 + c.phase) * .003;
        c.body.rotation.z = Math.sin(time * .65 + c.phase) * .003;
      }
    },
    // Scene teardown owns geometries, color materials and textures.
    dispose() { for (const c of characters) c.depth.dispose(); },
  };
}
