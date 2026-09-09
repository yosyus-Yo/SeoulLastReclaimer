import * as THREE from 'three';

// Start each action once. Weight changes never reset its gait phase or toggle enabled.
export class CharacterAnimator {
  constructor(root, clips) {
    this.mixer = new THREE.AnimationMixer(root); this.actions = {}; this.mode='Idle'; this.climbWeight=0;
    for (const clip of clips) {
      if (!['Idle','Walk','Run','Climb'].includes(clip.name)) continue;
      // Imported clips use names; generated clips use UUIDs. Canonicalize them so
      // two PropertyMixers never independently write the same bone during a blend.
      const boundClip=clip.clone();
      for(const track of boundClip.tracks) {
        const dot=track.name.lastIndexOf('.'), id=track.name.slice(0,dot);
        const node=root.getObjectByName(id) || root.getObjectByProperty('uuid',id);
        if(node)track.name=node.uuid+track.name.slice(dot);
      }
      const action=this.mixer.clipAction(boundClip); action.play(); action.setEffectiveWeight(clip.name==='Idle'?1:0);
      this.actions[clip.name]=action;
    }
    this.mixer.update(0);
  }
  update(state, motion, dt) {
    if (!motion.active || dt <= 0) return;
    const speed=motion.speed || 0;
    this.mode=state.climb && this.actions.Climb ? 'Climb' : state.grounded===false || speed<.05 ? 'Idle' : speed>3.5 ? 'Run' : 'Walk';
    const blend=1-Math.exp(-dt/ .12);
    for (const [name, action] of Object.entries(this.actions)) {
      const target=name===this.mode?1:0;
      action.setEffectiveWeight(action.getEffectiveWeight()+(target-action.getEffectiveWeight())*blend);
      if(name==='Climb') action.setEffectiveTimeScale(motion.climbSpeed>.02 ? Math.min(1.6,motion.climbSpeed/2.2) : 0);
      else if(name==='Walk' || name==='Run') action.setEffectiveTimeScale(this.mode===name ? Math.max(.35,Math.min(1.8,speed/(name==='Walk'?2.65:4.4))) : 1);
    }
    this.climbWeight=this.actions.Climb?.getEffectiveWeight() || 0;
    this.mixer.update(dt);
  }
  dispose(root) { this.mixer.stopAllAction(); this.mixer.uncacheRoot(root); }
}
