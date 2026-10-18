'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const WinterEngine = require(path.join(__dirname, '../site/games/last-ember/engine.js'));

const TOWER_IDS = ['pine', 'ridge', 'lake'];
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

function fresh(seed = 7301) {
  const game = new WinterEngine(seed);
  game.start();
  return game;
}

// Boundary fixtures are loaded through the public persistence API. The separate
// playthrough simulation never mutates state or creates extra resources.
function fixture(change, base = fresh()) {
  const state = JSON.parse(base.serialize());
  assert.ok(state.player && state.furnace, 'save must include the playable state');
  change(state);
  const game = WinterEngine.restore(JSON.stringify(state));
  assert.ok(game, 'boundary fixture must be a valid save');
  if (game.state.mode === 'paused') game.resume();
  return game;
}

function advance(game, seconds, input = { x: 0, y: 0 }, step = 0.1) {
  for (let left = seconds; left > 1e-9; left -= step) game.update(Math.min(step, left), input);
}

function moveTo(game, target, radius = 20, limit = 90) {
  let elapsed = 0;
  while (distance(game.state.player, target) > radius && elapsed < limit && game.state.mode === 'playing') {
    const p = game.state.player;
    const d = Math.max(1, distance(p, target));
    game.update(0.1, { x: (target.x - p.x) / d, y: (target.y - p.y) / d });
    elapsed += 0.1;
  }
  assert.ok(distance(game.state.player, target) <= radius, `could not reach target within ${limit}s`);
  return elapsed;
}

function getTower(state, id) {
  return state.towers.find(tower => tower.id === id);
}

function atFurnace(state) {
  state.player.x = state.furnace.x;
  state.player.y = state.furnace.y;
}

function closeTo(actual, expected, tolerance, label) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: ${actual} vs ${expected}`);
}

test('new expeditions start with finite usable resources and empty cargo', () => {
  const game = fresh();
  assert.equal(game.state.mode, 'playing');
  assert.equal(game.state.final.active, false);
  assert.equal(game.state.player.bag.wood + game.state.player.bag.ore, 0);
  assert.ok(game.state.furnace.fuel > 0);
  for (const value of Object.values(game.state.resources)) assert.ok(Number.isFinite(value) && value >= 0);
  assert.ok(game.bagCapacity() > 0);
  assert.equal(TOWER_IDS.filter(id => getTower(game.state, id).built).length, 0);
});

test('a rejected upgrade does not charge resources or increase equipment', () => {
  const game = fixture(state => {
    atFurnace(state);
    state.resources.wood = state.resources.ore = 0;
  });
  const before = structuredClone(game.state);
  const result = game.action('upgrade:axe');
  assert.equal(result.ok, false);
  assert.deepEqual(game.state.resources, before.resources);
  assert.equal(game.state.player.axe, before.player.axe);
});

test('equipment charges the advertised cost exactly and cannot exceed level three', () => {
  const game = fixture(state => {
    atFurnace(state);
    state.resources.wood = state.resources.ore = 1000;
  });
  for (let level = game.state.player.axe; level < 3; level++) {
    const upgrade = game.upgrades().find(item => item.id === 'upgrade:axe');
    assert.ok(upgrade && !upgrade.disabled);
    const before = { ...game.state.resources };
    assert.equal(game.action(upgrade.id).ok, true);
    for (const resource of ['wood', 'ore']) {
      assert.equal(game.state.resources[resource], before[resource] - (upgrade.cost[resource] || 0));
    }
    assert.equal(game.state.player.axe, level + 1);
  }
  const before = { ...game.state.resources };
  assert.equal(game.action('upgrade:axe').ok, false);
  assert.equal(game.state.player.axe, 3);
  assert.deepEqual(game.state.resources, before);
});

test('field actions require proximity and cannot spend remotely', () => {
  const game = fixture(state => {
    state.player.x = state.player.y = 20;
    state.resources.wood = state.resources.ore = 1000;
  });
  const before = { ...game.state.resources };
  for (const action of ['fuel', 'repair:furnace', 'build:camp', 'build:pine', 'final']) {
    assert.equal(game.action(action).ok, false, action);
  }
  assert.deepEqual(game.state.resources, before);
});

test('harvested resources enter cargo, obey capacity, and unload at the furnace', () => {
  const game = fixture(state => {
    const node = state.nodes.find(node => node.type === 'tree' && distance(node, state.furnace) > 180);
    assert.ok(node, 'a reachable tree must exist away from the unloading radius');
    state.nodes = [node];
    state.player.x = node.x;
    state.player.y = node.y;
    state.player.temp = 100;
    state.player.hp = 100;
    state.player.bag.wood = state.player.bag.ore = 0;
    state.resources.wood = state.resources.ore = 0;
  });
  advance(game, 12);
  assert.ok(game.state.player.bag.wood > 0, 'standing near a tree should harvest wood');
  assert.equal(game.state.resources.wood, 0, 'wood must be carried back before it becomes banked');
  assert.ok(game.state.player.bag.wood + game.state.player.bag.ore <= game.bagCapacity());
  const carried = game.state.player.bag.wood;
  moveTo(game, game.state.furnace, 60);
  advance(game, 0.3);
  assert.equal(game.state.player.bag.wood, 0);
  assert.ok(game.state.resources.wood >= carried);
});

test('warmth recovers temperature while exposure lowers it', () => {
  const warm = fixture(state => { atFurnace(state); state.player.temp = 50; });
  const cold = fixture(state => { state.player.x = state.player.y = 20; state.player.temp = 50; });
  assert.equal(warm.warmAt(warm.state.player.x, warm.state.player.y), true);
  assert.equal(cold.warmAt(cold.state.player.x, cold.state.player.y), false);
  advance(warm, 8);
  advance(cold, 8);
  assert.ok(warm.state.player.temp > 50);
  assert.ok(cold.state.player.temp < 50);
});

test('an extinguished furnace and empty bank can recover through ordinary harvesting', () => {
  const game = fixture(state => {
    atFurnace(state);
    state.furnace.fuel = 0;
    state.resources.wood = state.resources.ore = 0;
    state.player.bag.wood = state.player.bag.ore = 0;
  });
  const tree = game.state.nodes.filter(node => node.type === 'tree' && node.amount > 0)
    .sort((a, b) => distance(a, game.state.furnace) - distance(b, game.state.furnace))[0];
  assert.ok(tree, 'there must be a route back from having no fuel or wood');
  moveTo(game, tree, 35);
  advance(game, 8);
  assert.ok(game.state.player.bag.wood > 0 || game.state.resources.wood > 0);
  moveTo(game, game.state.furnace, 55);
  advance(game, 0.3);
  assert.equal(game.action('fuel').ok, true);
  assert.ok(game.state.furnace.fuel > 0);
  assert.ok(game.state.player.hp > 0);
});

test('loading preserves progression and pauses an active expedition until resume', () => {
  const game = fresh();
  advance(game, 9, { x: 1, y: 0 });
  const saved = game.serialize();
  const restored = WinterEngine.restore(saved);
  assert.equal(restored.state.mode, 'paused');
  const before = structuredClone(restored.state);
  restored.update(4, { x: 1, y: 1 });
  assert.equal(restored.state.time, before.time);
  assert.deepEqual(restored.state.player, before.player);
  restored.resume();
  const expected = JSON.parse(JSON.stringify(game.state));
  const actual = JSON.parse(JSON.stringify(restored.state));
  assert.deepEqual(actual, expected);
});

test('a defeated explorer is rescued into an actionable state', () => {
  const game = fixture(state => {
    state.player.x = state.player.y = 20;
    state.player.hp = 0;
    state.player.temp = 0;
    state.player.bag.wood = 10;
    state.player.bag.ore = 4;
  });
  const rescuedBefore = game.state.rescues;
  advance(game, 0.2);
  assert.equal(game.state.mode, 'playing');
  assert.equal(game.state.rescues, rescuedBefore + 1);
  assert.ok(game.state.player.hp > 0 && game.state.player.temp > 0);
  assert.ok(distance(game.state.player, game.state.furnace) < 150);
  assert.ok(game.state.player.bag.wood >= 0 && game.state.player.bag.ore >= 0);
  const previous = { x: game.state.player.x, y: game.state.player.y };
  advance(game, 0.5, { x: 1, y: 0 });
  assert.ok(distance(game.state.player, previous) > 0);
});

test('the finale cannot start before the level-three furnace and all three towers', () => {
  for (const missing of ['furnace', ...TOWER_IDS]) {
    const game = fixture(state => {
      atFurnace(state);
      state.furnace.level = missing === 'furnace' ? 2 : 3;
      for (const id of TOWER_IDS) getTower(state, id).built = id !== missing;
      state.resources.wood = state.resources.ore = 1000;
    });
    assert.equal(game.action('final').ok, false, `missing ${missing}`);
    assert.equal(game.state.final.active, false);
  }
});

test('a mid-finale save preserves the countdown, invasion, and one-time boss marker', () => {
  const game = fixture(state => {
    atFurnace(state);
    state.furnace.level = 3;
    for (const id of TOWER_IDS) getTower(state, id).built = true;
    state.resources.wood = state.resources.ore = 1000;
  });
  assert.equal(game.action('final').ok, true);
  advance(game, 24.5);
  assert.equal(game.state.final.bossSpawned, true);
  assert.ok(game.state.enemies.some(enemy => enemy.type === 'boss'));
  const restored = WinterEngine.restore(game.serialize());
  assert.equal(restored.state.mode, 'paused');
  assert.deepEqual(restored.state.final, game.state.final);
  assert.deepEqual(restored.state.enemies, game.state.enemies);
  restored.resume();
  advance(game, 1.5);
  advance(restored, 1.5);
  closeTo(restored.state.final.elapsed, game.state.final.elapsed, 1e-7, 'restored final timer');
  assert.equal(restored.state.final.bossSpawned, game.state.final.bossSpawned);
  assert.deepEqual(restored.state.enemies, game.state.enemies);
  assert.notEqual(restored.state.mode, 'won', 'a short finale cannot be mistaken for victory');
});

function finalFixture(change = () => {}) {
  return fixture(state => {
    atFurnace(state);
    state.furnace.level = 3;
    for (const id of TOWER_IDS) getTower(state, id).built = true;
    state.final = { active: true, elapsed: 59, bossSpawned: true, nextSpawn: 60 };
    state.enemies = [];
    change(state);
  });
}

test('victory requires the full sixty seconds, then warms the whole map', () => {
  const game = finalFixture();
  advance(game, 0.9);
  assert.equal(game.state.mode, 'playing');
  advance(game, 0.2);
  assert.equal(game.state.mode, 'won');
  assert.equal(game.state.warmth, 100);
  assert.equal(game.warmAt(300, 170), true);
  assert.equal(game.warmAt(1890, 1630), true);
});

test('an alive boss prevents victory after the final countdown has elapsed', () => {
  const game = finalFixture(state => {
    state.final.elapsed = 60.1;
    state.enemies = [{ id: 1, type: 'boss', x: 500, y: 500, hp: 720, maxHp: 720, face: { x: 0, y: 1 }, hit: 0, cooldown: 0 }];
  });
  advance(game, 0.2);
  assert.equal(game.state.mode, 'playing');
  assert.ok(game.state.enemies.some(enemy => enemy.type === 'boss' && enemy.hp > 0));
});

test('a boss that has not appeared cannot be skipped by a cleared map', () => {
  const game = finalFixture(state => { state.final.elapsed = 60.1; state.final.bossSpawned = false; });
  advance(game, 0.1);
  assert.equal(game.state.mode, 'playing');
  assert.equal(game.state.final.bossSpawned, true);
  assert.ok(game.state.enemies.some(enemy => enemy.type === 'boss'));
});

test('a destroyed tower blocks victory but repairing it completes the expedition', () => {
  const game = finalFixture(state => {
    state.final.elapsed = 60.1;
    const tower = getTower(state, 'lake');
    tower.hp = 0;
    state.player.x = tower.x;
    state.player.y = tower.y;
    state.resources.wood = 18;
  });
  advance(game, 0.1);
  assert.equal(game.state.mode, 'playing');
  assert.equal(game.action('repair:lake').ok, true);
  advance(game, 0.1);
  assert.equal(game.state.mode, 'won');
  assert.ok(getTower(game.state, 'lake').hp > 0);
  assert.equal(game.state.warmth, 100);
});

test('movement, fuel, and temperature agree across different update step sizes', () => {
  const setup = () => fixture(state => {
    state.player.x = state.player.y = 500;
    state.player.temp = 80;
    state.nodes = state.nodes.filter(node => node.y > 1400).slice(0, 1);
  });
  const small = setup();
  const large = setup();
  advance(small, 8, { x: 1, y: 0 }, 0.025);
  advance(large, 8, { x: 1, y: 0 }, 0.25);
  closeTo(small.state.time, large.state.time, 1e-7, 'time');
  closeTo(small.state.player.x, large.state.player.x, 0.1, 'movement');
  closeTo(small.state.player.temp, large.state.player.temp, 0.1, 'temperature');
  closeTo(small.state.furnace.fuel, large.state.furnace.fuel, 0.1, 'fuel');
});

test('malformed JSON and non-state inputs fail safely', () => {
  for (const value of [undefined, null, true, 42, '', '{', 'null', '[]', '{}', [], {}, ' '.repeat(500001)]) {
    assert.doesNotThrow(() => assert.equal(WinterEngine.restore(value), null));
  }
});

test('missing required save properties are rejected before the engine can run', () => {
  const paths = [
    'player', 'player.bag', 'player.hp', 'player.temp', 'player.face', 'player.face.x',
    'player.attack', 'player.gather', 'player.invincible', 'resources.wood', 'furnace.hp',
    'furnace.maxHp', 'furnace.fuel', 'camp.production', 'camp.cost', 'rng', 'nextEnemy',
    'wave.timer', 'final.bossSpawned', 'final.nextSpawn', 'heatClock', 'autoFeed', 'workers',
    'nodes.0.amount', 'nodes.0.respawn', 'turrets.0.cooldown', 'towers.0.built'
  ];
  for (const path of paths) {
    const state = JSON.parse(fresh().serialize());
    const keys = path.split('.');
    const key = keys.pop();
    const owner = keys.reduce((value, part) => value[part], state);
    delete owner[key];
    assert.equal(WinterEngine.restore(state), null, path);
  }
});

test('invalid arrays, identities, modes, and out-of-range numbers are rejected', () => {
  const corruptions = [
    ['unknown mode', state => { state.mode = 'victory'; }],
    ['false victory', state => { state.mode = 'won'; }],
    ['negative bank', state => { state.resources.wood = -1; }],
    ['excessive bank', state => { state.resources.ore = 1e100; }],
    ['non-numeric bank', state => { state.resources.wood = '40'; }],
    ['non-finite number converted to null by JSON', state => { state.resources.wood = Infinity; }],
    ['overfilled cargo', state => { state.player.bag.wood = 29; }],
    ['invalid equipment', state => { state.player.axe = 9; }],
    ['off-map player', state => { state.player.x = -1e10; }],
    ['invalid temperature', state => { state.player.temp = -1; }],
    ['invalid fuel', state => { state.furnace.fuel = 1000; }],
    ['invalid furnace health', state => { state.furnace.hp = -100; }],
    ['negative construction cost', state => { state.towers[0].cost.wood = -100; }],
    ['duplicate tower identity', state => { state.towers[1].id = state.towers[0].id; }],
    ['empty towers', state => { state.towers = []; }],
    ['empty turrets', state => { state.turrets = []; }],
    ['empty harvest map', state => { state.nodes = []; }],
    ['null node', state => { state.nodes[0] = null; }],
    ['invalid node amount', state => { state.nodes[0].amount = 1e100; }],
    ['invalid node type', state => { state.nodes[0].type = 'gold'; }],
    ['malformed enemy', state => { state.enemies = [{}]; }],
    ['malformed worker', state => { state.workers = [{}]; }],
    ['negative wave timer', state => { state.wave.timer = -100; }],
    ['invalid final timer', state => { state.final.elapsed = -1; }],
    ['invalid final flag', state => { state.final.active = 'true'; }],
    ['invalid face', state => { state.player.face = []; }]
  ];
  for (const [label, corrupt] of corruptions) {
    const state = JSON.parse(fresh().serialize());
    corrupt(state);
    assert.doesNotThrow(() => assert.equal(WinterEngine.restore(state), null, label), label);
  }
});

test('valid empty enemy and worker lists restore into a fully callable game', () => {
  const game = WinterEngine.restore(fresh().serialize());
  assert.ok(game);
  assert.deepEqual(game.state.enemies, []);
  assert.deepEqual(game.state.workers, []);
  game.resume();
  assert.doesNotThrow(() => {
    game.update(1, { x: 0, y: 0 });
    game.nearby();
    game.upgrades();
    game.objective();
    game.drainEvents();
    assert.ok(WinterEngine.restore(game.serialize()));
  });
});
