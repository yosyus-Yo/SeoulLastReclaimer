import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createClimbClip } from '../src/climb-clip.js';
import { loadOperatorRig } from './helpers/rig-fixture.js';
import { CharacterAnimator } from '../src/character-animator.js';

test('climb generation preserves the shipped operator rig and closes the loop without root motion', () => {
  const { root, nodes, clips } = loadOperatorRig();
  const snapshot = nodes.map(node => ({ q: node.quaternion.toArray(), p: node.position.toArray(), s: node.scale.toArray() }));
  const clip = createClimbClip(root, clips.find(clip => clip.name === 'TPose'));
  assert.ok(clip instanceof THREE.AnimationClip);
  assert.equal(clip.duration, 1.4);
  assert.ok(clip.tracks.length > 8);
  assert.deepEqual(nodes.map(node => ({ q: node.quaternion.toArray(), p: node.position.toArray(), s: node.scale.toArray() })), snapshot);
  for (const track of clip.tracks) {
    assert.ok(track.name.endsWith('.quaternion'), 'No root/hips position or scale tracks');
    assert.notEqual(track.name, `${root.uuid}.quaternion`);
    assert.ok(nodes.some(node => node.isBone && track.name === `${node.uuid}.quaternion`), 'Track targets an existing bone UUID');
    const first = new THREE.Quaternion().fromArray(track.values);
    const last = new THREE.Quaternion().fromArray(track.values, track.values.length - 4);
    assert.ok(1 - Math.abs(first.dot(last)) < 1e-6, 'Loop endpoints have equivalent orientations');
  }
});

test('generated climb binds to the actual GLB and alternates hands and feet above a bent-knee grip pose', () => {
  const { root, nodes, clips } = loadOperatorRig();
  const tPose = clips.find(clip => clip.name === 'TPose');
  // Apply authored scales/positions before the procedural quaternion-only clip.
  const setup = new THREE.AnimationMixer(root);
  setup.clipAction(tPose).play();
  setup.update(0);
  const clip = createClimbClip(root, tPose);
  const mixer = new THREE.AnimationMixer(root);
  mixer.clipAction(clip).play();
  const samples = [0, .35, .7, 1.05].map(time => {
    mixer.setTime(time);
    root.updateMatrixWorld(true);
    return Object.fromEntries(['LeftHand', 'RightHand', 'LeftFoot', 'RightFoot', 'Head'].map(name => [name,
      nodes.find(node => node.name === `mixamorig${name}`).getWorldPosition(new THREE.Vector3())]));
  });
  for (const sample of samples) {
    assert.ok(sample.LeftHand.y > sample.Head.y && sample.RightHand.y > sample.Head.y, 'Hands reach above the head');
    assert.ok(sample.LeftHand.z < sample.Head.z && sample.RightHand.z < sample.Head.z, 'Hands reach toward the wall (-Z)');
  }
  for (const limb of ['LeftHand', 'RightHand', 'LeftFoot', 'RightFoot']) {
    assert.ok(samples[1][limb].distanceTo(samples[3][limb]) > .08, `${limb} actually moves under the bound mixer`);
  }
  assert.ok(samples[1].RightHand.y > samples[1].LeftHand.y);
  assert.ok(samples[1].LeftFoot.y > samples[1].RightFoot.y);
  assert.ok(samples[3].LeftHand.y > samples[3].RightHand.y);
  assert.ok(samples[3].RightFoot.y > samples[3].LeftFoot.y);
});

test('real walk and climb clips share bone bindings instead of overwriting each other',()=>{
  const {root,nodes,clips}=loadOperatorRig(); const climb=createClimbClip(root,clips.find(c=>c.name==='TPose'));
  const animator=new CharacterAnimator(root,[...clips,climb]);
  const leg=nodes.find(n=>n.name==='mixamorigLeftUpLeg');
  for(let i=0;i<90;i++)animator.update({grounded:true},{active:true,speed:2.65,climbSpeed:0},1/60);
  const first=leg.quaternion.clone();
  for(let i=0;i<12;i++)animator.update({grounded:true},{active:true,speed:2.65,climbSpeed:0},1/60);
  assert.ok(first.angleTo(leg.quaternion)>.05,'walking legs must animate even while Climb action weight is zero');
  for(let i=0;i<90;i++)animator.update({grounded:false,climb:{}},{active:true,speed:0,climbSpeed:2.2},1/60);
  root.updateMatrixWorld(true);
  const head=nodes.find(n=>n.name==='mixamorigHead').getWorldPosition(new THREE.Vector3());
  for(const name of ['LeftHand','RightHand'])assert.ok(nodes.find(n=>n.name===`mixamorig${name}`).getWorldPosition(new THREE.Vector3()).y>head.y);
});
