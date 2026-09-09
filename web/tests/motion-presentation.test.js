import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { MotionPresentation } from '../src/motion-presentation.js';
import { CharacterAnimator } from '../src/character-animator.js';
import { SimulationClock } from '../src/simulation-clock.js';

test('render-only frames retain walking speed and interpolate without changing physics state',()=>{
  const s={x:0,y:0,z:0}, p=new MotionPresentation();p.reset(s);
  p.beforeStep(s);s.x=2.65/60;p.afterStep(s,1/60);
  for(const alpha of [0,.25,.5,.75,.99]) {const out=p.sample(s,alpha);assert.equal(out.speed,2.65);assert.ok(Math.abs(out.x-s.x*alpha)<1e-9);assert.equal(s.x,2.65/60);}
});
test('jittery 60Hz presentation has no false idle transitions when simulation has zero-step frames',()=>{
  const s={x:0,y:0,z:0}, p=new MotionPresentation(), clock=new SimulationClock();p.reset(s);let zeroFrames=0;
  for(let i=0;i<600;i++) {
    let steps=0;clock.advance(i%2?.018:.015,true,dt=>{p.beforeStep(s);s.x+=2.65*dt;p.afterStep(s,dt);steps++;});
    if(!steps)zeroFrames++; const out=p.sample(s,clock.remainder*60);
    if(i>2)assert.ok(out.speed>2.6);
  }
  assert.ok(zeroFrames>0);
});
test('teleports reset the visual history and pauses never report locomotion',()=>{
  const s={x:0,y:0,z:0}, p=new MotionPresentation();p.reset(s);s.x=20;s.y=4.8;
  assert.equal(p.sample(s,.5).x,20);assert.equal(p.output.y,4.8);assert.equal(p.output.speed,0);
  p.beforeStep(s);s.x+=.04;p.afterStep(s,1/60);assert.equal(p.sample(s,.3,false).speed,0);
  assert.equal(p.sample(s,0,true).x,s.x); assert.equal(p.output.speed,0);
});
function animator(){const root=new THREE.Group();return new CharacterAnimator(root,['Idle','Walk','Run','Climb'].map(name=>new THREE.AnimationClip(name,1,[])));}
test('gait switching blends continuously without resetting animation phase',()=>{
  const a=animator(), s={grounded:true}, m={active:true,speed:2.65,climbSpeed:0};
  for(let i=0;i<20;i++)a.update(s,m,1/60);const time=a.actions.Walk.time;
  a.update(s,{...m,speed:0},1/60);a.update(s,m,1/60);
  assert.ok(a.actions.Walk.time>time);assert.ok(a.actions.Walk.enabled);
  const sum=Object.values(a.actions).reduce((v,action)=>v+action.getEffectiveWeight(),0);assert.ok(Math.abs(sum-1)<1e-6);
});
test('climb has its own cycling action; holding and paused menus freeze the cycle',()=>{
  const a=animator(), s={grounded:false,climb:{}}, m={active:true,speed:0,climbSpeed:2.2};
  for(let i=0;i<30;i++)a.update(s,m,1/60);assert.equal(a.mode,'Climb');assert.ok(a.climbWeight>.98);
  const time=a.actions.Climb.time;a.update(s,{...m,climbSpeed:0},.1);assert.equal(a.actions.Climb.time,time);
  a.update(s,{...m,active:false},.1);assert.equal(a.actions.Climb.time,time);
});
test('named and UUID bone tracks blend through one shared binding',()=>{
  const root=new THREE.Group(), bone=new THREE.Bone();bone.name='arm';root.add(bone);
  const qa=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),.6),qb=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),.8);
  const clip=(name,path,q)=>new THREE.AnimationClip(name,1,[new THREE.QuaternionKeyframeTrack(path,[0,1],[...q.toArray(),...q.toArray()])]);
  const a=new CharacterAnimator(root,[clip('Idle','arm.quaternion',qa),clip('Climb',`${bone.uuid}.quaternion`,qb)]);
  a.actions.Idle.setEffectiveWeight(.5);a.actions.Climb.setEffectiveWeight(.5);a.mixer.update(.1);
  assert.ok(bone.quaternion.angleTo(qa.clone().slerp(qb,.5))<1e-5);
});
