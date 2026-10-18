'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const WinterEngine = require(path.join(__dirname, '../site/games/last-ember/engine.js'));
const World = require(path.join(__dirname, '../site/games/last-ember/world.js'));

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

function coldPosition(state) {
  return { x: state.furnace.x - 550, y: state.furnace.y - 300 };
}

function placeInCold(state) {
  Object.assign(state.player, coldPosition(state));
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

test('the expanded geography uses shared world positions and keeps nodes in playable bounds', () => {
  const game = fresh();
  assert.equal(game.state.furnace.x, World.center.x);
  assert.equal(game.state.furnace.y, World.center.y);
  for (const definition of World.towers) {
    const tower = getTower(game.state, definition.id);
    assert.equal(tower.x, definition.x);
    assert.equal(tower.y, definition.y);
  }
  for (const point of [game.state.player, ...game.state.nodes, ...game.structures()]) {
    assert.ok(point.x >= 0 && point.x <= World.width && point.y >= 0 && point.y <= World.height);
    assert.ok(Math.hypot((point.x - World.center.x) / World.bounds.rx, (point.y - World.center.y) / World.bounds.ry) <= 1.001);
  }
  assert.ok(game.state.nodes.some(node => World.regionAt(node.x, node.y) === 'mountain'));
  assert.ok(game.state.nodes.some(node => World.regionAt(node.x, node.y) === 'river'));
  assert.ok(game.state.nodes.some(node => World.regionAt(node.x, node.y) === 'plain'));
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
    placeInCold(state);
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
  const cold = fixture(state => { placeInCold(state); state.player.temp = 50; });
  assert.equal(warm.warmAt(warm.state.player.x, warm.state.player.y), true);
  assert.equal(cold.warmAt(cold.state.player.x, cold.state.player.y), false);
  advance(warm, 8);
  advance(cold, 8);
  assert.ok(warm.state.player.temp > 50);
  assert.ok(cold.state.player.temp < 50);
});

test('temperature below thirty slows movement before the explorer freezes', () => {
  function exposed(temperature) {
    return fixture(state => {
      placeInCold(state);
      state.player.temp = temperature;
      state.nodes = state.nodes.filter(node => distance(node, state.player) > 200).slice(0, 1);
    });
  }
  const warmBody = exposed(100);
  const coldBody = exposed(29);
  const start = { ...warmBody.state.player };
  advance(warmBody, 0.5, { x: 1, y: 0 });
  advance(coldBody, 0.5, { x: 1, y: 0 });
  const normalDistance = distance(warmBody.state.player, start);
  const coldDistance = distance(coldBody.state.player, start);
  assert.ok(coldDistance > 0, 'a cold explorer can still retreat before freezing');
  assert.ok(coldDistance < normalDistance * 0.9, 'cold must visibly slow movement');
});

test('zero temperature stops movement, harvesting, and attacks immediately', () => {
  const harvest = fixture(state => {
    placeInCold(state);
    state.player.temp = 0;
    state.player.gather = 0;
    const node = state.nodes.find(node => node.type === 'tree');
    node.x = state.player.x;
    node.y = state.player.y;
    state.nodes = [node];
  });
  const location = { x: harvest.state.player.x, y: harvest.state.player.y };
  const wood = harvest.state.nodes[0].amount;
  advance(harvest, 2, { x: 1, y: 0 });
  assert.equal(harvest.state.player.frozen, true);
  assert.equal(distance(harvest.state.player, location), 0);
  assert.equal(harvest.state.player.bag.wood, 0);
  assert.equal(harvest.state.nodes[0].amount, wood);

  const combat = fixture(state => {
    placeInCold(state);
    state.player.temp = 0;
    state.player.attack = 0;
    state.player.invincible = 5;
    state.enemies = [{
      id: 1, type: 'wolf', x: state.player.x + 40, y: state.player.y,
      hp: 100, maxHp: 100, face: { x: -1, y: 0 }, hit: 0, cooldown: 5
    }];
  });
  advance(combat, 2);
  assert.equal(combat.state.player.frozen, true);
  assert.equal(combat.state.enemies[0].hp, 100, 'a frozen explorer cannot swing the axe');
});

test('five seconds of freezing triggers camp rescue and restores usable movement', () => {
  const game = fixture(state => {
    placeInCold(state);
    state.player.temp = 0;
    state.player.hp = 100;
    state.player.bag.wood = 8;
  });
  const rescueCount = game.state.rescues;
  advance(game, 4.8, { x: 1, y: 0 });
  assert.equal(game.state.rescues, rescueCount);
  assert.equal(game.state.player.frozen, true);
  advance(game, 0.4, { x: 1, y: 0 });
  assert.equal(game.state.rescues, rescueCount + 1);
  assert.equal(game.state.player.frozen, false);
  assert.ok(game.state.player.temp > 0);
  assert.ok(distance(game.state.player, game.state.furnace) < 180);
  const location = { ...game.state.player };
  advance(game, 0.3, { x: 1, y: 0 });
  assert.ok(distance(game.state.player, location) > 0);
});

test('saving midway through freezing preserves the remaining rescue delay', () => {
  const game = fixture(state => { placeInCold(state); state.player.temp = 0; });
  advance(game, 2);
  const restored = WinterEngine.restore(game.serialize());
  assert.ok(restored);
  assert.equal(restored.state.mode, 'paused');
  assert.equal(restored.state.player.frozen, true);
  closeTo(restored.state.player.freezeTimer, game.state.player.freezeTimer, 1e-8, 'saved freeze timer');
  advance(restored, 20);
  closeTo(restored.state.player.freezeTimer, game.state.player.freezeTimer, 1e-8, 'paused freeze timer');
  restored.resume();
  advance(restored, 2.8);
  assert.equal(restored.state.rescues, 0);
  advance(restored, 0.4);
  assert.equal(restored.state.rescues, 1);
  assert.equal(restored.state.player.frozen, false);
});

test('a warm zone thaws a frozen explorer without requiring rescue', () => {
  const game = fixture(state => {
    atFurnace(state);
    state.player.temp = 0;
    state.player.frozen = true;
    state.player.freezeTimer = 0;
  });
  const rescueCount = game.state.rescues;
  advance(game, 2);
  assert.equal(game.state.player.frozen, false);
  assert.ok(game.state.player.temp >= 20);
  assert.equal(game.state.rescues, rescueCount);
  const location = { ...game.state.player };
  advance(game, 0.5, { x: 1, y: 0 });
  assert.ok(distance(game.state.player, location) > 0);
});

test('coat upgrades reduce exposure loss and require the advertised banked resources', () => {
  const upgraded = fixture(state => {
    atFurnace(state);
    state.resources.wood = state.resources.ore = 1000;
  });
  for (let level = 1; level < 3; level++) {
    const option = upgraded.upgrades().find(option => option.id === 'upgrade:coat');
    assert.ok(option && !option.disabled);
    const before = { ...upgraded.state.resources };
    assert.equal(upgraded.action('upgrade:coat').ok, true);
    assert.equal(upgraded.state.player.coat, level + 1);
    for (const resource of ['wood', 'ore']) {
      assert.equal(upgraded.state.resources[resource], before[resource] - (option.cost[resource] || 0));
    }
  }
  const base = fixture(state => { placeInCold(state); state.player.temp = 100; });
  const insulated = fixture(state => { placeInCold(state); state.player.temp = 100; }, upgraded);
  advance(base, 10);
  advance(insulated, 10);
  assert.ok(insulated.state.player.temp > base.state.player.temp + 5);
  assert.equal(upgraded.action('upgrade:coat').ok, false, 'coat cannot exceed level three');
});

test('unloading reports exact wood and ore once, with no empty duplicate event', () => {
  for (const destination of ['furnace', TOWER_IDS[0]]) {
    const game = fixture(state => {
      const depot = destination === 'furnace' ? state.furnace : getTower(state, destination);
      if (destination !== 'furnace') depot.built = true;
      state.player.x = depot.x;
      state.player.y = depot.y;
      state.player.bag = { wood: 7, ore: 4 };
      state.resources = { wood: 81, ore: 27 };
      state.autoFeed = false;
      state.nodes = state.nodes.filter(node => distance(node, depot) > 200).slice(0, 1);
    });
    game.drainEvents();
    advance(game, 0.1);
    assert.deepEqual(game.state.resources, { wood: 88, ore: 31 });
    assert.deepEqual(game.state.player.bag, { wood: 0, ore: 0 });
    const deposits = game.drainEvents().filter(event => event.type === 'deposit');
    assert.equal(deposits.length, 1, destination);
    assert.equal(deposits[0].wood, 7);
    assert.equal(deposits[0].ore, 4);
    assert.equal(deposits[0].source, 'player');
    const depot = destination === 'furnace' ? game.state.furnace : getTower(game.state, destination);
    assert.equal(deposits[0].x, depot.x);
    assert.equal(deposits[0].y, depot.y);
    advance(game, 1);
    assert.deepEqual(game.state.resources, { wood: 88, ore: 31 });
    assert.equal(game.drainEvents().filter(event => event.type === 'deposit').length, 0);
  }
});

function workingCamp(withTrees = true) {
  const game = fixture(state => {
    state.player.x = state.camp.x;
    state.player.y = state.camp.y;
    state.resources = { wood: 100, ore: 100 };
    state.autoFeed = false;
  });
  assert.equal(game.action('build:camp').ok, true);
  return fixture(state => {
    atFurnace(state);
    const node = state.nodes.find(node => node.type === (withTrees ? 'tree' : 'ore'));
    node.x = state.furnace.x - 260;
    node.y = state.furnace.y - 60;
    node.max = node.amount = 60;
    state.nodes = [node];
  }, game);
}

test('workers walk to real trees, carry harvested wood, and bank it only after returning', () => {
  const game = workingCamp();
  const initialBank = game.state.resources.wood;
  const initialTree = game.state.nodes[0].amount;
  const positions = game.state.workers.map(worker => ({ x: worker.x, y: worker.y }));
  let sawWalking = false;
  let sawCargo = false;
  let previousTree = initialTree;
  for (let elapsed = 0; elapsed < 100 && game.state.resources.wood === initialBank; elapsed += 0.1) {
    game.update(0.1);
    const cargo = game.state.workers.reduce((total, worker) => total + worker.bag.wood, 0);
    if (game.state.nodes[0].amount < previousTree) {
      assert.ok(game.state.workers.some(worker => distance(worker, game.state.nodes[0]) <= 72), 'workers must physically reach the tree before chopping');
    }
    previousTree = game.state.nodes[0].amount;
    sawWalking ||= game.state.workers.some((worker, i) => distance(worker, positions[i]) > 10);
    if (cargo > 0) {
      sawCargo = true;
      assert.ok(game.state.nodes[0].amount < initialTree, 'carried wood must come from an actual tree');
    }
    closeTo(initialTree - game.state.nodes[0].amount, cargo + game.state.resources.wood - initialBank, 1e-8, 'worker wood conservation');
    for (const event of game.drainEvents().filter(event => event.type === 'deposit')) {
      assert.equal(event.source, 'worker');
      assert.ok(game.state.workers.some(worker => distance(worker, game.state.furnace) <= 95), 'wood enters storage only after a worker physically returns');
      assert.ok(event.wood > 0);
      assert.equal(event.ore, 0);
      assert.equal(event.x, game.state.furnace.x);
      assert.equal(event.y, game.state.furnace.y);
    }
  }
  assert.equal(sawWalking, true);
  assert.equal(sawCargo, true, 'workers must carry wood before it reaches the bank');
  assert.ok(game.state.resources.wood > initialBank, 'a completed trip must deliver wood');
});

test('pausing workers stops production and saving mid-trip preserves all cargo', () => {
  const game = workingCamp();
  for (let elapsed = 0; elapsed < 40 && !game.state.workers.some(worker => worker.bag.wood > 0); elapsed += 0.1) game.update(0.1);
  assert.ok(game.state.workers.some(worker => worker.bag.wood > 0));
  game.pause();
  const before = structuredClone(game.state);
  advance(game, 20);
  assert.deepEqual(game.state, before, 'paused workers must not move, harvest, or deposit');
  const restored = WinterEngine.restore(game.serialize());
  assert.ok(restored);
  assert.deepEqual(restored.state.workers, game.state.workers);
  assert.deepEqual(restored.state.nodes, game.state.nodes);
  assert.deepEqual(restored.state.resources, game.state.resources);
  game.resume();
  restored.resume();
  advance(game, 3);
  advance(restored, 3);
  assert.deepEqual(restored.state.workers, game.state.workers);
  assert.deepEqual(restored.state.nodes, game.state.nodes);
  assert.deepEqual(restored.state.resources, game.state.resources);
});

test('a camp without trees cannot manufacture wood or invisible cargo', () => {
  const game = workingCamp(false);
  const bank = { ...game.state.resources };
  advance(game, 60);
  assert.deepEqual(game.state.resources, bank);
  assert.ok(game.state.workers.every(worker => worker.bag.wood === 0 && worker.bag.ore === 0));
  assert.equal(game.drainEvents().filter(event => event.type === 'deposit').length, 0);
});

test('worker saves reject impossible cargo, missing workers, and invalid job targets', () => {
  const valid = workingCamp();
  const corruptions = [
    ['camp without its workers', state => { state.workers = []; }],
    ['overfilled worker bag', state => { state.workers[0].bag.wood = state.workers[0].capacity + 1; }],
    ['negative worker cargo', state => { state.workers[0].bag.wood = -1; }],
    ['duplicate worker identity', state => { state.workers[1].id = state.workers[0].id; }],
    ['unknown worker task', state => { state.workers[0].task = 'teleport'; }],
    ['missing work target', state => { state.workers[0].task = 'walk'; state.workers[0].targetId = 'missing-tree'; }]
  ];
  for (const [label, corrupt] of corruptions) {
    const state = JSON.parse(valid.serialize());
    corrupt(state);
    assert.equal(WinterEngine.restore(state), null, label);
  }
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
    placeInCold(state);
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
  assert.equal(game.warmAt(game.state.furnace.x - 1000, game.state.furnace.y - 500), true);
  assert.equal(game.warmAt(game.state.furnace.x + 1000, game.state.furnace.y + 500), true);
});

test('an alive boss prevents victory after the final countdown has elapsed', () => {
  const game = finalFixture(state => {
    state.final.elapsed = 60.1;
    state.enemies = [{ id: 1, type: 'boss', x: state.furnace.x - 500, y: state.furnace.y - 500, hp: 720, maxHp: 720, face: { x: 0, y: 1 }, hit: 0, cooldown: 0 }];
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
    state.player.x = state.furnace.x - 500;
    state.player.y = state.furnace.y - 400;
    state.player.temp = 100;
    state.nodes = state.nodes.filter(node => node.y > state.furnace.y + 400).slice(0, 1);
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
    'player.attack', 'player.gather', 'player.invincible', 'player.coat', 'player.frozen',
    'player.freezeTimer', 'player.coldWarned', 'resources.wood', 'furnace.hp',
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
    ['invalid coat', state => { state.player.coat = 0; }],
    ['invalid freeze flag', state => { state.player.frozen = 'true'; }],
    ['invalid freeze timer', state => { state.player.freezeTimer = -1; }],
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

// Captured from the shipped version-one engine; these coordinates intentionally
// describe the old map, rather than placing a player on the new map.
const LEGACY_SAVE_V1 = {
  "version": 1,
  "seed": 7301,
  "rng": 3805259215,
  "mode": "playing",
  "time": 123,
  "player": {
    "x": 1150,
    "y": 980,
    "hp": 64,
    "temp": 47,
    "bag": {
      "wood": 9,
      "ore": 5
    },
    "axe": 2,
    "pack": 2,
    "boots": 3,
    "face": {
      "x": 0,
      "y": 1
    },
    "swing": 0,
    "hurt": 0,
    "moving": false,
    "gather": 0,
    "attack": 0,
    "invincible": 0
  },
  "resources": {
    "wood": 72,
    "ore": 33
  },
  "furnace": {
    "id": "furnace",
    "kind": "furnace",
    "name": "中央熔炉",
    "x": 1100,
    "y": 900,
    "level": 2,
    "fuel": 66,
    "hp": 120,
    "maxHp": 145
  },
  "towers": [
    {
      "id": "pine",
      "name": "松林供热塔",
      "x": 620,
      "y": 550,
      "cost": {
        "wood": 85,
        "ore": 24
      },
      "kind": "tower",
      "built": true,
      "hp": 113,
      "maxHp": 160
    },
    {
      "id": "ridge",
      "name": "山脊供热塔",
      "x": 1580,
      "y": 550,
      "cost": {
        "wood": 110,
        "ore": 32
      },
      "kind": "tower",
      "built": false,
      "hp": 160,
      "maxHp": 160
    },
    {
      "id": "lake",
      "name": "湖畔供热塔",
      "x": 1100,
      "y": 1450,
      "cost": {
        "wood": 140,
        "ore": 40
      },
      "kind": "tower",
      "built": false,
      "hp": 160,
      "maxHp": 160
    }
  ],
  "camp": {
    "id": "camp",
    "kind": "camp",
    "name": "伐木营地",
    "x": 865,
    "y": 940,
    "built": true,
    "production": 0,
    "cost": {
      "wood": 35,
      "ore": 8
    }
  },
  "turrets": [
    {
      "id": "turret1",
      "kind": "turret",
      "name": "守望箭塔 1",
      "x": 1100,
      "y": 680,
      "built": true,
      "hp": 66,
      "maxHp": 120,
      "cooldown": 0,
      "cost": {
        "wood": 45,
        "ore": 14
      }
    },
    {
      "id": "turret2",
      "kind": "turret",
      "name": "守望箭塔 2",
      "x": 1310,
      "y": 1000,
      "built": false,
      "hp": 120,
      "maxHp": 120,
      "cooldown": 0,
      "cost": {
        "wood": 45,
        "ore": 14
      }
    },
    {
      "id": "turret3",
      "kind": "turret",
      "name": "守望箭塔 3",
      "x": 900,
      "y": 1090,
      "built": false,
      "hp": 120,
      "maxHp": 120,
      "cooldown": 0,
      "cost": {
        "wood": 45,
        "ore": 14
      }
    }
  ],
  "nodes": [
    {
      "id": "node0",
      "type": "tree",
      "x": 1240,
      "y": 1010,
      "amount": 24,
      "max": 24,
      "respawn": 0,
      "hit": 0
    },
    {
      "id": "node1",
      "type": "tree",
      "x": 1260,
      "y": 870,
      "amount": 24,
      "max": 24,
      "respawn": 0,
      "hit": 0
    },
    {
      "id": "node2",
      "type": "tree",
      "x": 1145,
      "y": 1105,
      "amount": 24,
      "max": 24,
      "respawn": 0,
      "hit": 0
    }
  ],
  "enemies": [],
  "workers": [
    {
      "x": 840,
      "y": 970,
      "phase": 1
    },
    {
      "x": 890,
      "y": 960,
      "phase": 3
    }
  ],
  "wave": {
    "number": 0,
    "timer": 110
  },
  "final": {
    "active": false,
    "elapsed": 0,
    "bossSpawned": false,
    "nextSpawn": 0
  },
  "warmth": 9,
  "kills": 7,
  "rescues": 1,
  "nextEnemy": 1,
  "autoFeed": true,
  "heatClock": 0,
  "hintClock": 0
};


test('version-one progress migrates to the expanded world and remains a valid version-two save', () => {
  const original = structuredClone(LEGACY_SAVE_V1);
  const migrated = WinterEngine.restore(LEGACY_SAVE_V1);
  assert.ok(migrated, 'the shipped version-one format must still load');
  const state = migrated.state;
  const newWorld = new WinterEngine(state.seed).state;
  assert.equal(state.version, 2);
  assert.equal(state.mode, 'paused');
  assert.deepEqual(LEGACY_SAVE_V1, original, 'migration must not mutate the caller-owned save');
  assert.deepEqual(state.resources, original.resources);
  assert.deepEqual(state.player.bag, original.player.bag);
  for (const key of ['hp', 'temp', 'axe', 'pack', 'boots']) assert.equal(state.player[key], original.player[key], key);
  assert.equal(state.player.coat, original.player.boots, 'old insulation from boots transfers into the new coat');
  for (const key of ['time', 'kills', 'rescues']) assert.equal(state[key], original[key], key);
  for (const key of ['level', 'hp', 'maxHp', 'fuel']) assert.equal(state.furnace[key], original.furnace[key], key);
  assert.equal(state.furnace.x, World.center.x);
  assert.equal(state.furnace.y, World.center.y);
  for (const key of ['towers', 'turrets']) {
    for (const building of state[key]) {
      const old = original[key].find(item => item.id === building.id);
      const current = newWorld[key].find(item => item.id === building.id);
      assert.equal(building.built, old.built);
      assert.equal(building.hp, old.hp);
      assert.equal(building.x, current.x);
      assert.equal(building.y, current.y);
    }
  }
  assert.equal(state.camp.built, true);
  assert.equal(state.camp.x, newWorld.camp.x);
  assert.equal(state.camp.y, newWorld.camp.y);
  assert.ok(state.nodes.length > original.nodes.length, 'migration must regenerate resources across the expanded map');
  for (const point of [state.player, ...state.nodes, ...migrated.structures(), ...state.workers]) {
    assert.ok(point.x >= 0 && point.x <= World.width && point.y >= 0 && point.y <= World.height);
    assert.ok(Math.hypot((point.x - World.center.x) / World.bounds.rx, (point.y - World.center.y) / World.bounds.ry) <= 1.001, 'migrated entities must remain inside playable world bounds');
  }
  assert.equal(state.workers.length, original.workers.length);
  assert.ok(state.workers.every(worker => worker.bag.wood === 0 && worker.bag.ore === 0));
  const roundTrip = WinterEngine.restore(migrated.serialize());
  assert.ok(roundTrip);
  assert.deepEqual(roundTrip.state, state);
  migrated.resume();
  advance(migrated, 0.5);
  assert.ok(WinterEngine.restore(migrated.serialize()));
});

test('legacy migration still rejects malformed progression instead of repairing corrupt saves', () => {
  for (const corrupt of [
    state => { state.resources.wood = -10; },
    state => { delete state.player.face; },
    state => { state.player.axe = 99; }
  ]) {
    const state = structuredClone(LEGACY_SAVE_V1);
    corrupt(state);
    assert.equal(WinterEngine.restore(state), null);
  }
});
