import './world.js?v=2';
import './engine.js?v=2';
import './renderer.js?v=2';

function $(id) {
  return document.getElementById(id);
}
const world = window.WinterWorld;
// Keep the original storage key so existing expeditions can migrate in place.
const SAVE_KEY = 'little-arcade-last-ember-v1';
const SOUND_KEY = 'little-arcade-last-ember-sound';
const canvas = $('world');
const dialog = $('game-dialog');
const keys = new Set();
const joystick = { x: 0, y: 0, pointer: null };
let engine = new window.WinterEngine();
const renderer = new window.WinterRenderer(canvas, engine);
let walkTarget = null;
let modalResume = false;
let mapResume = false;
let receiptUntil = 0, lastWorkerSound = 0;
let lastFrame = performance.now();
let uiClock = 0, saveClock = 0, bagHintClock = 0;
let toastUntil = 0, audioClock = 0, lastBag = 0;
let cueUntil = 0;
let saveAvailable = readSave();
let saveFailed = false;
let soundEnabled = readPreference() !== 'off';
let audioContext = null;
let musicNote = 0;
let noiseSource = null;
let ambienceGain = null;

function readPreference() {
  try { return localStorage.getItem(SOUND_KEY); } catch { return 'off'; }
}
function readSave() {
  try {
    const result = window.WinterEngine.restore(localStorage.getItem(SAVE_KEY));
    return result?.state.mode !== 'menu' ? result : null;
  } catch { return null; }
}
function save() {
  if (engine.state.mode === 'menu') return;
  try {
    localStorage.setItem(SAVE_KEY, engine.serialize());
    saveFailed = false;
    $('save-note').textContent = '进度已自动保存 · 此设备';
  } catch {
    if (!saveFailed) toast('浏览器未允许保存进度，本次远行请保持页面打开。');
    saveFailed = true;
    $('save-note').textContent = '无法保存进度 · 请保持页面打开';
  }
}
function toast(message, duration = 3600) {
  $('toast').textContent = message;
  $('toast').classList.add('show');
  toastUntil = performance.now() + duration;
}
function clearInput() {
  keys.clear(); walkTarget = null;
  joystick.x = joystick.y = 0; joystick.pointer = null;
  $('joystick-knob').style.transform = 'translate(0px, 0px)';
}
function selectEngine(next) {
  setMapOpen(false, false);
  engine = next; renderer.engine = engine;
  renderer.footprints = [];
  renderer.camera.x = engine.state.player.x;
  renderer.camera.y = engine.state.player.y;
  clearInput(); lastBag = 0; saveClock = 0;
  $('start-screen').hidden = true;
  document.body.classList.add('has-started');
  if (engine.state.mode === 'paused') engine.resume();
  if (engine.state.mode === 'menu') engine.start();
  lastFrame = performance.now();
  updateUI(); save(); syncAudio();
  canvas.focus({ preventScroll: true });
  if (engine.state.mode === 'won') showVictory();
}
function newGame() {
  closeDialog(false);
  selectEngine(new window.WinterEngine());
}
function formatTime(seconds) {
  seconds = Math.max(0, Math.floor(seconds));
  return Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');
}
function setText(id, value) {
  const element = $(id);
  if (element && element.textContent !== String(value)) element.textContent = value;
}
function waveStatusText(state) {
  if (state.mode === 'won') return '风雪已停 · 春天抵达';
  if (state.final.active) return '最终风暴 · 入侵者 ' + state.enemies.length;
  if (state.enemies.length) return '兽潮来袭 · 剩余 ' + state.enemies.length;
  return '下一波兽潮 · ' + formatTime(state.wave.timer);
}
function updateUI() {
  const state = engine.state;
  const player = state.player;
  const nearbyStructure = engine.nearby();
  const objective = engine.objective();
  setText('day-value', state.warmth + '%');
  setText('wood-value', Math.floor(state.resources.wood));
  setText('stone-value', Math.floor(state.resources.ore));
  setText('food-value', (player.bag.wood + player.bag.ore) + ' / ' + engine.bagCapacity());
  $('food-value').parentElement.parentElement.title = `背包：${player.bag.wood} 木材 / ${player.bag.ore} 矿石。靠近熔炉或已修复供热塔，自动存入仓库。`;
  setText('fuel-value', Math.ceil(state.furnace.fuel) + '%');
  setText('heat-value', player.frozen ? '冻结' : Math.ceil(player.temp) + '%');
  setText('health-value', Math.ceil(Math.max(0, player.hp)));
  setText('tool-level', player.axe);
  $('heat-fill').style.width = player.temp + '%';
  $('health-fill').style.width = Math.max(0, player.hp) + '%';
  setText('chapter-label', objective.chapter);
  setText('quest-title', objective.title);
  setText('quest-description', objective.description);
  setText('wave-note', waveStatusText(state));
  $('interaction-card').hidden = !nearbyStructure || state.mode === 'menu' || state.mode === 'won';
  if (nearbyStructure) {
    setText('interaction-title', nearbyStructure.name);
    setText('interaction-description', nearbyStructure.description);
    const label = $('interact-button').querySelector('span');
    label.textContent = nearbyStructure.actions.length ? '查看' : '已就绪';
  }
  $('mobile-interact').disabled = !nearbyStructure || state.mode !== 'playing';
  $('map-button').disabled = state.mode === 'menu';
  updateThermalStatus();
  $('pause-button').disabled = state.mode === 'menu' || state.mode === 'won';
  $('upgrade-button').disabled = state.mode === 'menu' || state.mode === 'won';
  document.body.classList.toggle('is-cold', player.temp < 30);
  document.body.classList.toggle('is-freezing', Boolean(player.frozen));
  document.body.classList.toggle('is-storm', state.final.active && state.mode !== 'won');
}
function updateThermalStatus() {
  const player = engine.state.player;
  const region = world.regionNames[world.regionAt(player.x, player.y)];
  const warm = engine.warmAt(player.x, player.y);
  let status = region + ' · 暖区 · 防寒服 Lv.' + (player.coat || 1);
  if (player.frozen) status = region + ' · 已冻结，等待救援';
  else if (!warm) {
    const rate = engine.coldRate ? engine.coldRate() : 3.3;
    status = region + ' · 约 ' + Math.ceil(player.temp / rate) + ' 秒后冻结';
  }
  setText('thermal-note', status);
  $('freeze-banner').hidden = !player.frozen || engine.state.mode === 'menu';
  setText('freeze-countdown', Math.max(0, Math.ceil(5 - (player.freezeTimer || 0))) + ' 秒后营地救援 · 损失部分随身物资');
}
function setMapOpen(open, resume = true) {
  if (open && (dialog.open || engine.state.mode === 'menu')) return;
  if (open === Boolean(renderer.overview)) return;
  if (open) {
    mapResume = engine.state.mode === 'playing';
    engine.pause(); clearInput(); save();
  } else {
    if (resume && mapResume) engine.resume();
    mapResume = false;
  }
  renderer.overview = open;
  $('map-tools').hidden = !open;
  document.body.classList.toggle('map-open', open);
  $('map-button').setAttribute('aria-pressed', String(open));
  if (open) $('map-close').focus({ preventScroll: true });
  else canvas.focus({ preventScroll: true });
  syncAudio(); lastFrame = performance.now();
}
function travelTo(point) {
  setMapOpen(false);
  if (engine.state.mode !== 'playing' || engine.state.player.frozen) return;
  clearInput(); walkTarget = world.clampPoint(point);
}
function requestRescue() {
  const result = engine.action('rescue');
  if (!result.ok) toast(result.text);
  clearInput(); save(); updateUI();
}
function depositFeedback(event) {
  const now = performance.now();
  const playerDelivery = event.source === 'player';
  const visibleWorker = Math.hypot(event.x - engine.state.player.x, event.y - engine.state.player.y) < 450;
  if (!playerDelivery && !visibleWorker) return;
  if (playerDelivery) {
    const items = [];
    if (event.wood) items.push('+' + event.wood + ' 木材');
    if (event.ore) items.push('+' + event.ore + ' 矿石');
    setText('deposit-receipt', items.join('　') + ' · 已存入仓库');
    $('deposit-receipt').hidden = false; receiptUntil = now + 2900;
  }
  for (const key of ['wood', 'ore']) {
    if (!event[key]) continue;
    const resource = $(key === 'wood' ? 'wood-value' : 'stone-value').closest('.resource');
    resource.classList.remove('received');
    requestAnimationFrame(() => resource.classList.add('received'));
  }
  if (playerDelivery || now - lastWorkerSound > 1800) {
    playDepositSound(event.wood, event.ore, playerDelivery ? 1 : .38);
    if (!playerDelivery) lastWorkerSound = now;
  }
}
function button(label, callback, className = '') {
  const element = document.createElement('button');
  element.type = 'button'; element.textContent = label; element.className = className;
  element.addEventListener('click', callback);
  return element;
}
function paragraph(text, className = '') {
  const element = document.createElement('p');
  element.textContent = text; element.className = className;
  return element;
}
function showDialog(kind, title, description, render) {
  if (!dialog.open) {
    modalResume = engine.state.mode === 'playing';
    engine.pause(); clearInput(); save();
  }
  setText('dialog-title', title);
  setText('dialog-description', description);
  setText('dialog-eyebrow', kind === 'win' ? 'SPRING HAS FOUND ITS WAY HOME' : 'A MOMENT BY THE FIRE');
  $('dialog-content').replaceChildren(); $('dialog-actions').replaceChildren();
  render?.($('dialog-content'), $('dialog-actions'));
  if (!dialog.open) dialog.showModal();
  syncAudio(); updateUI();
}
function closeDialog(resume = true) {
  if (dialog.open) dialog.close();
  if (resume && modalResume) engine.resume();
  modalResume = false; clearInput(); lastFrame = performance.now();
  syncAudio(); updateUI(); canvas.focus({ preventScroll: true });
}
function executeAction(id, redraw) {
  const paused = engine.state.mode === 'paused';
  if (paused) engine.resume();
  const result = engine.action(id);
  if (paused) engine.pause();
  if (!result.ok) toast(result.text);
  else playCue(440, .16, .035, 'triangle');
  save(); updateUI();
  if (id === 'final' && result.ok) closeDialog();
  else redraw();
}
const gearDescriptions = {
  axe: '提升伐木、采矿速度和近战攻击力。挥斧可以同时击中更多敌人。',
  pack: '增加随身携带量，减少往返卸货。',
  boots: '提升行走速度，更快往返暖区与采集地。',
  coat: '降低失温速度，延长野外停留时间；探索山巅前尤其有用。'
};
function renderOptions(options, descriptionFor, redraw) {
  const grid = document.createElement('div'); grid.className = 'upgrade-grid';
  for (const option of options) {
    const card = document.createElement('div'); card.className = 'upgrade-card';
    const title = document.createElement('h3'); title.textContent = option.label;
    card.append(title, paragraph(descriptionFor(option)));
    const costs = [];
    if (option.cost.wood) costs.push(option.cost.wood + ' 木材');
    if (option.cost.ore) costs.push(option.cost.ore + ' 矿石');
    card.append(paragraph(costs.length ? costs.join(' + ') : '无需消耗资源', 'cost'));
    const action = button(option.disabled ? option.reason : '确认' + (option.id === 'final' ? '开始' : ''), () => executeAction(option.id, redraw));
    action.disabled = option.disabled;
    card.append(action); grid.append(card);
  }
  $('dialog-content').append(grid);
}
function showGear() {
  if (engine.state.mode === 'menu' || engine.state.mode === 'won') return;
  showDialog('gear', '准备好，再走远一点。', `仓库：${engine.state.resources.wood} 木材 · ${engine.state.resources.ore} 矿石。站在暖区即可升级。`, (_, actions) => {
    renderOptions(engine.upgrades(), o => gearDescriptions[o.id.split(':')[1]], showGear);
    actions.append(button('继续探索', () => closeDialog()));
  });
}
function interact() {
  if (!['playing', 'paused'].includes(engine.state.mode)) return;
  const near = engine.nearby();
  if (!near) { toast('靠近熔炉、营地或供热塔，再按 E 互动。'); return; }
  showDialog('building', near.name, near.description, (content, actions) => {
    const s = engine.state;
    content.append(paragraph(`仓库：${s.resources.wood} 木材 · ${s.resources.ore} 矿石。背包里的物资需要先卸货。`));
    const structure = engine.structures().find(item => item.id === near.id);
    if (structure.hp !== undefined) content.append(paragraph(`建筑耐久：${Math.ceil(structure.hp)} / ${structure.maxHp}`));
    if (near.actions.length) renderOptions(near.actions, option => {
      if (option.id === 'final') return '开始后不再出现普通兽潮。坚守 60 秒、击败霜牙巨兽，并让 3 座供热塔保持运转。建议先提升斧头，修好箭塔。';
      if (option.id === 'upgrade:furnace') return '扩大暖区，并恢复燃料和耐久。2 级熔炉可修复供热塔与箭塔。';
      if (option.id === 'build:camp') return '营地每天都有人守望。两位工人会寻找树木、砍伐、背回炉旁卸货。只有送达的木材才会进入仓库。';
      return option.id.startsWith('repair:') ? '恢复全部耐久，让建筑重新运转。' : near.description;
    }, interact);
    else content.append(paragraph('一切运转正常，继续探索这片山谷吧。'));
    actions.append(button('继续探索', () => closeDialog()));
  });
}
function showHelp() {
  showDialog('help', '把冬天，一点点推回去。', '收集 → 升级 → 扩大暖区 → 守住最后的风暴', (content, actions) => {
    const instructions = [
      '移动：WASD / 方向键，也可点击地图前往。手机拖动左下角摇杆。靠近树木、矿石自动采集，靠近敌人自动挥斧。',
      '卸货：走到熔炉或已点亮的供热塔旁，背包会自动存入仓库。所有建造和升级都使用仓库资源。',
      '建造：靠近建筑按 E；按 U 或点下方「探索装备」升级斧头、背包、雪地靴和防寒服。工人会往返伐木运货，箭塔会自动攻击。',
      '保暖：暖区恢复体温和生命。离开暖区会持续失温，山上更冷；体温低于 30% 时减速，耗尽时冻住，无法移动、采集和攻击。升级防寒服可保温，冻住后 5 秒自动救援，也可按 R 立即求救。',
      '地图：M 或右上角地图按钮展开全图，点击河谷、山巅或原野可导航前往。供暖后河冰消融、山体露出岩石，原野长出花草。查看地图时游戏暂停。',
      '燃料：不足时自动消耗 10 木材添火，也能在炉旁手动添火。工人背着的木材尚未入库，需要等他们送达。',
      '防守：留意兽潮方向和小地图红点。敌人会破坏供热塔，受损后靠近修复。倒下会获救回到熔炉，保留建筑和装备，损失部分背包物资。',
      '通关：熔炉 3 级、三座供热塔运转后，回到熔炉启动最终挑战。守住 60 秒、击败巨兽并清除敌人，让全图重返春天。',
      '按 Esc / P 暂停，离开页面会自动暂停。进度仅保存在当前浏览器，可在首页继续远行。'
    ];
    instructions.forEach(text => content.append(paragraph(text)));
    actions.append(button(engine.state.mode === 'menu' ? '明白了' : '继续探索', () => closeDialog()));
  });
}
function showPause() {
  if (engine.state.mode !== 'playing' && engine.state.mode !== 'paused') return;
  showDialog('pause', '在炉火旁，歇一会儿。', '雪原已暂停，进度已保存。', (content, actions) => {
    content.append(paragraph('本次远行 ' + formatTime(engine.state.time) + ' · 暖区 ' + engine.state.warmth + '% · 击退 ' + engine.state.kills + ' 个入侵者'));
    actions.append(button('继续远行', () => { modalResume = true; closeDialog(); }));
    actions.append(button('玩法说明', showHelp));
    actions.append(button('重新开始', confirmRestart));
    actions.append(button('返回游戏库', returnToLibrary));
  });
}
function confirmRestart() {
  showDialog('restart', '开始一场新的远行？', '当前远行的进度会被新的存档替换。', (_, actions) => {
    actions.append(button('保留进度', () => closeDialog()));
    actions.append(button('重新点燃炉火', newGame));
  });
}
function showVictory() {
  save();
  showDialog('win', '你把春天，带回了山谷。', '积雪融化，炉火长明。每一束微小的光，终于连成了整个世界的温暖。', (content, actions) => {
    content.append(paragraph('供暖覆盖 100% · 三座供热塔全部运转', 'cost'));
    content.append(paragraph(`远行 ${formatTime(engine.state.time)} · 击退 ${engine.state.kills} 个入侵者 · 营地救援 ${engine.state.rescues} 次`));
    actions.append(button('看看春天的山谷', () => closeDialog()));
    actions.append(button('再守一次炉火', confirmRestart));
    actions.append(button('返回游戏库', returnToLibrary));
  });
}
function returnToLibrary() {
  save();
  window.top.location.href = new URL('../../', window.location.href).href;
}

// Audio is synthesized locally and starts only after a player gesture.
function initAudio() {
  if (audioContext || !soundEnabled) return;
  try {
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) return;
    audioContext = new Audio();
    const buffer = audioContext.createBuffer(1, audioContext.sampleRate * 2, audioContext.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    noiseSource = audioContext.createBufferSource(); noiseSource.buffer = buffer; noiseSource.loop = true;
    const filter = audioContext.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 340;
    ambienceGain = audioContext.createGain(); ambienceGain.gain.value = .018;
    noiseSource.connect(filter).connect(ambienceGain).connect(audioContext.destination); noiseSource.start();
  } catch { audioContext = null; }
}
function syncAudio() {
  const playing = engine.state.mode === 'playing';
  const audible = soundEnabled && !document.hidden && (playing || performance.now() < cueUntil);
  if (audible) {
    initAudio(); audioContext?.resume().catch(() => {});
  } else audioContext?.suspend().catch(() => {});
  if (ambienceGain && audioContext) ambienceGain.gain.setTargetAtTime(playing ? .018 : 0, audioContext.currentTime, .03);
  $('sound-button').setAttribute('aria-label', soundEnabled ? '关闭声音' : '开启声音');
  $('sound-button').setAttribute('aria-pressed', String(soundEnabled));
  $('sound-button').style.opacity = soundEnabled ? '1' : '.45';
}
function playCue(frequency, duration, volume, type = 'sine') {
  if (!soundEnabled || document.hidden) return;
  cueUntil = performance.now() + duration * 1000 + 100;
  syncAudio();
  audioContext?.resume().then(() => tone(frequency, duration, volume, type)).catch(() => {});
}
function playDepositSound(wood, ore, volume) {
  if (!soundEnabled || document.hidden) return;
  initAudio();
  audioContext?.resume().then(() => {
    // Low wooden knocks, bright stone clinks, then a short arrival chime.
    if (wood > 0) {
      tone(130, .15, .10 * volume, 'triangle');
      tone(95, .12, .07 * volume, 'triangle', .09);
      tone(190, .09, .035 * volume, 'sine', .16);
    }
    if (ore > 0) {
      const offset = wood > 0 ? .2 : 0;
      tone(910, .12, .055 * volume, 'triangle', offset);
      tone(1380, .16, .04 * volume, 'sine', offset + .08);
      tone(1060, .13, .045 * volume, 'triangle', offset + .15);
    }
    tone(523.25, .22, .035 * volume, 'sine', .38);
    tone(783.99, .3, .03 * volume, 'sine', .5);
  }).catch(() => {});
}
function tone(frequency, duration = .1, volume = .025, type = 'sine', delay = 0) {
  if (!audioContext || !soundEnabled || audioContext.state !== 'running') return;
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain(); const now = audioContext.currentTime + delay;
  oscillator.type = type; oscillator.frequency.value = frequency;
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(volume, now + .01);
  gain.gain.exponentialRampToValueAtTime(.001, now + duration);
  oscillator.connect(gain).connect(audioContext.destination);
  oscillator.start(now); oscillator.stop(now + duration + .03);
  oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
}

$('start-button').addEventListener('click', () => saveAvailable ? confirmRestart() : newGame());
$('continue-button').hidden = !saveAvailable;
$('continue-button').addEventListener('click', () => {
  const saved = readSave();
  if (saved) selectEngine(saved);
  else { saveAvailable = null; $('continue-button').hidden = true; toast('存档无法读取，可以开始新的远行。'); }
});
$('pause-button').addEventListener('click', () => { setMapOpen(false); showPause(); });
$('map-button').addEventListener('click', () => setMapOpen(!renderer.overview));
$('map-close').addEventListener('click', () => setMapOpen(false));
$('rescue-button').addEventListener('click', requestRescue);
for (const destination of document.querySelectorAll('[data-destination]')) {
  destination.addEventListener('click', () => {
    const target = destination.dataset.destination === 'home' ? engine.state.furnace : engine.state.towers.find(tower => tower.id === destination.dataset.destination);
    travelTo(target);
  });
}
$('help-button').addEventListener('click', showHelp);
$('upgrade-button').addEventListener('click', showGear);
$('interact-button').addEventListener('click', interact);
$('mobile-interact').addEventListener('click', interact);
$('sound-button').addEventListener('click', () => {
  soundEnabled = !soundEnabled;
  try { localStorage.setItem(SOUND_KEY, soundEnabled ? 'on' : 'off'); } catch { /* Optional preference. */ }
  syncAudio();
  toast(soundEnabled ? '风声与琴音已开启' : '声音已关闭');
});
$('dialog-close').addEventListener('click', () => closeDialog());
dialog.addEventListener('cancel', event => { event.preventDefault(); closeDialog(); });
canvas.tabIndex = 0;
canvas.addEventListener('pointerdown', event => {
  if (dialog.open || event.button !== 0) return;
  if (renderer.overview) {
    const target = renderer.mapPoint?.(event.clientX, event.clientY);
    if (target) travelTo(target);
    return;
  }
  if (renderer.minimapHit?.(event.clientX, event.clientY)) { setMapOpen(true); return; }
  if (engine.state.mode !== 'playing' || engine.state.player.frozen) return;
  travelTo(renderer.screenToWorld(event.clientX, event.clientY));
  canvas.focus({ preventScroll: true });
});
window.addEventListener('keydown', event => {
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  const key = event.key.toLowerCase();
  if (renderer.overview) {
    if (['m', 'escape', 'p'].includes(key) && !event.repeat) { event.preventDefault(); setMapOpen(false); }
    return;
  }
  const movement = ['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'];
  if (dialog.open) {
    if ((key === 'p' || key === 'e') && !event.repeat) { event.preventDefault(); closeDialog(); }
    return;
  }
  if (engine.state.mode !== 'playing') return;
  if (movement.includes(key)) { event.preventDefault(); keys.add(key); walkTarget = null; }
  else if (!event.repeat) {
    if (key === 'm') { event.preventDefault(); setMapOpen(true); }
    if (key === 'r' && engine.state.player.frozen) { event.preventDefault(); requestRescue(); }
    if (key === 'e') { event.preventDefault(); interact(); }
    if (key === 'u' || key === 'b') { event.preventDefault(); showGear(); }
    if (key === 'escape' || key === 'p') { event.preventDefault(); showPause(); }
  }
});
window.addEventListener('keyup', event => keys.delete(event.key.toLowerCase()));
const stick = $('joystick');
function moveJoystick(event) {
  if (joystick.pointer !== event.pointerId) return;
  const rect = stick.getBoundingClientRect();
  let x = (event.clientX - rect.left - rect.width / 2) / (rect.width * .36);
  let y = (event.clientY - rect.top - rect.height / 2) / (rect.height * .36);
  const length = Math.hypot(x, y);
  if (length > 1) { x /= length; y /= length; }
  joystick.x = x; joystick.y = y; walkTarget = null;
  $('joystick-knob').style.transform = `translate(${x * rect.width * .28}px, ${y * rect.height * .28}px)`;
}
stick.addEventListener('pointerdown', event => {
  if (engine.state.mode !== 'playing') return;
  event.preventDefault(); joystick.pointer = event.pointerId;
  stick.setPointerCapture(event.pointerId); moveJoystick(event);
});
stick.addEventListener('pointermove', moveJoystick);
for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) stick.addEventListener(event, clearInput);
window.addEventListener('resize', () => renderer.resize());
function autoPause() {
  clearInput(); save();
  if (engine.state.mode === 'playing') showPause();
  syncAudio();
}
window.addEventListener('blur', autoPause);
document.addEventListener('visibilitychange', () => { if (document.hidden) autoPause(); });
window.addEventListener('pagehide', () => { save(); audioContext?.suspend().catch(() => {}); });

function frame(now) {
  const dt = Math.max(0, Math.min(.1, (now - lastFrame) / 1000)); lastFrame = now;
  let x = joystick.x + Number(keys.has('d') || keys.has('arrowright')) - Number(keys.has('a') || keys.has('arrowleft'));
  let y = joystick.y + Number(keys.has('s') || keys.has('arrowdown')) - Number(keys.has('w') || keys.has('arrowup'));
  if (walkTarget && !x && !y) {
    const p = engine.state.player, dx = walkTarget.x - p.x, dy = walkTarget.y - p.y, d = Math.hypot(dx, dy);
    if (d < 8) walkTarget = null;
    else { x = dx / d; y = dy / d; }
  }
  engine.update(dt, { x, y });
  renderer.draw(now / 1000);
  if (walkTarget && engine.state.mode === 'playing') {
    const target = renderer.point(walkTarget.x, walkTarget.y), ctx = renderer.ctx;
    ctx.save(); ctx.setTransform(renderer.dpr, 0, 0, renderer.dpr, 0, 0);
    ctx.beginPath(); ctx.ellipse(target.x, target.y, 10, 6, 0, 0, Math.PI * 2);
    ctx.strokeStyle = '#a7532f'; ctx.lineWidth = 2; ctx.stroke(); ctx.restore();
  }
  for (const event of engine.drainEvents()) {
    if (event.type === 'deposit') { depositFeedback(event); continue; }
    if (event.type === 'freeze' || event.type === 'rescue') clearInput();
    toast(event.text, event.type === 'wave' || event.type === 'danger' ? 5000 : 3600);
    if (event.type === 'win') { playCue(660, 1, .035); showVictory(); }
    else if (event.type === 'wave') tone(147, .6, .045, 'triangle');
  }
  if (engine.state.mode === 'playing') {
    saveClock += dt; bagHintClock += dt; audioClock += dt;
    if (saveClock >= 4) { save(); saveClock = 0; }
    const bag = engine.state.player.bag.wood + engine.state.player.bag.ore;
    if (bag > lastBag) tone(engine.state.player.bag.ore > 0 ? 380 : 180, .07, .018, 'triangle');
    if (bag === engine.bagCapacity() && bagHintClock > 20) { toast('背包满了，回到熔炉或已点亮的供热塔旁卸货。'); bagHintClock = 0; }
    lastBag = bag;
    if (audioClock > 3.5) {
      tone([220, 277.18, 329.63, 415.3, 329.63, 277.18, 246.94, 329.63][musicNote++ % 8], 2.6, .022);
      audioClock = 0;
    }
  }
  if (now > receiptUntil) $('deposit-receipt').hidden = true;
  if (now > toastUntil) $('toast').classList.remove('show');
  if (cueUntil && now >= cueUntil) { cueUntil = 0; syncAudio(); }
  uiClock += dt;
  if (uiClock >= .12) { updateUI(); uiClock = 0; }
  requestAnimationFrame(frame);
}
updateUI(); syncAudio(); requestAnimationFrame(frame);
