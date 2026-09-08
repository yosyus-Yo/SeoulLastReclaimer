import './style.css';
import './journal.css';
import { handlePanelShortcut } from './panel-shortcuts.js';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { SAOPass } from 'three/addons/postprocessing/SAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { makeWorld } from './world.js';
import { initialState, tick, nearby, interact, shield, dash, jump } from './simulation.js';
import { recoverPosition } from './collision-world.js';
import { SimulationClock } from './simulation-clock.js';
import { traversalNearby, interactTraversal, releaseClimb, insideBuilding } from './traversal.js';
import { findPath, followPath } from './navigation.js';
import { attack, facePoint, updateCombat } from './combat.js';
import { createCombatView } from './combat-view.js';
import { zones, zoneFor, missions, sideQuests } from './zones.js';
import { SAVE_KEY, newCampaign, parseCampaign, available, acceptSide, claimSide, questCount, storyNearby, interactStory, installSupport, advanceMission, objectiveText } from './campaign.js';
import { createQuestView } from './quest-view.js';
import { npcDesigns } from './npc-designs.js';
import { graphicsPresets, graphicsOptions, FramePacer } from './graphics.js';

const $ = id => document.getElementById(id);
const canvas = $('world');
let graphics = graphicsOptions();
try { graphics = graphicsOptions(JSON.parse(localStorage.getItem('slr.graphics.v1'))); } catch { /* Optional preferences. */ }
$('quality').value = graphics.quality; $('frame-limit').value = String(graphics.fps);
const pacer = new FramePacer();
const simulationClock = new SimulationClock();
const scene = new THREE.Scene();
const state = initialState('plaza', true);
let campaign = newCampaign(), saveBlocked = false;
try { const raw = localStorage.getItem(SAVE_KEY); if (raw) campaign = parseCampaign(raw); }
catch (error) { console.warn('Campaign save could not be loaded:', error); saveBlocked = true; }
const path = [];
const moveMarker = new THREE.Mesh(new THREE.RingGeometry(.32, .39, 40), new THREE.MeshBasicMaterial({ color: 0xb9efb2, transparent: true, opacity: .85, side: THREE.DoubleSide, depthWrite: false }));
moveMarker.rotation.x = -Math.PI / 2; moveMarker.visible = false; scene.add(moveMarker);
function cancelMove() { path.length = 0; moveMarker.visible = false; }
let renderer;
try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' }); }
catch (error) { $('load-label').textContent = 'WebGL 2를 사용할 수 없습니다. 하드웨어 가속을 켠 최신 브라우저에서 다시 열어주세요.'; throw error; }
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5)); renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.shadowMap.autoUpdate = false; renderer.shadowMap.needsUpdate = true;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;
const camera = new THREE.PerspectiveCamera(39, innerWidth / innerHeight, .1, 300);
const offset = new THREE.Vector3(16, 16, 20);
const desiredTarget = new THREE.Vector3(state.x, 1.1, state.z - 3.5);
camera.position.copy(desiredTarget).add(offset);
const controls = new OrbitControls(camera, canvas);
controls.target.copy(desiredTarget); controls.enableDamping = true; controls.dampingFactor = .08;
controls.enableRotate = false; controls.enablePan = false; controls.minDistance = 10; controls.maxDistance = 44; controls.maxPolarAngle = Math.PI * .47; controls.minPolarAngle = .15;
controls.update();
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const sao = new SAOPass(scene, camera, new THREE.Vector2(640, 360));
sao.params.saoIntensity = .022; sao.params.saoScale = 1; sao.params.saoKernelRadius = 16; sao.params.saoBlurRadius = 4;
composer.addPass(sao);
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), .17, .5, 1.65); composer.addPass(bloom); composer.addPass(new OutputPass());
let world, combatView, questView, transitioning = false, ready = false, started = false, photo = false, base = false, elapsed = 0, fpsTime = 0, frames = 0;
let attacking = false, aimValid = false;
let toastTimer = 0, shadowTimer = 0;
const keys = new Set();
const settings = $('settings');
const defeat = $('defeat');
const journal = $('journal'), returnDialog = $('return-dialog'), resultDialog = $('mission-result');
const trainingEntry = document.createElement('button');
trainingEntry.id = 'training-start'; trainingEntry.className = 'training-entry';
trainingEntry.textContent = '이동 훈련장 · 점프 / 실내 / 외벽 등반';
journal.querySelector('.credits').before(trainingEntry);
const designsDialog = $('npc-designs');
let journalNpc = null;
const npcDialogues = {
  kiseok: '들어가는 사람 숫자부터 세. 나올 때 그 숫자 맞추는 게 우리 일이야. 물류센터 현장부터 살펴보자.',
  seorin: '치료는 시간을 벌어야 할 수 있어요. 학교의 안전선을 확보해 주세요. 남은 보급품도 필요합니다.',
  mira: '원본 기록과 이름이 있어야 책임을 물을 수 있어요. 누락된 노동자의 명패까지 찾아주세요.',
  doyun: '현장에서는 공격보다 대피로가 먼저다. 출동 전에 광장의 배전함부터 복구해 두자.',
};
let audioContext, audioGain;
function audio() {
  if (!$('sound').checked) return;
  if (audioContext) { audioContext.resume(); audioGain.gain.setTargetAtTime(.055, audioContext.currentTime, .3); return; }
  try {
    audioContext = new AudioContext(); audioGain = audioContext.createGain(); audioGain.gain.value = .055; audioGain.connect(audioContext.destination);
    const buffer = audioContext.createBuffer(1, audioContext.sampleRate * 3, audioContext.sampleRate); const channel = buffer.getChannelData(0);
    let smooth = 0; for (let i = 0; i < channel.length; i++) { smooth = (smooth + (Math.random() * 2 - 1) * .05) / 1.05; channel[i] = smooth * 3; }
    const noise = audioContext.createBufferSource(); noise.buffer = buffer; noise.loop = true;
    const filter = audioContext.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 850;
    noise.connect(filter); filter.connect(audioGain); noise.start();
    const hum = audioContext.createOscillator(); hum.frequency.value = 72;
    const humGain = audioContext.createGain(); humGain.gain.value = .1; hum.connect(humGain); humGain.connect(audioGain); hum.start();
  } catch { /* Audio is optional; gameplay remains available. */ }
}
function chime() {
  if (!audioContext || !$('sound').checked) return;
  const osc = audioContext.createOscillator(), gain = audioContext.createGain();
  osc.type = 'sine'; osc.frequency.setValueAtTime(440, audioContext.currentTime); osc.frequency.exponentialRampToValueAtTime(980, audioContext.currentTime + .3);
  gain.gain.setValueAtTime(.08, audioContext.currentTime); gain.gain.exponentialRampToValueAtTime(.001, audioContext.currentTime + .5);
  osc.connect(gain); gain.connect(audioContext.destination); osc.start(); osc.stop(audioContext.currentTime + .55);
}
function toast(text) { $('toast').textContent = text; $('toast').classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').classList.remove('show'), 4200); }
function saveCampaign() {
  if (saveBlocked) { toast('이전 저장을 읽을 수 없어 덮어쓰지 않았습니다. 현재 플레이는 계속할 수 있습니다.'); return; }
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(campaign)); }
  catch { toast('브라우저에 진행을 저장하지 못했습니다. 이번 세션에서는 계속 플레이할 수 있습니다.'); }
}
function drawMap() {
  const z = zoneFor(state.zone), b = z.bounds;
  const pos = p => ({ x: 10 + (p.x - b.minX) / (b.maxX - b.minX) * 130, y: 10 + (p.z - b.minZ) / (b.maxZ - b.minZ) * 140 });
  let svg = '<rect x="10" y="10" width="130" height="140" fill="#87968a20" stroke="#c3d7b744"/>';
  for (const o of [...z.obstacles, ...(z.platforms || [])]) { const p = pos({ x: o.x - o.w / 2, z: o.z - o.d / 2 }); svg += `<rect class="map-buildings" x="${p.x}" y="${p.y}" width="${o.w / (b.maxX - b.minX) * 130}" height="${o.d / (b.maxZ - b.minZ) * 140}"/>`; }
  z.nodes.forEach((n, i) => { const p = pos(n); svg += `<circle class="map-node" id="map-node-${i}" cx="${p.x}" cy="${p.y}" r="3"/>`; });
  for (const n of z.npcs) { const p = pos(n); svg += `<circle cx="${p.x}" cy="${p.y}" r="3" fill="#e6d8a2"/>`; }
  for (const q of sideQuests) if (q.zone === z.id && campaign.sideAccepted.includes(q.id)) for (const item of q.points) if (!campaign.pickups.includes(item.id)) { const p = pos(item); svg += `<rect x="${p.x-2}" y="${p.y-2}" width="4" height="4" fill="#b9d995"/>`; }
  svg += '<path id="map-player" d="M0 -5L4 4L0 2L-4 4Z"/>';
  $('zone-map').innerHTML = svg; $('zone-map').setAttribute('aria-label', z.name + ' 이동 구역과 목표 지도');
  $('district-name').textContent = z.name; $('region-label').textContent = 'SEOUL / ' + z.name;
  $('mission-zone').textContent = z.safe ? z.name + ' · 안전 구역' : z.subtitle;
  $('mission').classList.toggle('is-hub', z.safe);
  $('mission').classList.toggle('is-training', !!z.training);
  $('mission').setAttribute('aria-label', z.safe ? '광장 안내' : '현재 현장 목표');
  $('training-controls').hidden = !z.training;
  canvas.setAttribute('aria-label', `${z.name} 3D 화면. 우클릭 또는 WASD 이동, Space 점프, C 회피, 좌클릭 공격, E 상호작용, Q 방어·지지점 설치, J 임무 목록.`);
}
function openJournal(npc = null) {
  if (!ready || state.dead) return;
  if (!started) startSession();
  journalNpc = npc; cancelMove(); keys.clear(); attacking = false;
  $('journal-speaker').textContent = npc ? zoneFor('plaza').npcs.find(n => n.id === npc)?.name || '출동 게시판' : '귀환 현장 게시판';
  $('journal-dialogue').textContent = npc ? npcDialogues[npc] : '첫 챕터 · 회수자의 이름. 완료한 임무 다음으로 새로운 출동이 열립니다.';
  const design = npcDesigns[npc];
  $('npc-portrait-frame').hidden = !design; $('npc-profile').hidden = !design;
  if (design) { $('npc-portrait').src = design.image; $('npc-portrait').alt = design.name + ' 캐릭터 디자인'; $('npc-profile').textContent = `${design.age}세 · ${design.role}`; }
  else $('npc-portrait').removeAttribute('src');
  $('credits').textContent = campaign.credits + ' C';
  $('training-start').disabled = state.zone !== 'plaza';
  $('mission-list').innerHTML = missions.map(m => {
    const atHub = state.zone === 'plaza', unlocked = available(campaign, m.id);
    return `<article class="mission-card"><p>${m.id} · ${m.giver}</p><h3>${m.name}</h3><div class="card-description" tabindex="0" aria-label="${m.name} 설명">${m.brief}</div><footer><span>${m.credits} C · ${m.rescued ? m.rescued + '명 구조' : '원본 3개 확보'}</span><div class="card-actions"><button data-deploy="${m.zone}" aria-label="${m.name} 출동" ${atHub && unlocked ? '' : 'disabled'}>${!atHub ? '광장에서 출동' : campaign.completed.includes(m.id) ? '재출동' : unlocked ? '출동' : m.requires + ' 완료 후'}</button><button data-preview="${m.zone}" aria-label="${zoneFor(m.zone).name} 둘러보기" ${atHub ? '' : 'disabled'}>둘러보기</button></div></footer></article>`;
  }).join('');
  $('quest-list').innerHTML = sideQuests.map(q => {
    const accepted = campaign.sideAccepted.includes(q.id), done = campaign.sideClaimed.includes(q.id), count = questCount(campaign, q), giver = zoneFor('plaza').npcs.find(n => n.id === q.giver).name;
    const button = done ? '<span>보상 수령 완료</span>' : !accepted ? `<button data-accept="${q.id}">의뢰 수락</button>` : count === q.points.length && npc === q.giver && state.zone === 'plaza' ? `<button data-claim="${q.id}">완료 보고</button>` : `<span>${count}/${q.points.length} · ${count === q.points.length ? giver + '에게 보고' : zoneFor(q.zone).name}</span>`;
    return `<article class="quest-card"><p>${q.id} · ${giver}</p><h3>${q.name}</h3><div class="card-description" tabindex="0" aria-label="${q.name} 설명">${q.description}</div><footer><span>${q.credits} C</span><div class="card-actions">${button}</div></footer></article>`;
  }).join('');
  if (!journal.open) journal.showModal();
}
function requestReturn() {
  if (!ready || state.zone === 'plaza') return;
  cancelMove(); keys.clear(); attacking = false;
  if (state.complete || state.exploring) enterZone('plaza'); else returnDialog.showModal();
}
function currentInteraction() {
  const traversal = traversalNearby(state); if (traversal) return traversal;
  const basic = nearby(state), story = storyNearby(state, campaign);
  if (!basic) return story; if (!story) return basic;
  const p = interactionPosition(basic);
  return Math.hypot(story.x - state.x, story.z - state.z) < Math.hypot(p.x - state.x, p.z - state.z) ? story : basic;
}
function interactionPosition(t) {
  const z = zoneFor(state.zone);
  return t.x !== undefined ? t : t.kind === 'node' ? z.nodes[t.index] : t.kind === 'aid' ? z.aid : z.anchor;
}
function performInteraction() {
  const traversal = interactTraversal(state);
  if (traversal) { cancelMove(); keys.clear(); attacking = false; toast(traversal.message); return; }
  const target = currentInteraction();
  if (!target) { toast('표시된 대상 가까이에서 E를 누르세요.'); return; }
  if (['npc', 'board', 'return', 'finish', 'charge', 'questItem'].includes(target.kind)) {
    const result = interactStory(state, campaign);
    if (result?.kind === 'npc') openJournal(result.id);
    else if (result?.kind === 'board') openJournal();
    else if (result?.kind === 'return') requestReturn();
    else if (result?.kind === 'finished') {
      saveCampaign(); cancelMove(); attacking = false;
      const m = missions.find(m => m.id === result.mission);
      $('result-title').textContent = m.name + ' · 완료'; $('result-text').textContent = result.message;
      $('result-reward').textContent = `${state.rescued}명 귀환 · 보상 ${result.reward} C · 보유 ${campaign.credits} C`;
      resultDialog.showModal(); chime();
    } else if (result) { if (result.kind === 'questItem') { saveCampaign(); drawMap(); } toast(result.message || result.label); chime(); }
    return;
  }
  const result = interact(state);
  if (result?.kind === 'node') { world.recover(result.index); chime(); toast(`${zoneFor(state.zone).nodes[result.index].id} 확보 완료 · 위상 에너지 +25`); }
  else if (result?.kind === 'drop') { combatView.play([{ type: 'collect', x: result.x, z: result.z }]); chime(); toast(`잔향 에너지 +${result.amount}`); }
  else if (result?.kind === 'aid') toast('구급함 사용 · 체력 회복');
  else if (result?.kind === 'healthy') toast('체력이 가득 찼습니다. 구급함은 보존했습니다.');
  else if (result?.kind === 'full') toast('에너지가 가득 찼습니다. 잔량은 현장에 보존됩니다.');
}
$('journal-open').addEventListener('click', () => openJournal());
$('npc-designs-open').addEventListener('click', () => {
  if (!ready || state.dead) return;
  cancelMove(); keys.clear(); attacking = false;
  $('npc-design-grid').innerHTML = Object.values(npcDesigns).map(d => `<article class="npc-design-card"><a href="${d.image}" target="_blank" rel="noopener" aria-label="${d.name} 전신 시안 크게 보기"><img src="${d.image}" alt="${d.name} 전신 캐릭터 디자인" /></a><p>${d.code} · ${d.age}세 · ${Math.round(d.height * 100)}cm</p><h3>${d.name}<span>${d.role}</span></h3><div>${d.description}</div><div class="npc-palette">${d.colors.map(c => `<i style="background:${c}" aria-hidden="true"></i>`).join('')}</div></article>`).join('');
  designsDialog.showModal();
});
$('npc-designs-close').addEventListener('click', () => designsDialog.close());
$('journal-close').addEventListener('click', () => journal.close());
journal.addEventListener('close', () => { keys.clear(); cancelMove(); attacking = false; canvas.focus(); });
$('hub-return').addEventListener('click', requestReturn);
$('training-start').addEventListener('click', () => { if (state.zone === 'plaza') { journal.close(); enterZone('training', true); } });
$('training-reset').addEventListener('click', () => { if (state.zone === 'training') enterZone('training', true); });
for (const [id, goal] of [['walk-to-building', { x: 20, z: 8.3 }], ['walk-to-climb', { x: 12.8, z: 0 }]]) $(id).addEventListener('click', () => {
  if (state.zone !== 'training' || state.dead || state.climb) return;
  const route = findPath(state, goal); path.splice(0, path.length, ...route); attacking = false; keys.clear(); canvas.focus();
  toast(route.length ? '표시된 입구로 이동합니다. 도착 후 E를 누르세요.' : '지상으로 내려오거나 문을 열어 이동 경로를 확보해 주세요.');
});
$('fall-practice').addEventListener('click', () => {
  if (state.zone !== 'training' || state.dead) return;
  const p = zones.training.platforms.find(p => p.id === 'step-8');
  recoverPosition(state); Object.assign(state, { x: p.x, y: p.height, z: p.z, fallPeak: p.height, supportId: p.id, dx: 1, dz: 0, landingEvent: null });
  cancelMove(); keys.clear(); attacking = false; canvas.focus();
  toast('4.8m 발판입니다. C로 앞쪽 회피하거나 WASD로 가장자리를 넘어가 낙하 피해를 확인하세요.');
});
$('safe-return').addEventListener('click', () => { if (state.zone === 'training' && !state.dead) { recoverPosition(state); cancelMove(); keys.clear(); attacking = false; toast('마지막 안전한 지상 위치로 돌아왔습니다. 체력은 유지됩니다.'); canvas.focus(); } });
$('return-cancel').addEventListener('click', () => returnDialog.close());
$('return-confirm').addEventListener('click', () => { returnDialog.close(); enterZone('plaza'); });
$('result-return').addEventListener('click', () => { resultDialog.close(); enterZone('plaza'); });
$('result-stay').addEventListener('click', () => resultDialog.close());
journal.addEventListener('click', event => {
  const button = event.target.closest('button'); if (!button) return;
  if (button.dataset.deploy && state.zone === 'plaza') { journal.close(); enterZone(button.dataset.deploy); }
  if (button.dataset.preview && state.zone === 'plaza') { journal.close(); enterZone(button.dataset.preview, true); }
  if (button.dataset.accept) { acceptSide(campaign, button.dataset.accept); saveCampaign(); drawMap(); openJournal(journalNpc); }
  if (button.dataset.claim && state.zone === 'plaza' && journalNpc) { if (claimSide(campaign, button.dataset.claim, journalNpc)) { saveCampaign(); chime(); openJournal(journalNpc); } }
});
function setPhoto(value) {
  if (!ready) return; photo = value; controls.enableRotate = value; cancelMove();
  attacking = false;
  document.body.classList.toggle('photograph', value); $('photo').setAttribute('aria-pressed', String(value)); $('photo-hint').classList.toggle('hidden', !value); $('prompt').classList.add('hidden'); keys.clear();
  if (!value) { const distance = camera.position.distanceTo(controls.target); camera.position.copy(controls.target).addScaledVector(offset.clone().normalize(), distance); controls.update(); }
}
function startSession() {
  if (!ready) return;
  started = true; $('intro').classList.add('hidden'); $('mission').classList.remove('hidden'); document.body.classList.add('playing'); canvas.focus();
  toast('귀환광장에 도착했습니다. J로 미션과 의뢰를 확인하거나 동료 곁에서 E로 대화하세요.'); audio();
  if (saveBlocked) toast('기존 캠페인 저장을 읽을 수 없어 보존했습니다. 현재 플레이는 가능합니다.');
}
$('enter').addEventListener('click', startSession);
$('photo').addEventListener('click', () => setPhoto(!photo));
function toggleSettings() {
  if (settings.open) { settings.close(); return; }
  settings.showModal(); keys.clear(); cancelMove(); attacking = false;
}
$('settings-open').addEventListener('click', toggleSettings);
$('settings-close').addEventListener('click', () => settings.close());
settings.addEventListener('close', () => { keys.clear(); $('settings-open').focus(); });
defeat.addEventListener('cancel', e => e.preventDefault());
$('retry').addEventListener('click', () => { defeat.close(); enterZone(state.zone); });
$('material-compare').addEventListener('click', () => {
  if (!ready) return; base = !base; world.compare(base); $('material-compare').setAttribute('aria-pressed', String(base));
  $('material-compare').querySelector('span').textContent = base ? '스캔 재질로 돌아가기' : '기본 재질과 비교';
  toast(base ? '같은 공간 · 스캔 재질과 노면 반사를 끈 상태입니다.' : '스캔 재질, 표면 요철과 노면 반사를 복원했습니다.');
});
$('light').addEventListener('input', event => { $('light-value').textContent = event.target.value + '%'; world?.setLight(+event.target.value / 100); $('clock').textContent = +event.target.value > 65 ? '06:18' : '05:42'; });
$('wet').addEventListener('input', event => { $('wet-value').textContent = event.target.value + '%'; world?.setWet(+event.target.value / 100); });
$('sound').addEventListener('change', () => { if ($('sound').checked && started) audio(); else if (audioGain) audioGain.gain.setTargetAtTime(0, audioContext.currentTime, .15); });
function resize() {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight);
  sao.setSize(Math.round(innerWidth * .6), Math.round(innerHeight * .6));
}
function setQuality() {
  graphics = graphicsOptions({ quality: $('quality').value, fps: $('frame-limit').value });
  const preset = graphicsPresets[graphics.quality];
  renderer.setPixelRatio(Math.min(devicePixelRatio, preset.pixelRatio)); composer.setPixelRatio(renderer.getPixelRatio());
  sao.params.saoIntensity = state.zone === 'logistics' ? .012 : .003;
  sao.params.saoKernelRadius = state.zone === 'logistics' ? 16 : 8;
  // The SAO normal override has no cutout alpha and would outline whole NPC cards.
  sao.enabled = preset.ao && zoneFor(state.zone).npcs.length === 0; bloom.enabled = preset.bloom;
  world?.setGraphics(preset); resize(); pacer.reset(); fpsTime = 0; frames = 0;
  $('graphics-budget').textContent = `렌더 배율 ${renderer.getPixelRatio().toFixed(2)}× · 그림자 ${preset.shadowSize}px · 반사 ${preset.reflectionSize}px / 최대 ${preset.reflectionHz}회/초 · 최대 ${graphics.fps} FPS (성능 보장값 아님)`;
  try { localStorage.setItem('slr.graphics.v1', JSON.stringify(graphics)); } catch { /* Rendering works without storage. */ }
}
$('quality').addEventListener('change', setQuality);
$('frame-limit').addEventListener('change', setQuality);
addEventListener('resize', resize);
addEventListener('blur', () => { keys.clear(); cancelMove(); attacking = false; });
document.addEventListener('visibilitychange', () => { keys.clear(); cancelMove(); attacking = false; if (audioGain) audioGain.gain.setTargetAtTime(document.hidden ? 0 : $('sound').checked && started ? .055 : 0, audioContext.currentTime, .3); });
const panelShortcuts = {
  KeyJ: { dialog: journal, toggle: () => journal.open ? journal.close() : openJournal() },
  KeyP: { toggle: () => setPhoto(!photo) },
  Escape: { dialog: settings, toggle: () => {
    if (settings.open) toggleSettings();
    else if (photo) setPhoto(false);
    else toggleSettings();
  } },
};
addEventListener('keydown', event => {
  if (!ready) return;
  if (handlePanelShortcut(event, panelShortcuts, document.querySelector('dialog[open]'))) return;
  if (event.target.closest?.('dialog, input, select, textarea') || event.target.isContentEditable || event.isComposing) return;
  if (!started || photo || settings.open || journal.open || returnDialog.open || resultDialog.open || designsDialog.open || state.dead) return;
  if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'KeyC', 'KeyQ', 'KeyE'].includes(event.code)) event.preventDefault();
  keys.add(event.code);
  if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'KeyC'].includes(event.code)) cancelMove();
  if (event.repeat) return;
  if (event.code === 'KeyE') performInteraction();
  if (event.code === 'KeyQ') {
    const support = installSupport(state);
    if (support) toast(support.message);
    else { const aim = getAim(); if (aim) facePoint(state, aim); if (shield(state)) chime(); else toast(state.energy < 20 ? '위상 에너지 20이 필요합니다.' : '잔금막이 재충전 중입니다.'); }
  }
  if (event.code === 'Space') { if (state.climb) releaseClimb(state); else if (jump(state)) attacking = false; }
  if (event.code === 'KeyC' && dash(state)) world.dash();
});
addEventListener('keyup', e => keys.delete(e.code));
canvas.addEventListener('contextmenu', e => e.preventDefault());
const groundRay = new THREE.Raycaster(), groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const cursor = new THREE.Vector2(), clickedGround = new THREE.Vector3();
function pickWalkSurface(ray) {
  const candidates = [], point = new THREE.Vector3();
  if (ray.ray.intersectPlane(groundPlane, point)) candidates.push(point.clone());
  for (const p of zoneFor(state.zone).platforms || []) {
    if (insideBuilding(state) && p.kind === 'roof') continue;
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -p.height);
    if (ray.ray.intersectPlane(plane, point) && Math.abs(point.x - p.x) <= p.w / 2 && Math.abs(point.z - p.z) <= p.d / 2) candidates.push(point.clone());
  }
  return candidates.sort((a, b) => a.distanceToSquared(ray.ray.origin) - b.distanceToSquared(ray.ray.origin))[0];
}
const aimCursor = new THREE.Vector2();
function updateAim(event) {
  const rect = canvas.getBoundingClientRect();
  aimCursor.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1); aimValid = true;
}
function getAim() {
  if (!aimValid || !combatView) return null;
  groundRay.setFromCamera(aimCursor, camera);
  const id = combatView.pick(groundRay);
  const target = [...state.enemies, ...state.props].find(t => t.id === id && t.hp > 0);
  if (target) return { x: target.x, z: target.z };
  if (!groundRay.ray.intersectPlane(groundPlane, clickedGround)) return null;
  return { x: clickedGround.x, z: clickedGround.z };
}
function shoot() { const aim = getAim(); if (aim) combatView.play(attack(state, aim)); }
canvas.addEventListener('pointermove', updateAim);
addEventListener('pointerup', event => { if (event.button === 0) attacking = false; });
canvas.addEventListener('pointercancel', () => { attacking = false; });
canvas.addEventListener('pointerleave', () => { attacking = false; });
canvas.addEventListener('pointerdown', event => {
  if (!ready || !started || photo || settings.open || journal.open || returnDialog.open || resultDialog.open || designsDialog.open || state.dead) return;
  updateAim(event);
  if (event.button === 0) { event.preventDefault(); cancelMove(); attacking = true; shoot(); canvas.focus({ preventScroll: true }); return; }
  if (event.button !== 2) return;
  attacking = false;
  event.preventDefault();
  const rect = canvas.getBoundingClientRect();
  cursor.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
  groundRay.setFromCamera(cursor, camera);
  const destination = pickWalkSurface(groundRay);
  if (!destination) return;
  if (!state.grounded || Math.abs(destination.y - state.y) > .02) { cancelMove(); toast('다른 높이의 발판은 WASD와 Space 점프로 이동하세요. 우클릭은 같은 높이에서만 가능합니다.'); return; }
  const next = findPath(state, { x: destination.x, z: destination.z, ...(destination.y ? { y: destination.y } : {}) });
  path.splice(0, path.length, ...next);
  moveMarker.visible = path.length > 0;
  if (path.length) { const goal = path[path.length - 1]; moveMarker.position.set(goal.x, (goal.y || 0) + .045, goal.z); moveMarker.scale.setScalar(1.45); }
  canvas.focus({ preventScroll: true });
});
canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); ready = false; $('loading').classList.remove('hide'); $('load-label').textContent = '그래픽 연결이 끊겼습니다. 페이지를 새로 고쳐 다시 연결해 주세요.'; });
const forward = new THREE.Vector3(), side = new THREE.Vector3(), target = new THREE.Vector3(), projected = new THREE.Vector3();
function hud() {
  const zone = zoneFor(state.zone), bounds = zone.bounds;
  $('movement-status').textContent = `${state.climb ? '외벽 등반' : insideBuilding(state) ? '훈련동 실내' : state.grounded ? state.landTimer > .05 ? '착지' : '접지' : state.vy > 0 ? '상승' : '낙하'} · ${state.y.toFixed(1)}m`;
  $('hp').textContent = `${state.hp} / 120`; $('hp-fill').style.width = `${state.hp / 120 * 100}%`;
  $('guard-status').textContent = state.shield > 0 ? `방벽 ${state.shieldHp} · ${state.shield.toFixed(1)}초` : state.shieldCooldown > 0 ? `Q 재충전 ${state.shieldCooldown.toFixed(1)}초` : 'Q 잔금막 준비 · 에너지 20';
  $('combat-count').textContent = zone.safe ? `보유 ${campaign.credits} C · 주요 미션 ${campaign.completed.length}/3 완료` : state.exploring ? '탐방 중에는 미션·의뢰·보상이 진행되지 않습니다.' : `남은 위협 ${state.enemies.filter(e => e.hp > 0).length} · 구조 ${state.rescued}명`;
  document.body.classList.toggle('hit-flash', state.hurtFlash > 0);
  $('energy').innerHTML = `${state.energy}<span> / 100</span>`; $('energy-fill').style.width = state.energy + '%';
  const count = state.recovered.filter(Boolean).length; $('progress-count').innerHTML = zone.training ? `${state.y.toFixed(1)} <i>m · 현재 높이</i>` : zone.safe ? '광장 <i>안전 구역</i>' : `0${count} <i>/ 0${zone.nodes.length}</i>`;
  document.querySelectorAll('.mission-progress>div i').forEach((el, i) => el.classList.toggle('done', i < count));
  for (let i = 0; i < zone.nodes.length; i++) if ($('map-node-' + i)) $('map-node-' + i).style.opacity = state.recovered[i] ? '.15' : '1';
  $('map-player')?.setAttribute('transform', `translate(${10 + (state.x - bounds.minX) / (bounds.maxX - bounds.minX) * 130} ${10 + (state.z - bounds.minZ) / (bounds.maxZ - bounds.minZ) * 140}) rotate(${Math.atan2(state.dx, -state.dz) * 180 / Math.PI})`);
  $('objective').textContent = state.dead ? '출동 중단. 다시 시도하세요.' : zone.training ? state.climb ? '외벽을 따라 옥상까지 올라가 보세요.' : insideBuilding(state) ? '정비실 오른쪽 계단으로 옥상에 올라가세요.' : '발판 · 실내 훈련동 · 외벽을 탐험하세요.' : zone.safe ? '동료와 대화하고 출동을 준비하세요.' : objectiveText(state);
  $('mission-note').textContent = zone.training ? state.climb ? 'W/S 오르내리기 · A/D 좌우\nSpace / E 놓기 · 높은 낙하 주의' : 'E 문 / 외벽 · WASD 계단 이동\nSpace 점프 · C 회피 · ⌂ 귀환' : zone.safe ? 'J 임무·퀘스트 · E 대화' : state.exploring ? 'P 촬영 모드 · 우측 위 ⌂ 광장 복귀' : state.missionPhase === 'supports' ? 'Q 지지점 설치 · E 구조 장비 충전' : state.missionPhase === 'evacuate' ? '대피 중 · 추가 위협을 처리하세요' : 'E 조사·회수 · J 목표 확인';
  const near = currentInteraction();
  $('prompt').classList.toggle('hidden', !near || !started || photo || !!state.climb || settings.open || journal.open || returnDialog.open || resultDialog.open || designsDialog.open);
  if (near) {
    const p = interactionPosition(near);
    projected.set(p.x, (p.y || 0) + 1.6, p.z).project(camera);
    $('prompt').style.left = `${(projected.x * .5 + .5) * innerWidth}px`; $('prompt').style.top = `${(-projected.y * .5 + .5) * innerHeight}px`;
    $('prompt').querySelector('span').textContent = near.label || (near.kind === 'node' ? zone.id === 'archive' ? '원본 기록 확보' : '잔향 조사' : near.kind === 'drop' ? '처치 잔향 회수' : near.kind === 'aid' ? '구급함 · 체력 회복' : '상호작용');
  }
}
function render(now) {
  requestAnimationFrame(render);
  if (!ready || document.hidden) { pacer.reset(); simulationClock.reset(); fpsTime = 0; frames = 0; return; }
  const paused = !started || settings.open || journal.open || returnDialog.open || resultDialog.open || designsDialog.open || state.dead;
  const frameSeconds = pacer.step(now, paused ? Math.min(30, graphics.fps) : graphics.fps);
  if (frameSeconds === null) return;
  const dt = Math.min(.05, frameSeconds);
  elapsed += dt; let moving = false;
  const active = started && !photo && !settings.open && !journal.open && !returnDialog.open && !resultDialog.open && !designsDialog.open && !state.dead;
  simulationClock.advance(frameSeconds, active, step => {
    if (state.dead) return;
    camera.getWorldDirection(forward); forward.y = 0; forward.normalize(); side.crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
    const vertical = Number(keys.has('KeyW')) - Number(keys.has('KeyS')), horizontal = Number(keys.has('KeyD')) - Number(keys.has('KeyA'));
    const running = keys.has('ShiftLeft') || keys.has('ShiftRight');
    if (state.climb) {
      cancelMove(); moving = tick(state, step, { x: horizontal, z: -vertical }) || moving;
    } else if (vertical || horizontal) {
      cancelMove();
      moving = tick(state, step, { x: forward.x * vertical + side.x * horizontal, z: forward.z * vertical + side.z * horizontal }, running) || moving;
    } else moving = followPath(state, path, step, running) || moving;
    if (state.landingEvent) {
      combatView.play([state.landingEvent]);
      if (state.landingEvent.damage) toast(`낙하 ${state.landingEvent.height.toFixed(1)}m · 피해 ${state.landingEvent.damage}`);
      state.landingEvent = null;
    }
    combatView.play(updateCombat(state, step, combatView.visible));
    if (attacking) shoot();
    const storyEvent = advanceMission(state, step); if (storyEvent) toast(storyEvent);
    if (state.dead && !defeat.open) { cancelMove(); keys.clear(); attacking = false; defeat.showModal(); $('retry').focus(); }
  });
  moveMarker.visible = path.length > 0 && active;
  moveMarker.scale.lerp(new THREE.Vector3(1, 1, 1), 1 - Math.exp(-8 * dt));
  if (!photo) {
    desiredTarget.set(state.x, 1.1 + state.y, state.z - 3.5);
    target.copy(controls.target).lerp(desiredTarget, 1 - Math.exp(-4 * dt));
    camera.position.add(target.clone().sub(controls.target)); controls.target.copy(target);
  }
  controls.update();
  world.update(state, dt, elapsed, moving, keys.has('ShiftLeft') || keys.has('ShiftRight'));
  combatView.update(state, dt, elapsed, started && !photo);
  questView.update(state, campaign, dt, started && !photo);
  shadowTimer += dt;
  if (shadowTimer >= 1 / graphicsPresets[graphics.quality].shadowHz) { renderer.shadowMap.needsUpdate = true; shadowTimer = 0; }
  composer.render(); hud();
  fpsTime += frameSeconds; frames++;
  if (fpsTime >= 1) { $('fps').textContent = `${Math.round(frames / fpsTime)} FPS · ${graphicsPresets[graphics.quality].label}${paused ? ' · 메뉴 30' : ''}`; frames = 0; fpsTime = 0; }
}
function releaseScene() {
  scene.remove(moveMarker); world?.dispose(); combatView?.dispose(); questView?.dispose();
  const geometries = new Set(), materials = new Set(), textures = new Set();
  scene.traverse(o => {
    if (o.geometry) geometries.add(o.geometry);
    if (o.material) for (const m of Array.isArray(o.material) ? o.material : [o.material]) materials.add(m);
    o.shadow?.map?.dispose();
  });
  for (const m of materials) for (const value of Object.values(m)) if (value?.isTexture) textures.add(value);
  for (const g of geometries) g.dispose(); for (const m of materials) m.dispose(); for (const t of textures) t.dispose();
  scene.clear(); scene.environment = null; renderer.renderLists.dispose(); world = combatView = questView = null;
}
async function enterZone(zoneId, exploring = false) {
  if (transitioning || !zones[zoneId]) return;
  const zone = zones[zoneId];
  if (zone.training) exploring = true;
  simulationClock.reset();
  if (!exploring && zone.mission && !available(campaign, zone.mission)) { toast('이전 미션을 먼저 완료해야 합니다.'); return; }
  if (photo) setPhoto(false);
  transitioning = true; ready = false; attacking = false; keys.clear(); cancelMove(); aimValid = false;
  $('loading').classList.remove('hide'); $('loading').removeAttribute('aria-hidden'); $('load-fill').style.width = '5%'; $('load-label').textContent = zone.name + ' 진입 중';
  try {
    releaseScene(); Object.assign(state, initialState(zoneId, true)); state.exploring = exploring;
    if (exploring) { state.enemies = []; state.props = []; state.missionPhase = 'explore'; }
    world = await makeWorld(scene, renderer, percent => { $('load-fill').style.width = Math.round(percent * 90) + '%'; }, zoneId);
    combatView = createCombatView(scene, camera, state); combatView.update(state, 0, 0, false);
    questView = await createQuestView(scene, camera, zoneId); questView.update(state, campaign, 0, started);
    scene.add(moveMarker); drawMap();
    desiredTarget.set(state.x, 1.1, state.z - 3.5); controls.target.copy(desiredTarget); camera.position.copy(desiredTarget).add(offset); controls.update();
    world.update(state, 0, elapsed, false, false); world.setWet(+$('wet').value / 100); world.setLight(+$('light').value / 100); world.compare(base);
    renderer.shadowMap.needsUpdate = true;
    setQuality(); composer.render(); ready = true;
    $('load-fill').style.width = '100%'; $('loading').classList.add('hide'); $('loading').setAttribute('aria-hidden', 'true'); $('enter').disabled = false; $('enter').querySelector('span').textContent = '광장으로 들어가기';
    canvas.dataset.ready = 'true'; canvas.dataset.zone = zoneId;
    $('hub-return').disabled = zone.safe;
    if (started) { canvas.focus(); toast(zone.safe ? '귀환광장에 도착했습니다. 동료에게 보고하고 다음 미션을 선택하세요.' : exploring ? '자유탐방입니다. 보상 없이 지형을 둘러보고 광장으로 돌아갈 수 있습니다.' : missions.find(m => m.zone === zoneId).brief); }
  } catch (error) { console.error(error); $('load-label').textContent = '구역을 불러오지 못했습니다. 새로고침하면 저장된 캠페인으로 광장에 복귀합니다.'; }
  finally { transitioning = false; }
}
async function boot() {
  await Promise.race([document.fonts.ready, new Promise(resolve => setTimeout(resolve, 1800))]);
  await enterZone('plaza'); requestAnimationFrame(render);
}
boot();
