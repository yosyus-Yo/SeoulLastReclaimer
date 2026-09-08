import { test } from 'node:test';
import assert from 'node:assert/strict';
import { zones, zoneFor, missions, sideQuests } from '../src/zones.js';
import { initialState, free, move, nearby, tick } from '../src/simulation.js';
import { findPath, followPath } from '../src/navigation.js';
import { newCampaign, available, acceptSide, claimSide, questCount, parseCampaign, interactStory, storyNearby, advanceMission, installSupport } from '../src/campaign.js';
import { attack } from '../src/combat.js';

test('every zone has reachable objectives, NPCs and quest objects', () => {
  for (const zone of Object.values(zones)) {
    const state = initialState(zone.id, true);
    const targets = [...zone.nodes, ...zone.supports, ...zone.npcs, zone.aid, zone.exit, ...(zone.board ? [zone.board] : []), ...sideQuests.filter(q => q.zone === zone.id).flatMap(q => q.points)];
    assert.ok(free(state.x, state.z, .3, zone.id));
    for (const target of targets) {
      assert.ok(free(target.x, target.z, .3, zone.id), `${zone.id}: blocked target ${JSON.stringify(target)}`);
      const path = findPath(state, target);
      assert.ok(path.length || Math.hypot(target.x - state.x, target.z - state.z) < .04, `${zone.id}: unreachable ${target.id || target.name || JSON.stringify(target)}`);
      const walker = { ...state };
      for (let i = 0; i < 2500 && path.length; i++) followPath(walker, path, 1/60, true);
      assert.ok(Math.hypot(walker.x - target.x, walker.z - target.z) < .06, `${zone.id}: route did not arrive`);
    }
  }
});
test('movement cannot cross any zone perimeter', () => {
  for (const id of Object.keys(zones)) {
    const s = initialState(id, true), b = zoneFor(id).bounds;
    for (const delta of [[300,0],[-600,0],[0,300],[0,-600]]) { move(s, ...delta); assert.ok(s.x >= b.minX+.3 && s.x <= b.maxX-.3 && s.z >= b.minZ+.3 && s.z <= b.maxZ-.3); }
  }
});
test('main missions unlock strictly in scenario order', () => {
  const c = newCampaign(); assert.ok(available(c,'M001')); assert.equal(available(c,'M002'),false); assert.equal(available(c,'M003'),false);
  c.completed.push('M001'); assert.ok(available(c,'M002')); assert.equal(available(c,'M003'),false);
});
function clearEnemies(s) { s.enemies.forEach(e => { e.hp=0; }); }
function finishMission(c, m) {
  const s = initialState(m.zone,true); s.recovered.fill(true); clearEnemies(s);
  advanceMission(s,.01);
  if(m.rescued) {
    assert.equal(s.missionPhase,'supports');
    Object.assign(s,zoneFor(m.zone).supports[0]); assert.equal(installSupport(s).kind,'support');
    assert.equal(s.missionPhase,'supports');
    for(let i=0;i<250;i++)tick(s,1/60,{x:0,z:0});
    Object.assign(s,zoneFor(m.zone).supports[1]); assert.equal(installSupport(s).kind,'support');
    assert.equal(s.missionPhase,'evacuate');
    for(let i=0;i<m.defendSeconds*20+2;i++)advanceMission(s,.05);
    assert.equal(s.rescued,m.rescued); assert.equal(s.missionPhase,'evacuate','living wave blocks next stage');
    clearEnemies(s); advanceMission(s,.01);
  }
  if(s.missionPhase==='boss') { const count=s.enemies.length; advanceMission(s,.01); assert.equal(s.enemies.length,count,'no duplicate boss'); assert.ok(s.enemies.some(e=>e.isBoss&&e.hp>0)); clearEnemies(s); advanceMission(s,.01); }
  assert.equal(s.missionPhase,'extract');
  Object.assign(s,zoneFor(s.zone).exit); const result=interactStory(s,c); assert.equal(result.kind,'finished'); assert.ok(s.complete);
  return {s,result};
}
test('all three missions reach a real conclusion and award rewards once', () => {
  const c=newCampaign();
  for(const m of missions){const {s,result}=finishMission(c,m); assert.equal(result.reward,m.credits); const before=c.credits; s.complete=false;s.missionPhase='extract'; assert.equal(interactStory(s,c).reward,0);assert.equal(c.credits,before);}
  assert.deepEqual(c.completed,['M001','M002','M003']);assert.equal(c.credits,1750);assert.deepEqual(parseCampaign(JSON.stringify(c)),c);
});
test('incomplete rescues or threats cannot be submitted', () => {
  const c=newCampaign(),s=initialState('logistics',true);s.missionPhase='extract';s.recovered.fill(true);Object.assign(s,zoneFor(s.zone).exit);
  assert.equal(interactStory(s,c).kind,'blocked');clearEnemies(s);assert.equal(interactStory(s,c).kind,'blocked');assert.equal(c.credits,0);
});
test('support installation respects energy and cooldown; station replenishes safe phase', () => {
  const s=initialState('school',true),c=newCampaign();s.missionPhase='supports';s.energy=0;Object.assign(s,zoneFor(s.zone).supports[0]);
  assert.equal(installSupport(s).kind,'blocked');Object.assign(s,{x:0,z:-11.5});assert.equal(interactStory(s,c).kind,'charge');assert.equal(s.energy,40);
  Object.assign(s,zoneFor(s.zone).supports[0]);assert.equal(installSupport(s).kind,'support');Object.assign(s,zoneFor(s.zone).supports[1]);assert.equal(installSupport(s).kind,'blocked');
});
test('all four side quests require acceptance, collection and the correct giver', () => {
  const c=newCampaign();
  for(const q of sideQuests){const s=initialState(q.zone,true);assert.ok(acceptSide(c,q.id));assert.equal(acceptSide(c,q.id),false);assert.equal(claimSide(c,q.id,q.giver),false);
    for(const p of q.points){Object.assign(s,p);const r=interactStory(s,c);assert.equal(r.kind,'questItem');assert.equal(r.id,p.id);}
    assert.equal(questCount(c,q),q.points.length);assert.equal(claimSide(c,q.id,'wrong'),false);assert.ok(claimSide(c,q.id,q.giver));assert.equal(claimSide(c,q.id,q.giver),false);
  }
  assert.equal(c.credits,410);assert.deepEqual(parseCampaign(JSON.stringify(c)),c);
});
test('preview mode cannot collect or advance missions and gives no rewards', () => {
  const s=initialState('school',true),c=newCampaign();s.exploring=true;s.recovered.fill(true);clearEnemies(s);Object.assign(s,zoneFor(s.zone).nodes[0]);
  assert.equal(nearby(s),null);assert.equal(storyNearby(s,c),null);assert.equal(advanceMission(s,.05),null);assert.equal(installSupport(s),null);assert.deepEqual(attack(s,{x:0,z:0}),[]);assert.equal(c.credits,0);
});
test('campaign parsing rejects corruption and preserves valid progress', () => {
  const c=newCampaign();assert.throws(()=>parseCampaign('{'));assert.throws(()=>parseCampaign(JSON.stringify({...c,credits:100})));
  assert.throws(()=>parseCampaign(JSON.stringify({...c,completed:['M003'],credits:800})));assert.throws(()=>parseCampaign(JSON.stringify({...c,pickups:['unknown']})));
  acceptSide(c,'SQ01');c.pickups.push('tool-1');const restored=parseCampaign(JSON.stringify(c));assert.equal(restored.pickups.length,1);assert.equal(restored.sideAccepted[0],'SQ01');
});
test('separate zone states do not share mutable encounter data', () => { const a=initialState('school',true),b=initialState('school',true);a.enemies[0].hp=0;a.recovered[0]=true;assert.equal(b.enemies[0].hp,60);assert.equal(b.recovered[0],false); });
