import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { zoneFor } from './zones.js';
import { buildDistrict, buildBackdrop } from './districts.js';
import { supportAt } from './collision-world.js';
import { createTrainingBuilding } from './training-building-view.js';
import { CharacterAnimator } from './character-animator.js';
import { createClimbClip } from './climb-clip.js';

const C = { cyan: 0xb9f5e8, metal: 0x424c4c, amber: 0xeebf79, plaster: 0xaaa79a };
let seed = 137;
const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
export async function makeWorld(scene, renderer, progress, zoneId = 'logistics') {
  const zone = zoneFor(zoneId), { nodes, anchor } = zone;
  seed = 137;
  const manager = new THREE.LoadingManager();
  manager.onProgress = (_, loaded, total) => progress(loaded / total);
  const loader = new THREE.TextureLoader(manager);
  const gltfLoader = new GLTFLoader(manager);
  const groups = new Map();
  const compareMaterials = [];
  const animations = [];
  const geometryRoot = new THREE.Group(); scene.add(geometryRoot);
  const metal = new THREE.MeshStandardMaterial({ color: C.metal, metalness: .75, roughness: .43 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x202b2b, roughness: .88 });
  const cream = new THREE.MeshStandardMaterial({ color: 0xbbb5a2, metalness: .12, roughness: .71 });
  const rust = new THREE.MeshStandardMaterial({ color: 0x64503e, roughness: .86, metalness: .25 });
  const orange = new THREE.MeshStandardMaterial({ color: 0xb66b3b, roughness: .78 });
  const paint = new THREE.MeshStandardMaterial({ color: 0xc0b384, roughness: .83 });
  const warm = new THREE.MeshStandardMaterial({ color: 0xffdeb0, emissive: 0xffc67d, emissiveIntensity: 2.1 });
  const cool = new THREE.MeshStandardMaterial({ color: 0xcceddb, emissive: 0xb5ddd2, emissiveIntensity: 1.3 });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x394b50, metalness: .55, roughness: .12, clearcoat: 1 });
  const cardboard = [0x917a58, 0x695b43, 0x807359].map(color => new THREE.MeshStandardMaterial({ color, roughness: .93 }));
  const paper = new THREE.MeshStandardMaterial({ color: 0xbcbda6, side: THREE.DoubleSide, roughness: 1 });
  const greenery = new THREE.MeshStandardMaterial({ color: 0x304d31, roughness: .95 });
  function mesh(g, m, x, y, z, parent = geometryRoot, staticMesh = true) {
    const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true;
    parent.add(o); o.userData.merge = staticMesh && !m.transparent; return o;
  }
  function box(x, y, z, w, h, d, m, parent = geometryRoot) {
    const g = new THREE.BoxGeometry(w, h, d);
    const uv = g.attributes.uv, normal = g.attributes.normal;
    // World-scale UVs keep a brick the same size on every building face.
    for (let i = 0; i < uv.count; i++) {
      const a = Math.abs(normal.getX(i)) > .5 ? d : w;
      const b = Math.abs(normal.getY(i)) > .5 ? d : h;
      uv.setXY(i, uv.getX(i) * a / 2, uv.getY(i) * b / 2);
    }
    return mesh(g, m, x, y, z, parent);
  }
  function cylinder(x, y, z, r, h, m, parent = geometryRoot, top = r) { return mesh(new THREE.CylinderGeometry(top, r, h, 12), m, x, y, z, parent); }
  function line(points, radius, m = metal, parent = geometryRoot) {
    const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)));
    return mesh(new THREE.TubeGeometry(curve, 28, radius, 5, false), m, 0, 0, 0, parent);
  }
  const textures = await Promise.all(['road', 'brick', 'concrete'].map(async name => {
    const [map, normalMap, arm] = await Promise.all(['diff', 'normal', 'arm'].map(s => loader.loadAsync(`/assets/${name}-${s}.jpg`)));
    for (const t of [map, normalMap, arm]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy()); }
    map.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.MeshStandardMaterial({ map, normalMap, roughnessMap: arm, aoMap: arm, roughness: name === 'road' ? .63 : .92, normalScale: new THREE.Vector2(.75, .75), aoMapIntensity: .75 });
    compareMaterials.push(m); return m;
  }));
  const [road, brick, concrete] = textures;
  const [environment, soldier] = await Promise.all([new HDRLoader(manager).loadAsync('/assets/environment.hdr'), gltfLoader.loadAsync('/assets/field-operator.glb')]);
  environment.mapping = THREE.EquirectangularReflectionMapping;
  const pmrem = new THREE.PMREMGenerator(renderer); const env = pmrem.fromEquirectangular(environment);
  scene.environment = env.texture; scene.environmentIntensity = .36; environment.dispose(); pmrem.dispose();
  scene.background = new THREE.Color(0x334451);
  scene.fog = new THREE.FogExp2(0x334451, .019);
  const ambient = new THREE.HemisphereLight(0xabbcd0, 0x3c3d36, .95); scene.add(ambient);
  const sun = new THREE.DirectionalLight(0xf9d5ac, 2.7); sun.position.set(-18, 24, -25); scene.add(sun);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.camera.left = -25; sun.shadow.camera.right = 25; sun.shadow.camera.top = 32; sun.shadow.camera.bottom = -32; sun.shadow.camera.near = 1; sun.shadow.camera.far = 95; sun.shadow.normalBias = .035; sun.shadow.bias = -.0002;
  const fill = new THREE.DirectionalLight(0x89aabd, .65); fill.position.set(12, 9, 14); scene.add(fill);
  const lamps = [];
  function lamp(x, y, z, color = 0xffd4a0, intensity = 25, distance = 8) {
    const light = new THREE.PointLight(color, intensity, distance, 2); light.position.set(x, y, z); scene.add(light); lamps.push({ light, intensity }); return light;
  }
  if (zone.id === 'logistics') {
  box(0, -.13, 0, 13, .22, 48, road);
  for (const side of [-1, 1]) {
    box(side * 5.65, .08, 0, 1.45, .2, 48, concrete);
    for (let z = -23; z < 24; z += 1.1) box(side * 4.97, .12, z, .14, .28, 1.05, concrete);
    for (let z = -21; z < 21; z += 8) {
      box(side * 4.7, .011, z, .32, .025, 1.5, metal);
      for (let i = 0; i < 8; i++) box(side * 4.69, .034, z - .65 + i * .17, .3, .017, .05, dark);
    }
  }
  for (let z = -19; z < 23; z += 3.2) box(3.05, -.005, z, .10, .02, 1.2, paint);
  // Manhole covers, with concentric rims and a perforated face.
  for (const z of [-13, 1, 13]) {
    cylinder(-.4, .012, z, .47, .03, metal);
    for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) if (Math.hypot(i - 2.5, j - 2.5) < 2.8) box(-.72 + i * .125, .034, z - .31 + j * .125, .07, .015, .04, dark);
  }
  }
  function sign(text, subtitle, w, h, bg, fg, luminous = false) {
    const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = Math.round(1024 * h / w);
    const c = canvas.getContext('2d'); c.fillStyle = bg; c.fillRect(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < 1500; i++) { c.fillStyle = `rgba(0,0,0,${random() * .05})`; c.fillRect(random() * 1024, random() * canvas.height, random() * 30, 2); }
    c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = fg;
    c.font = `800 ${Math.round(canvas.height * (subtitle ? .45 : .59))}px "Noto Sans KR", sans-serif`;
    c.fillText(text, 512, canvas.height * (subtitle ? .41 : .49), 940);
    if (subtitle) { c.font = `500 ${Math.round(canvas.height * .13)}px "Noto Sans KR", sans-serif`; c.fillText(subtitle, 512, canvas.height * .78, 940); }
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4;
    return new THREE.MeshStandardMaterial({ map: texture, roughness: .65, emissiveMap: luminous ? texture : null, emissive: luminous ? 0xffffff : 0, emissiveIntensity: luminous ? .65 : 0 });
  }
  function board(root, x, y, z, w, h, text, sub, bg = '#c3bd9f', fg = '#29382e', luminous = false) {
    box(x, y, z, w + .12, h + .12, .16, metal, root);
    const material = sign(text, sub, w, h, bg, fg, luminous);
    const front = mesh(new THREE.PlaneGeometry(w, h), material, x, y, z + .091, root);
    mesh(new THREE.PlaneGeometry(w, h), material, x, y, z - .091, root).rotation.y = Math.PI;
    return front;
  }
  function aircon(root, x, y, z) {
    box(x, y, z, 1.05, .62, .44, cream, root);
    const fan = cylinder(x - .16, y, z + .25, .235, .03, dark, root); fan.rotation.x = Math.PI / 2;
    for (let i = 0; i < 6; i++) box(x + .34, y - .23 + i * .087, z + .225, .22, .026, .02, metal, root);
    for (let i = 0; i < 4; i++) { const bar = box(x - .16, y, z + .28, .035, .43, .018, metal, root); bar.rotation.z = i * Math.PI / 4; }
    line([[x + .55, y, z], [x + .68, y - .2, z], [x + .7, .35, z]], .035, cream, root);
    box(x, y - .4, z, 1.3, .08, .65, metal, root);
  }
  const stores = [
    { z: 14, h: 9.8, name: '구로상회', sub: '식료품 · 생필품 · 담배', bg: '#244c3b', fg: '#f0e3bb', open: true },
    { z: 4.5, h: 12, name: '서림전기', sub: '전기공사  ·  산업용품  ·  02-2638-0142', bg: '#ddd6b7', fg: '#283d42', open: false },
    { z: -5, h: 10.5, name: '동원공구', sub: '안전용품 · 작업복 · 철물', bg: '#aa633b', fg: '#efe4c7', open: false },
    { z: -14.5, h: 12.5, name: '성진정밀', sub: '금형  |  CNC  |  기계부품', bg: '#333e48', fg: '#d8d7cb', open: false },
  ];
  for (let index = 0; index < (zone.id === 'logistics' ? stores.length : 0); index++) {
    const s = stores[index]; const mat = index % 2 ? concrete : brick;
    box(-9.8, s.h / 2, s.z, 8, s.h, 9.3, mat);
    box(-9.8, s.h + .1, s.z, 8.3, .24, 9.5, concrete);
    const front = new THREE.Group(); front.position.set(-5.74, 0, s.z); front.rotation.y = Math.PI / 2; geometryRoot.add(front);
    box(0, 1.5, .15, 7.7, 3, .3, dark, front);
    box(0, 3.18, .47, 8.1, .18, 1.1, metal, front);
    board(front, 0, 3.75, .43, 7.5, 1.05, s.name, s.sub, s.bg, s.fg, s.open);
    board(front, 3.43, 1.5, .6, .48, 2.35, s.open ? '24' : '공구', '', s.bg, s.fg, s.open);
    if (s.open) {
      box(-.6, 1.42, .55, 5.7, 2.7, .1, warm, front);
      for (let i = 0; i < 3; i++) {
        box(-2.3 + i * 1.6, 1.38, .62, 1.46, 2.3, .05, glass, front);
        box(-3.1 + i * 1.6, 1.45, .69, .07, 2.65, .08, metal, front);
        for (let j = 0; j < 3; j++) for (let k = 0; k < 5; k++) box(-2.86 + i * 1.6 + k * .24, .6 + j * .61, .72, .15, .3, .08, cardboard[(k + j) % 3], front);
        for (let j = 0; j < 3; j++) box(-2.3 + i * 1.6, .4 + j * .6, .77, 1.5, .035, .12, cream, front);
      }
      lamp(-4.5, 2.4, s.z, 0xffd091, 45, 9);
      board(front, 2, 1.5, .72, 1.3, 2.2, 'OPEN', '어서 오세요', '#bec3ad', '#273b38', true);
    } else {
      box(-.5, 1.45, .48, 6.3, 2.65, .08, metal, front);
      for (let row = 0; row < 22; row++) box(-.5, .19 + row * .12, .55, 6.4, .035, .055, row % 5 ? metal : rust, front);
      board(front, 2.95, 1.1, .69, .75, 1.2, '안전', '보호구 착용', '#d6bb67', '#283332');
      lamp(-5.1, 3.1, s.z, 0xc9e8e1, 8, 5);
    }
    for (let level = 0; level < Math.floor((s.h - 5) / 2.5); level++) {
      for (let col = 0; col < 4; col++) {
        const x = -2.8 + col * 1.8, y = 5.5 + level * 2.45;
        box(x, y, .04, 1.46, 1.66, .13, dark, front);
        const lit = random() > .74;
        box(x, y, .13, 1.25, 1.45, .06, lit ? warm : glass, front);
        box(x, y, .18, .055, 1.5, .045, cream, front);
        box(x, y, .18, 1.29, .045, .045, cream, front);
        box(x, y - .87, .19, 1.54, .10, .42, concrete, front);
      }
    }
    aircon(front, 2.1, 4.7, .56); aircon(front, -2.8, Math.min(7, s.h - 1), .54);
    line([[-4, .3, .13], [-4, s.h - .3, .13], [3.8, s.h - .3, .13]], .065, metal, front);
    box(3.95, 1.1, .31, .48, .7, .22, cream, front);
    board(front, -3.2, 2.1, .7, .55, .3, `${31 + index * 2}`, '', '#273f50', '#dbded5');
  }
  // Lower foreground roofs keep the fixed quarter view readable.
  for (let i = 0; i < (zone.id === 'logistics' ? 4 : 0); i++) {
    const z = 14 - i * 9.5;
    box(9.6, 1.55, z, 7, 3.1, 9.1, concrete);
    box(9.6, 3.15, z, 7.2, .16, 9.3, metal);
    for (let ridge = 0; ridge < 20; ridge++) box(9.6, 3.26, z - 4.45 + ridge * .46, 7.2, .055, .07, metal);
    const front = new THREE.Group(); front.position.set(6.03, 0, z); front.rotation.y = -Math.PI / 2; geometryRoot.add(front);
    board(front, 0, 2.8, .04, 5.8, .52, ['대림물류', '한일설비', '금성유통', '제3 적재장'][i], '', '#4c5b57', '#d6d6bc');
    box(0, 1.15, .06, 6.1, 2.2, .1, metal, front);
    for (let row = 0; row < 18; row++) box(0, .18 + row * .12, .13, 6.1, .025, .04, rust, front);
  }
  if (zone.id === 'logistics') {
  box(0, 5, -24, 29, 10, 4, brick);
  box(0, 2.5, -21.94, 7.7, 5, .18, dark);
  for (let i = 0; i < 20; i++) box(0, .16 + i * .24, -21.8, 7.6, .10, .11, metal);
  const end = new THREE.Group(); end.position.set(0, 0, -21.7); geometryRoot.add(end);
  board(end, 0, 5.7, .1, 10.5, 1.3, '구로 제3물류센터', '출입통제 · 위상재난청 현장관리', '#41534b', '#e1ddc5', true);
  for (let x = -10; x <= 10; x += 3) { box(x, 8, -21.88, 1.7, 1.9, .13, glass); box(x, 8, -21.75, .06, 1.9, .08, cream); }
  lamp(-3.8, 5, -19.8, 0xe3c994, 40, 10); lamp(3.8, 5, -19.8, 0x9bbce3, 35, 9);
  }
  // Detail kit: pallets, sealed cardboard, bins, tarps, traffic equipment.
  function crate(x, z, level = 0) {
    const y = .2 + level * .62;
    if (!level) for (let i = 0; i < 5; i++) box(x - .49 + i * .245, .10, z, .18, .1, 1.2, rust);
    const o = box(x, y + .31, z, .85, .6, .85, cardboard[Math.floor(random() * 3)]);
    o.rotation.y = random() * .15;
    box(x, y + .615, z, .1, .008, .88, cream);
    box(x, y + .3, z + .433, .25, .16, .01, paper);
  }
  if (zone.id === 'logistics') {
  for (const [x, z] of [[-4.2, 5], [4.1, -4], [-4.25, -10]]) { crate(x, z - .5); crate(x, z + .5); crate(x, z - .5, 1); }
  // Compact delivery van. Layered glass, rubber tires and panel seams.
  const rubber = new THREE.MeshStandardMaterial({ color: 0x111718, roughness: .9 });
  const van = new THREE.MeshStandardMaterial({ color: 0x708b81, metalness: .12, roughness: .72 });
  box(3.6, .85, 13.3, 1.7, 1.3, 3.2, van); box(3.6, 1.55, 12.1, 1.7, .65, 1.15, van);
  box(3.6, 1.58, 11.50, 1.45, .43, .04, glass);
  box(3.6, 1.05, 11.67, 1.8, .12, .08, metal);
  for (const x of [2.82, 4.38]) for (const z of [12.1, 14.3]) { const tire = cylinder(x, .37, z, .32, .18, rubber); tire.rotation.z = Math.PI / 2; const hub = cylinder(x + (x < 3 ? -.1 : .1), .37, z, .14, .2, metal); hub.rotation.z = Math.PI / 2; }
  for (const x of [3.01, 4.19]) box(x, .83, 11.65, .3, .25, .03, cream);
  for (let z = -18; z < 18; z += 9) {
    cylinder(4.7, 3.3, z, .065, 6.6, metal);
    line([[4.7, 6.55, z], [4.4, 6.8, z], [3.4, 6.8, z]], .055);
    box(3.4, 6.7, z, .6, .07, .28, warm);
    lamp(3.4, 6.5, z, 0xffd8a4, 36, 10);
  }
  for (let i = 0; i < 5; i++) line([[-5.3, 7.5 + i * .10, -24], [-4.95, 6.9 + i * .06, 0], [-5.2, 7.5 + i * .08, 25]], .018, dark);
  for (const z of [-14, 6, 19]) line([[-5.3, 8.3, z], [0, 6.8, z + 1], [5, 7.3, z]], .023, dark);
  for (let i = 0; i < 50; i++) {
    const x = (random() > .5 ? 1 : -1) * (4.75 + random() * .5), z = random() * 42 - 21;
    const leaf = mesh(new THREE.PlaneGeometry(.10 + random() * .12, .16), i % 3 ? paper : greenery, x, .025, z); leaf.rotation.set(-Math.PI / 2, 0, random() * 6);
  }
  }
  const kit = { box, cylinder, mesh, line, board, root: geometryRoot, lamp, animations, compareMaterials,
    mats: { road, brick, concrete, metal, dark, cream, rust, orange, paint, warm, cool, glass, paper, greenery } };
  if (zone.id !== 'logistics') buildDistrict(kit, zone);
  const buildingView = zone.training ? createTrainingBuilding(scene, kit, zone) : null;
  buildBackdrop(kit, zone);
  // Merge opaque static meshes by material: detailed street, bounded draw calls.
  geometryRoot.updateMatrixWorld(true);
  geometryRoot.traverse(o => {
    if (!o.isMesh || !o.userData.merge) return;
    const g = o.geometry.clone().applyMatrix4(o.matrixWorld);
    const key = `${o.material.uuid}:${o.castShadow}:${o.receiveShadow}`;
    if (!groups.has(key)) groups.set(key, { material: o.material, castShadow: o.castShadow, receiveShadow: o.receiveShadow, geometries: [] });
    groups.get(key).geometries.push(g);
  });
  scene.remove(geometryRoot);
  const staticRoot = new THREE.Group(); scene.add(staticRoot);
  for (const { material, geometries, castShadow, receiveShadow } of groups.values()) {
    const merged = mergeGeometries(geometries, false); const o = new THREE.Mesh(merged, material); o.castShadow = castShadow; o.receiveShadow = receiveShadow; staticRoot.add(o);
    for (const g of geometries) g.dispose();
  }
  geometryRoot.traverse(o => { if (o.isMesh) o.geometry.dispose(); });
  // A single planar reflection is masked into irregular wet patches.
  const shader = {
    uniforms: { ...THREE.UniformsUtils.clone(Reflector.ReflectorShader.uniforms), wetness: { value: .75 }, time: { value: 0 } },
    vertexShader: Reflector.ReflectorShader.vertexShader.replace('varying vec4 vUv;', 'varying vec4 vUv; varying vec2 floorUv;').replace('vUv = textureMatrix', 'floorUv = uv; vUv = textureMatrix'),
    fragmentShader: Reflector.ReflectorShader.fragmentShader.replace('varying vec4 vUv;', `varying vec4 vUv; varying vec2 floorUv; uniform float wetness; uniform float time;
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}`)
      .replace('vec4 base = texture2DProj( tDiffuse, vUv );', `vec4 reflectionUv=vUv; reflectionUv.xy += vec2(sin(floorUv.y*180.+time*.7),cos(floorUv.x*240.+time))*.0015;
        vec4 base = texture2DProj( tDiffuse, reflectionUv );
        float puddle=noise(floorUv*vec2(8.,26.))*.65+noise(floorUv*vec2(25.,70.))*.35;
        float mask=smoothstep(.49,.65,puddle)*wetness*.53;`)
      .replace('vec4( blendOverlay( base.rgb, color ), 1.0 )', 'vec4( blendOverlay( base.rgb, color ), mask )'),
  };
  const mirror = new Reflector(new THREE.PlaneGeometry(zone.bounds.maxX - zone.bounds.minX, zone.bounds.maxZ - zone.bounds.minZ + 4), { textureWidth: 1024, textureHeight: 1024, color: 0x849799, clipBias: .003, multisample: 0, shader });
  mirror.rotation.x = -Math.PI / 2; mirror.position.y = .006; mirror.material.transparent = true; mirror.material.depthWrite = false; mirror.renderOrder = 2; scene.add(mirror);
  const reflect = mirror.onBeforeRender;
  let reflectionInterval = 50, lastReflection = -Infinity;
  mirror.onBeforeRender = function(...args) {
    if (scene.overrideMaterial) return;
    const now = performance.now();
    if (now - lastReflection < reflectionInterval) return;
    reflect.apply(this, args); lastReflection = now;
  };
  function setGraphics(preset) {
    mirror.getRenderTarget().setSize(preset.reflectionSize, preset.reflectionSize);
    reflectionInterval = 1000 / preset.reflectionHz; lastReflection = -Infinity;
    if (sun.shadow.mapSize.x !== preset.shadowSize) {
      sun.shadow.mapSize.set(preset.shadowSize, preset.shadowSize);
      sun.shadow.map?.dispose(); sun.shadow.map = null;
    }
    renderer.shadowMap.needsUpdate = true;
  }
  const player = new THREE.Group(); scene.add(player); player.add(soldier.scene);
  // This GLB faces -Z; movement and ability headings use +Z as forward.
  soldier.scene.rotateY(Math.PI);
  const bounds = new THREE.Box3().setFromObject(soldier.scene); const height = bounds.getSize(new THREE.Vector3()).y;
  soldier.scene.scale.setScalar(1.82 / height); soldier.scene.position.y = -bounds.min.y * (1.82 / height);
  let hand = null;
  soldier.scene.traverse(o => {
    if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; o.material.envMapIntensity = .65; }
    if (o.isBone && /LeftHand$/.test(o.name)) hand = o;
  });
  const climbClip = createClimbClip(soldier.scene, soldier.animations.find(c => c.name === 'TPose'));
  const animator = new CharacterAnimator(soldier.scene, [...soldier.animations, ...(climbClip ? [climbClip] : [])]);
  const poseBones = {};
  soldier.scene.traverse(o => { if (o.isBone) for (const name of ['LeftUpLeg', 'RightUpLeg', 'LeftLeg', 'RightLeg', 'LeftArm', 'RightArm', 'Spine']) if (o.name.endsWith(name)) poseBones[name] = o; });
  const poseRestore = Object.values(poseBones).map(bone => ({ bone, quaternion: bone.quaternion.clone() }));
  let offsetApplied = false;
  const facingAxis = new THREE.Vector3(0, 1, 0), facing = new THREE.Quaternion();
  const handGlow = new THREE.PointLight(C.cyan, 1.4, 1.7); handGlow.position.set(-.3, 1.05, .1); player.add(handGlow);
  const ringMaterial = new THREE.MeshBasicMaterial({ color: C.cyan, transparent: true, opacity: .32, side: THREE.DoubleSide, depthWrite: false });
  const playerRing = new THREE.Mesh(new THREE.RingGeometry(.40, .415, 40), ringMaterial); playerRing.rotation.x = -Math.PI / 2; playerRing.position.y = .035; player.add(playerRing);
  const echoes = nodes.map((n, index) => {
    const root = new THREE.Group(); root.position.set(n.x, .65, n.z); scene.add(root);
    const material = new THREE.MeshPhysicalMaterial({ color: C.cyan, roughness: .10, metalness: .4, emissive: 0x72e4cf, emissiveIntensity: 1.7, transparent: true, opacity: .83 });
    for (let i = 0; i < 8; i++) { const shard = new THREE.Mesh(new THREE.OctahedronGeometry(.10 + random() * .10), material); root.add(shard); shard.userData.angle = i * Math.PI / 4; }
    const point = new THREE.PointLight(C.cyan, 3.5, 3); root.add(point);
    const outline = new THREE.Mesh(new THREE.RingGeometry(.56, .57, 48), ringMaterial); outline.rotation.x = -Math.PI / 2; outline.position.y = -.61; root.add(outline);
    return { root, index, taking: 0 };
  });
  const rift = new THREE.Group(); rift.position.set(anchor.x, 1.7, anchor.z); scene.add(rift);
  const riftMat = new THREE.LineBasicMaterial({ color: 0xaba2d1, transparent: true, opacity: .65 });
  for (let j = 0; j < 5; j++) {
    const points = []; for (let i = 0; i <= 80; i++) { const a = i / 80 * Math.PI * 2; points.push(new THREE.Vector3(Math.cos(a) * (.55 + j * .04), Math.sin(a) * 1.5, Math.sin(a * 3) * .12)); }
    const loop = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), riftMat); loop.rotation.y = j * .35; rift.add(loop);
  }
  const riftLight = new THREE.PointLight(0x9ba0ff, 14, 7); rift.add(riftLight);
  const shieldRoot = new THREE.Group(); scene.add(shieldRoot);
  const shieldMat = new THREE.MeshBasicMaterial({ color: C.cyan, transparent: true, opacity: .22, side: THREE.DoubleSide, depthWrite: false });
  for (let i = 0; i < 4; i++) {
    const g = new THREE.SphereGeometry(1.05 + i * .09, 24, 14, 0, Math.PI, .3, 2.25);
    const layer = new THREE.Mesh(g, shieldMat); layer.scale.set(1, 1.05, .6); shieldRoot.add(layer);
    const wire = new THREE.LineSegments(new THREE.EdgesGeometry(g, 20), new THREE.LineBasicMaterial({ color: C.cyan, transparent: true, opacity: .5 })); wire.scale.copy(layer.scale); shieldRoot.add(wire);
  }
  shieldRoot.visible = false;
  const trails = [];
  function trail(from, to) {
    const curve = new THREE.QuadraticBezierCurve3(from.clone(), from.clone().lerp(to, .5).add(new THREE.Vector3(0, 1, 0)), to.clone());
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(curve.getPoints(24)), new THREE.LineBasicMaterial({ color: C.cyan, transparent: true, opacity: .85 }));
    scene.add(line); trails.push({ line, life: .8 });
  }
  const snapshots = compareMaterials.map(m => ({ m, color: m.color.clone(), map: m.map, normalMap: m.normalMap, bumpMap: m.bumpMap, roughnessMap: m.roughnessMap, aoMap: m.aoMap }));
  let base = false, wet = .75;
  function compare(value) {
    base = value;
    for (const saved of snapshots) { for (const key of ['map', 'normalMap', 'bumpMap', 'roughnessMap', 'aoMap']) saved.m[key] = value ? null : saved[key]; saved.m.color.copy(value ? new THREE.Color(0x777f7e) : saved.color); saved.m.needsUpdate = true; }
    mirror.visible = !base && wet > 0;
  }
  function setWet(value) { wet = value; mirror.material.uniforms.wetness.value = value; road.roughness = .93 - value * .52; mirror.visible = value > 0 && !base; }
  function setLight(value) { sun.intensity = 1.2 + value * 3.1; ambient.intensity = .65 + value * .6; scene.environmentIntensity = .22 + value * .37; for (const { light, intensity } of lamps) light.intensity = intensity * (1.1 - value * .4); }
  setWet(.75); setLight(.45);
  function update(s, dt, elapsed, moving, running, motion = { x: s.x, y: s.y || 0, z: s.z, speed: moving ? running ? 4.4 : 2.65 : 0, climbSpeed: moving && s.climb ? 2.2 : 0, active: true }) {
    buildingView?.update(s, dt);
    for (const animate of animations) animate(elapsed);
    player.position.set(motion.x, motion.y, motion.z);
    facing.setFromAxisAngle(facingAxis, Math.atan2(s.dx, s.dz));
    player.quaternion.slerp(facing, 1 - Math.exp(-12 * dt));
    if (motion.active) {
    // Restore our additive offsets even when the mixer skips an unchanged bone track.
    if (offsetApplied) { for (const p of poseRestore) p.bone.quaternion.copy(p.quaternion); offsetApplied = false; }
    animator.update(s, motion, dt);
    // Temporary additive jump/landing pose on the existing rig, not a new authored clip.
    const tuck = (s.climb ? 0 : s.grounded === false ? .48 + (s.vy > 0 ? .15 : 0) : Math.min(1, (s.landTimer || 0) / .16) * .3) * (1 - animator.climbWeight);
    if (tuck) {
      for (const p of poseRestore) p.quaternion.copy(p.bone.quaternion);
      offsetApplied = true;
      for (const name of ['LeftUpLeg', 'RightUpLeg']) if (poseBones[name]) poseBones[name].rotation.x -= tuck;
      for (const name of ['LeftLeg', 'RightLeg']) if (poseBones[name]) poseBones[name].rotation.x += tuck * 1.7;
      if (poseBones.LeftArm) poseBones.LeftArm.rotation.z -= tuck * .45;
      if (poseBones.RightArm) poseBones.RightArm.rotation.z += tuck * .45;
    }
    }
    mirror.material.uniforms.time.value = elapsed;
    const ground = supportAt(s.x, s.z, s.y || 0, s.zone, s);
    playerRing.position.y = (ground?.y || 0) - motion.y + .035;
    playerRing.scale.setScalar(s.grounded === false ? 1.15 : 1);
    handGlow.intensity = s.attackPose > 0 ? 5 : 1.4;
    for (const e of echoes) {
      if (s.recovered[e.index] && e.taking <= 0) e.root.visible = false;
      if (e.taking > 0) { e.taking = Math.max(0, e.taking - dt); e.root.position.lerp(player.position.clone().add(new THREE.Vector3(-.3, 1.1, 0)), 1 - Math.exp(-7 * dt)); e.root.scale.setScalar(Math.max(.01, e.taking / .8)); }
      else for (const shard of e.root.children) if (shard.isMesh && shard.geometry.type === 'OctahedronGeometry') {
        const a = shard.userData.angle + elapsed * .7; shard.position.set(Math.cos(a) * .38, Math.sin(a * 2 + elapsed) * .2, Math.sin(a) * .38); shard.rotation.set(a, elapsed, a * .3);
      }
    }
    shieldRoot.visible = s.shield > 0 && s.shieldHp > 0;
    shieldRoot.position.copy(player.position).add(new THREE.Vector3(s.guardX * .7, 1.1, s.guardZ * .7)); shieldRoot.rotation.y = Math.atan2(s.guardX, s.guardZ);
    shieldMat.opacity = .12 + Math.min(s.shield, 1) * .1;
    rift.visible = !zone.safe && !zone.training && !s.complete; rift.rotation.y = elapsed * .2;
    for (let i = trails.length - 1; i >= 0; i--) { trails[i].life -= dt; trails[i].line.material.opacity = Math.max(0, trails[i].life); if (trails[i].life <= 0) { const l = trails[i].line; scene.remove(l); l.geometry.dispose(); l.material.dispose(); trails.splice(i, 1); } }
  }
  return { player, mirror, sun, compare, setWet, setLight, setGraphics, update, rendererStats: { staticBatches: groups.size },
    dispose() {
      animator.dispose(soldier.scene); mirror.getRenderTarget().dispose(); env.dispose();
      // Comparison mode detaches maps, so the generic scene disposer cannot see them.
      if (base) {
        const detached = new Set(snapshots.flatMap(saved => Object.values(saved).filter(value => value?.isTexture)));
        for (const texture of detached) texture.dispose();
      }
    },
    resetSignals() { for (const e of echoes) { e.taking = 0; e.root.visible = true; e.root.scale.setScalar(1); e.root.position.set(nodes[e.index].x, .65, nodes[e.index].z); } },
    recover(index) { const e = echoes[index]; e.taking = .8; trail(e.root.position, player.position.clone().add(new THREE.Vector3(0, 1, 0))); },
    dash() { trail(player.position.clone().add(new THREE.Vector3(0, .8, 0)), player.position.clone().add(new THREE.Vector3(-player.rotation.y * .1, .8, -.4))); },
  };
}
