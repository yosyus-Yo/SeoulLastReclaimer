import * as THREE from 'three';

function seeded(seed) {
  return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
}

// Code-native, repeatable stonework: a single 1K map, not thousands of tile meshes.
export function pavingMaterial() {
  const random = seeded(2046), canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1024;
  const c = canvas.getContext('2d');
  c.fillStyle = '#555b56'; c.fillRect(0, 0, 1024, 1024);
  for (let row = 0; row < 4; row++) for (let col = -1; col < 3; col++) {
    const x = col * 512 + (row % 2) * 256, y = row * 256, shade = 136 + Math.floor(random() * 25);
    c.fillStyle = `rgb(${shade + 7},${shade + 8},${shade})`; c.fillRect(x + 3, y + 3, 506, 250);
    c.strokeStyle = 'rgba(230,228,210,.35)'; c.lineWidth = 3; c.strokeRect(x + 6, y + 6, 500, 244);
    for (let i = 0; i < 4000; i++) {
      const light = random() > .48;
      c.fillStyle = light ? 'rgba(237,232,211,.17)' : 'rgba(43,50,44,.12)';
      c.fillRect(x + 8 + random() * 496, y + 8 + random() * 240, 1 + random() * 3, 1 + random() * 2);
    }
    for (let i = 0; i < 12; i++) {
      c.strokeStyle = 'rgba(55,61,51,.08)'; c.lineWidth = 1;
      const sx = x + 10 + random() * 420, sy = y + 10 + random() * 230;
      c.beginPath(); c.moveTo(sx, sy); c.lineTo(sx + random() * 65, sy + random() * 9); c.stroke();
    }
  }
  const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping; map.anisotropy = 4;
  return new THREE.MeshStandardMaterial({ map, bumpMap: map, bumpScale: .022, roughness: .79, color: 0xd7dbd2 });
}

export function waterMaterial(animations) {
  const time = { value: 0 };
  const material = new THREE.MeshPhysicalMaterial({ color: 0x254d4a, metalness: .25, roughness: .19, clearcoat: 1, clearcoatRoughness: .12 });
  material.onBeforeCompile = shader => {
    shader.uniforms.rippleTime = time;
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 rippleUv;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nrippleUv = uv;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 rippleUv; uniform float rippleTime;')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        vec2 p = rippleUv - .5;
        float r = length(p);
        vec2 wave = normalize(p + .0001) * cos(r * 85. - rippleTime * 2.8) * .016;
        wave += vec2(sin(p.y * 70. + rippleTime), cos(p.x * 85. - rippleTime * 1.3)) * .009;
        normal = normalize(normal + vec3(wave, 0.));`)
      .replace('#include <clearcoat_normal_fragment_maps>', '#include <clearcoat_normal_fragment_maps>\nclearcoatNormal = normal;');
  };
  material.customProgramCacheKey = () => 'plaza-water-v1';
  animations.push(t => { time.value = t; });
  return material;
}

export function addPlazaTrees(k, obstacles) {
  const { box, mesh, line, mats: m } = k, random = seeded(94);
  const foliage = [0x384b29, 0x53603a, 0x697445, 0x424f2d].map(color => new THREE.MeshStandardMaterial({ color, roughness: .94 }));
  const soil = new THREE.MeshStandardMaterial({ color: 0x302b21, roughness: 1 });
  for (const o of obstacles) {
    box(o.x, .3, o.z, o.w, .6, o.d, m.concrete);
    box(o.x, .62, o.z, o.w - .24, .06, o.d - .24, soil);
    // A seat rim stays within the existing planter's navigation footprint.
    for (const side of [-1, 1]) {
      box(o.x, .67, o.z + side * (o.d / 2 - .16), o.w, .10, .32, m.rust);
      box(o.x + side * (o.w / 2 - .16), .67, o.z, .32, .10, o.d - .64, m.rust);
    }
    line([[o.x, .62, o.z], [o.x + .08, 1.6, o.z - .06], [o.x - .12, 2.6, o.z], [o.x + .12, 3.7, o.z + .04]], .105, m.rust);
    for (let branch = 0; branch < 13; branch++) {
      const angle = branch * 2.399, radius = .65 + random() * .55;
      const x = o.x + Math.sin(angle) * radius, z = o.z + Math.cos(angle) * radius;
      const y = 2.8 + random() * 1.25;
      line([[o.x, 1.9 + branch * .065, o.z], [(o.x + x) / 2, y - .35, (o.z + z) / 2], [x, y, z]], .028, m.rust);
      for (let leaf = 0; leaf < 65; leaf++) {
        const a = random() * Math.PI * 2, v = random() * 2 - 1, r = Math.cbrt(random()) * .67;
        const geometry = new THREE.OctahedronGeometry(.16 + random() * .07);
        const sprig = mesh(geometry, foliage[(branch + leaf) % 4], x + Math.cos(a) * Math.sqrt(1 - v * v) * r, y + v * r * .65, z + Math.sin(a) * Math.sqrt(1 - v * v) * r);
        sprig.scale.set(1, .22, .52); sprig.rotation.set(random() * 2, random() * 6.28, random() * 2);
      }
    }
    for (let i = 0; i < 24; i++) {
      const leaf = mesh(new THREE.OctahedronGeometry(.07), foliage[i % 4], o.x + (random() - .5) * (o.w - .5), .72, o.z + (random() - .5) * (o.d - .5));
      leaf.scale.set(1, .3, 2); leaf.rotation.y = random() * 6.28;
    }
  }
}

export function skyMaterial() {
  return new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false,
    vertexShader: 'varying vec3 skyPosition; void main(){ skyPosition=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: `varying vec3 skyPosition;
      void main(){ vec3 d=normalize(skyPosition); float h=max(d.y,0.);
        vec3 col=mix(vec3(.39,.39,.34),vec3(.085,.16,.23),pow(h,.45));
        float glow=pow(max(dot(d,normalize(vec3(-18.,8.,-25.))),0.),18.);
        col+=vec3(.22,.14,.06)*glow; gl_FragColor=vec4(col,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }` });
}
