import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public/assets');
await mkdir(root, { recursive: true });
const manifest = [];
async function json(url) {
  const r = await fetch(url); if (!r.ok) throw Error(`${r.status}: ${url}`); return r.json();
}
async function download(url, name, source, license, expectedMd5) {
  const file = path.join(root, name);
  let data;
  try { data = await readFile(file); } catch { /* first download */ }
  if (!data || (expectedMd5 && createHash('md5').update(data).digest('hex') !== expectedMd5)) {
    const r = await fetch(url); if (!r.ok) throw Error(`${r.status}: ${url}`);
    data = Buffer.from(await r.arrayBuffer());
    if (expectedMd5 && createHash('md5').update(data).digest('hex') !== expectedMd5) throw Error(`Asset checksum mismatch: ${name}`);
    await writeFile(file, data);
  }
  manifest.push({ file: name, source, license, url, bytes: data.length, sha256: createHash('sha256').update(data).digest('hex') });
  console.log(`${name}: ${(data.length / 1048576).toFixed(2)} MB`);
}
for (const [name, id] of [['road', 'asphalt_02'], ['brick', 'brick_wall_001'], ['concrete', 'concrete_wall_001']]) {
  const info = await json(`https://api.polyhaven.com/files/${id}`);
  await Promise.all([['Diffuse', 'diff', '2k'], ['nor_gl', 'normal', '1k'], ['arm', 'arm', '1k']].map(async ([channel, suffix, resolution]) => {
    const file = info[channel][resolution].jpg;
    await download(file.url, `${name}-${suffix}.jpg`, `https://polyhaven.com/a/${id}`, 'CC0-1.0', file.md5);
  }));
}
const environment = await json('https://api.polyhaven.com/files/industrial_sunset_02');
const hdr = environment.hdri['1k'].hdr;
await download(hdr.url, 'environment.hdr', 'https://polyhaven.com/a/industrial_sunset_02', 'CC0-1.0', hdr.md5);
await download('https://raw.githubusercontent.com/mrdoob/three.js/r185/examples/models/gltf/Soldier.glb', 'field-operator.glb',
  'https://threejs.org/examples/webgl_animation_skinning_blending.html', 'Mixamo character/animations; embedded demo use, not a standalone asset product');
await writeFile(path.join(root, 'manifest.json'), JSON.stringify(manifest.sort((a, b) => a.file.localeCompare(b.file)), null, 2) + '\n');
console.log('Asset manifest verified and written.');
