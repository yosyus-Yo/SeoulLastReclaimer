import { readFileSync } from 'node:fs';
import * as THREE from 'three';

// Texture-free reconstruction of the shipped GLB's real hierarchy and clips.
export function loadOperatorRig() {
  const bytes = readFileSync(new URL('../../public/assets/field-operator.glb', import.meta.url));
  const jsonLength = bytes.readUInt32LE(12);
  const json = JSON.parse(bytes.subarray(20, 20 + jsonLength));
  const binary = bytes.subarray(28 + jsonLength);
  const root = new THREE.Group();
  const nodes = json.nodes.map(source => {
    const node = source.name?.startsWith('mixamorig') ? new THREE.Bone() : new THREE.Object3D();
    node.name = THREE.PropertyBinding.sanitizeNodeName(source.name || '');
    node.position.fromArray(source.translation || [0, 0, 0]);
    node.quaternion.fromArray(source.rotation || [0, 0, 0, 1]);
    node.scale.fromArray(source.scale || [1, 1, 1]);
    return node;
  });
  json.nodes.forEach((source, index) => (source.children || []).forEach(child => nodes[index].add(nodes[child])));
  json.scenes[json.scene || 0].nodes.forEach(index => root.add(nodes[index]));
  function accessor(index) {
    const source = json.accessors[index], view = json.bufferViews[source.bufferView];
    const components = { SCALAR: 1, VEC3: 3, VEC4: 4 }[source.type];
    if (source.componentType !== 5126 || (view.byteStride && view.byteStride !== components * 4)) throw new Error('Fixture requires packed float animation accessors');
    return new Float32Array(binary.buffer, binary.byteOffset + (view.byteOffset || 0) + (source.byteOffset || 0),
      source.count * components);
  }
  const clips = json.animations.map(animation => new THREE.AnimationClip(animation.name, -1,
    animation.channels.map(channel => {
      const sampler = animation.samplers[channel.sampler];
      const property = { translation: 'position', rotation: 'quaternion', scale: 'scale' }[channel.target.path];
      const Track = property === 'quaternion' ? THREE.QuaternionKeyframeTrack : THREE.VectorKeyframeTrack;
      return new Track(`${nodes[channel.target.node].name}.${property}`, accessor(sampler.input), accessor(sampler.output));
    })));
  return { root, nodes, clips };
}
