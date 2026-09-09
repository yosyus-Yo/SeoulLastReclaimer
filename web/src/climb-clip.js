import * as THREE from 'three';

// Authored in the GLB's character space: up +Y, forward -Z. Generate once,
// never during rendering. Work on a clone so the live mixer/pose is untouched.
export function createClimbClip(root, tPoseClip) {
  if (!tPoseClip) return null;
  const rig = root.clone(true);
  const originals = [], copies = [];
  root.traverse(node => originals.push(node));
  rig.traverse(node => copies.push(node));
  const bones = copies.filter(node => node.isBone || node.name.startsWith('mixamorig'));
  const bone = name => bones.find(node => node.name.replace(':', '') === `mixamorig${name}`);
  if (!bone('LeftArm') || !bone('RightArm')) return null;
  const mixer = new THREE.AnimationMixer(rig);
  mixer.clipAction(tPoseClip).play();
  mixer.update(0);
  rig.updateMatrixWorld(true);
  const base = new Map(bones.map(node => [node, node.quaternion.clone()]));
  const space = rig.getWorldQuaternion(new THREE.Quaternion());
  const localY = new THREE.Vector3(0, 1, 0);
  const direction = new THREE.Vector3(), parentRotation = new THREE.Quaternion();
  function aim(name, x, y, z) {
    const node = bone(name);
    if (!node) return;
    node.parent.getWorldQuaternion(parentRotation).invert();
    direction.set(x, y, z).normalize().applyQuaternion(space).applyQuaternion(parentRotation);
    node.quaternion.setFromUnitVectors(localY, direction);
    node.updateMatrixWorld(true);
  }
  const duration = 1.4, steps = 32, times = [], values = new Map(bones.map(node => [node, []]));
  for (let frame = 0; frame <= steps; frame++) {
    times.push(frame * duration / steps);
    for (const node of bones) node.quaternion.copy(base.get(node));
    rig.updateMatrixWorld(true);
    // Opposite hand and knee rise together. At phase zero both hands already
    // grip above the shoulders; pausing the action is a valid attached pose.
    for (const [side, sign] of [['Left', -1], ['Right', 1]]) {
      const reach = Math.sin(frame / steps * Math.PI * 2) * sign;
      aim(`${side}Arm`, sign * .25, .35 + reach * .25, -.8);
      aim(`${side}ForeArm`, sign * -.1, .95, -.1 - reach * .09);
      const knee = -reach;
      aim(`${side}UpLeg`, sign * .12, -.65 + knee * .22, -.6 - knee * .2);
      aim(`${side}Leg`, sign * -.05, -.9, .35 + knee * .2);
    }
    for (const node of bones) values.get(node).push(...node.quaternion.toArray());
  }
  mixer.stopAllAction();
  mixer.uncacheRoot(rig);
  const tracks = bones.map(node => new THREE.QuaternionKeyframeTrack(
    `${originals[copies.indexOf(node)].uuid}.quaternion`, times, values.get(node),
  ));
  return new THREE.AnimationClip('Climb', duration, tracks);
}
