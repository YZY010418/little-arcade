'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const WinterEngine = require('../site/games/last-ember/engine.js');
const WinterWorld = require('../site/games/last-ember/world.js');

function harness() {
  const ids = [...fs.readFileSync('site/games/last-ember/index.html', 'utf8').matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  const tones = [];
  const elements = new Map();
  function element() {
    const classes = new Set();
    return { textContent: '', style: {}, hidden: false, disabled: false, open: false,
      classList: { add: key => classes.add(key), remove: key => classes.delete(key), toggle: (key, value) => value ? classes.add(key) : classes.delete(key) },
      addEventListener() {}, setAttribute() {}, focus() {}, append() {}, replaceChildren() {},
      showModal() { this.open = true; }, close() { this.open = false; },
      querySelector: () => element(), closest() { return this; }, parentElement: { parentElement: {} }
    };
  }
  for (const id of ids) elements.set(id, element());
  const param = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, setTargetAtTime() {} });
  const node = () => ({ gain: param(), frequency: param(), connect() { return this; }, disconnect() {}, start() {}, stop() {} });
  class AudioContext {
    constructor() { this.state = 'running'; this.currentTime = 0; this.sampleRate = 100; this.destination = {}; }
    createBuffer() { return { getChannelData: () => new Float32Array(200) }; }
    createBufferSource() { return node(); }
    createBiquadFilter() { return node(); }
    createGain() { return node(); }
    createOscillator() { const oscillator = node(); tones.push(oscillator); return oscillator; }
    resume() { this.state = 'running'; return Promise.resolve(); }
    suspend() { this.state = 'suspended'; return Promise.resolve(); }
  }
  const sandbox = {
    window: { WinterEngine, WinterWorld, WinterRenderer: class { constructor() { this.camera = {}; } }, AudioContext, addEventListener() {} },
    document: { getElementById: id => elements.get(id), querySelectorAll: () => [], body: element(), hidden: false, addEventListener() {} },
    localStorage: { getItem: () => null, setItem() {} }, performance: { now: () => 10000 }, requestAnimationFrame() {}, URL
  };
  vm.createContext(sandbox);
  const source = fs.readFileSync('site/games/last-ember/main.js', 'utf8').replace(/^import .*;\n/gm, '');
  vm.runInContext(source, sandbox);
  return { sandbox, elements, tones, run: source => vm.runInContext(source, sandbox) };
}

test('wood and stone delivery route to distinct audible cues and exact visible receipts', async () => {
  const ui = harness();
  ui.run(`selectEngine(new window.WinterEngine()); depositFeedback({source:'player',wood:12,ore:3,x:1700,y:1400});`);
  await Promise.resolve();
  const frequencies = ui.tones.map(tone => tone.frequency.value);
  assert.ok(frequencies.some(frequency => frequency < 200), 'wood must have a low impact sound');
  assert.ok(frequencies.some(frequency => frequency > 900), 'stone must have a distinct high clink');
  assert.equal(ui.elements.get('deposit-receipt').textContent, '+12 木材　+3 矿石 · 已存入仓库');
  assert.equal(ui.elements.get('deposit-receipt').hidden, false);
  const count = ui.tones.length;
  ui.run(`soundEnabled = false; depositFeedback({source:'player',wood:4,ore:0,x:1700,y:1400});`);
  await Promise.resolve();
  assert.equal(ui.tones.length, count, 'muting must silence delivery feedback too');
  assert.match(ui.elements.get('deposit-receipt').textContent, /\+4 木材/);
});

test('freezing remains visible and map selection resumes a paused expedition safely', () => {
  const ui = harness();
  ui.run(`selectEngine(new window.WinterEngine()); engine.state.player.frozen=true; engine.state.player.freezeTimer=2; updateUI();`);
  assert.equal(ui.elements.get('heat-value').textContent, '冻结');
  assert.equal(ui.elements.get('freeze-banner').hidden, false);
  assert.match(ui.elements.get('freeze-countdown').textContent, /^3 秒/);
  ui.run(`engine.state.player.frozen=false; setMapOpen(true);`);
  assert.equal(ui.run('engine.state.mode'), 'paused');
  ui.run(`travelTo(world.towers[0]);`);
  assert.equal(ui.run('engine.state.mode'), 'playing');
  assert.equal(ui.run('walkTarget.x'), WinterWorld.towers[0].x);
  assert.equal(ui.elements.get('map-tools').hidden, true);
});
