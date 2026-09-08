import { missions, sideQuests, zoneFor } from './zones.js';
const near = (a, b, r = 2.5) => Math.hypot(a.x - b.x, a.z - b.z) <= r;
export const SAVE_KEY = 'slr.chapter-one.v1';
export function newCampaign() { return { version: 1, completed: [], sideAccepted: [], sideClaimed: [], pickups: [], credits: 0 }; }
export function available(c, id) { const m = missions.find(m => m.id === id); return !!m && (!m.requires || c.completed.includes(m.requires)); }
export function acceptSide(c, id) { if (!sideQuests.some(q => q.id === id) || c.sideAccepted.includes(id)) return false; c.sideAccepted.push(id); return true; }
export function questCount(c, q) { return q.points.filter(p => c.pickups.includes(p.id)).length; }
export function claimSide(c, id, giver) {
  const q = sideQuests.find(q => q.id === id);
  if (!q || q.giver !== giver || !c.sideAccepted.includes(id) || c.sideClaimed.includes(id) || questCount(c, q) !== q.points.length) return false;
  c.sideClaimed.push(id); c.credits += q.credits; return true;
}
export function parseCampaign(text) {
  const c = JSON.parse(text), validArray = (a, allowed) => Array.isArray(a) && a.length === new Set(a).size && a.every(v => allowed.includes(v));
  if (!c || c.version !== 1 || !validArray(c.completed, missions.map(m => m.id)) || !validArray(c.sideAccepted, sideQuests.map(q => q.id)) || !validArray(c.sideClaimed, sideQuests.map(q => q.id)) || !validArray(c.pickups, sideQuests.flatMap(q => q.points.map(p => p.id)))) throw Error('Invalid campaign data');
  for (const m of missions) if (c.completed.includes(m.id) && m.requires && !c.completed.includes(m.requires)) throw Error('Invalid chapter order');
  for (const q of sideQuests) if (c.sideClaimed.includes(q.id) && (!c.sideAccepted.includes(q.id) || questCount(c, q) !== q.points.length)) throw Error('Invalid quest claim');
  const credits = missions.filter(m => c.completed.includes(m.id)).reduce((n, m) => n + m.credits, 0) + sideQuests.filter(q => c.sideClaimed.includes(q.id)).reduce((n, q) => n + q.credits, 0);
  if (c.credits !== credits) throw Error('Invalid reward balance');
  return c;
}
export function storyNearby(s, c) {
  if (!s.story || s.dead) return null;
  const z = zoneFor(s.zone), targets = [];
  if (z.safe) {
    targets.push({ ...z.board, kind: 'board', label: '출동 게시판 · J' });
    for (const npc of z.npcs) targets.push({ ...npc, kind: 'npc', label: npc.name + '와 대화' });
  } else {
    targets.push({ ...z.exit, kind: s.missionPhase === 'extract' && !s.complete ? 'finish' : 'return', label: s.missionPhase === 'extract' && !s.complete ? '귀환 인원·기록 확인' : '광장으로 귀환' });
    if (s.missionPhase === 'supports') targets.push({ x: 0, z: -11.5, kind: 'charge', label: '구조 장비 에너지 충전' });
  }
  if (s.exploring) return targets.filter(t => t.kind === 'return' && near(s, t))[0] || null;
  for (const q of sideQuests) if (q.zone === z.id && c.sideAccepted.includes(q.id) && !c.sideClaimed.includes(q.id))
    for (const p of q.points) if (!c.pickups.includes(p.id)) targets.push({ ...p, kind: 'questItem', quest: q.id, label: q.id === 'SQ04' ? '배전함 복구' : q.name + ' · 회수' });
  return targets.filter(t => near(s, t)).sort((a, b) => Math.hypot(a.x - s.x, a.z - s.z) - Math.hypot(b.x - s.x, b.z - s.z))[0] || null;
}
export function interactStory(s, c) {
  const t = storyNearby(s, c); if (!t) return null;
  if (t.kind === 'questItem') { c.pickups.push(t.id); return { ...t, message: `${t.label} 완료` }; }
  if (t.kind === 'charge') { s.energy = Math.max(s.energy, 40); return { ...t, message: '구조 장비에서 에너지를 40까지 충전했습니다.' }; }
  if (t.kind === 'finish') {
    const m = missions.find(m => m.zone === s.zone);
    if (!m || !available(c, m.id) || s.enemies.some(e => e.hp > 0) || s.rescued < m.rescued || !s.recovered.every(Boolean)) return { kind: 'blocked', message: '아직 필수 목표가 남아 있습니다.' };
    s.complete = true; s.missionPhase = 'complete';
    const reward = c.completed.includes(m.id) ? 0 : m.credits;
    if (!c.completed.includes(m.id)) { c.completed.push(m.id); c.credits += m.credits; }
    return { kind: 'finished', mission: m.id, reward, message: m.ending };
  }
  return t;
}
function spawn(s, id, x, z, boss = false) {
  const hp = boss ? s.zone === 'archive' ? 240 : 180 : 60;
  s.enemies.push({ id, zone: s.zone, kind: 'chaser', isBoss: boss, name: boss ? '앵커 융합체' : '균열 추적체', x, z, hp, maxHp: hp, phase: 'idle', timer: 0, hitFlash: 0, aimX: 0, aimZ: 0, hit: false });
}
export function installSupport(s) {
  if (s.dead || s.exploring || !s.story || s.missionPhase !== 'supports') return null;
  const z = zoneFor(s.zone), index = z.supports.findIndex((p, i) => !s.supports[i] && near(s, p, 2.5));
  if (index < 0) return null;
  if (s.energy < 20 || s.shieldCooldown > 0) return { kind: 'blocked', message: s.energy < 20 ? '가까운 구조 장비에서 E로 충전하세요.' : '잔금막이 재충전 중입니다.' };
  s.energy -= 20; s.shieldCooldown = 4; s.supports[index] = true;
  if (s.supports.every(Boolean)) { s.missionPhase = 'evacuate'; spawn(s, 'WAVE-L', z.supports[0].x, -10); spawn(s, 'WAVE-R', z.supports[1].x, -10); }
  return { kind: 'support', message: s.supports.every(Boolean) ? '대피 시작. 진입하는 균열체를 막으세요.' : '지지점 고정 완료. 다른 지지점도 확보하세요.' };
}
export function advanceMission(s, seconds) {
  if (!s.story || s.exploring || s.dead || s.complete || zoneFor(s.zone).safe) return null;
  const m = missions.find(m => m.zone === s.zone), clear = s.enemies.every(e => e.hp <= 0);
  if (s.missionPhase === 'scan' && clear && s.recovered.every(Boolean)) {
    if (s.zone === 'archive') { s.missionPhase = 'boss'; spawn(s, 'BOSS', 0, -15, true); return '원본 세 개 확보. 기록 보관구역의 융합체를 저지하세요.'; }
    s.missionPhase = 'supports'; s.energy = Math.max(60, s.energy); return '현장 확보. 두 지지점 옆에서 Q로 잔금막을 설치하세요.';
  }
  if (s.missionPhase === 'evacuate') {
    s.evacuation = Math.min(m.defendSeconds, s.evacuation + Math.min(.05, Math.max(0, seconds)));
    s.rescued = Math.min(m.rescued, Math.floor(s.evacuation / m.defendSeconds * m.rescued));
    if (s.evacuation >= m.defendSeconds && clear) {
      if (s.zone === 'logistics') { s.missionPhase = 'boss'; spawn(s, 'BOSS', 0, -17, true); return '일곱 명의 대피로 확보. 앵커 융합체를 저지하고 돌아가세요.'; }
      s.missionPhase = 'extract'; return '열두 명 대피 완료. 남쪽 교문에서 귀환을 확인하세요.';
    }
  }
  if (s.missionPhase === 'boss' && clear) { s.missionPhase = 'extract'; return '융합체 해체 완료. 남쪽 출구에서 E로 귀환을 확인하세요.'; }
  return null;
}
export function objectiveText(s) {
  if (s.exploring) return '자유탐방 · 지형과 배경을 둘러보세요.';
  if (zoneFor(s.zone).safe) return '동료와 대화하고 J에서 다음 출동을 선택하세요.';
  if (s.complete) return '임무 완료 · 광장으로 돌아가 보고하세요.';
  return { scan: s.zone === 'archive' ? '원본 기록 3개 확보 · 위협 제거' : '현장 잔향 3개 조사 · 위협 제거', supports: '두 지지점 가까이에서 Q로 고정', evacuate: `대피 ${s.rescued}/${missions.find(m => m.zone === s.zone).rescued}명 · 방어선 유지`, boss: '앵커 융합체 해체', extract: '남쪽 출구에서 E · 귀환 확인' }[s.missionPhase];
}
