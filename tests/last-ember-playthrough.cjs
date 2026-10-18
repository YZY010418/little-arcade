'use strict';

const assert = require('node:assert/strict');
const WinterEngine = require('../site/games/last-ember/engine.js');
const World = require('../site/games/last-ember/world.js');

// This player reads the world and uses only movement and the same action API as
// the UI. It never modifies state or grants itself resources. Separate copies
// validate saves without replacing or altering the simulated player's state.
const game = new WinterEngine(Number(process.argv[2]) || 7301);
game.start();
const milestones = [];
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
let updates = 0;
let saveChecks = 0;
let warmingStops = 0;
let warmingSeconds = 0;
let frozenSteps = 0;
let lowestTemperature = 100;

function checkSave() {
  const restored = WinterEngine.restore(game.serialize());
  assert.ok(restored, 'normal gameplay must always produce a valid save');
  for (const key of ['player', 'resources', 'final', 'enemies', 'workers', 'nodes']) {
    assert.deepEqual(restored.state[key], game.state[key], `save must preserve ${key}`);
  }
  restored.resume();
  restored.update(0.1);
  restored.nearby();
  restored.upgrades();
  restored.objective();
  assert.ok(WinterEngine.restore(restored.serialize()), 'resumed saves must remain valid');
  saveChecks++;
}

function step(input = { x: 0, y: 0 }) {
  if (game.state.mode !== 'playing') return;
  game.update(0.1, input);
  updates++;
  assert.ok(updates < 45000, 'playthrough exceeded 75 simulated minutes');
  if (game.state.player.frozen) frozenSteps++;
  lowestTemperature = Math.min(lowestTemperature, game.state.player.temp);
  if (updates % 60 === 0) checkSave();
}

function walk(target, radius = 35) {
  const deadline = game.state.time + 120;
  while (game.state.mode === 'playing' && distance(game.state.player, target) > radius) {
    assert.ok(game.state.time < deadline, `movement could not reach ${target.id || 'target'} at ${Math.round(target.x)}, ${Math.round(target.y)}`);
    const p = game.state.player;
    const d = Math.max(1, distance(p, target));
    step({ x: (target.x - p.x) / d, y: (target.y - p.y) / d });
  }
}

function nearestDepot() {
  return [game.state.furnace, ...game.state.towers.filter(tower => tower.built && tower.hp > 0)]
    .sort((a, b) => distance(a, game.state.player) - distance(b, game.state.player))[0];
}

function retreatTemperature() {
  const player = game.state.player;
  const travelSeconds = distance(player, nearestDepot()) / (132 + (player.boots - 1) * 19);
  const exposure = 3.3 * 1.3 / (1 + 0.4 * (player.coat - 1));
  return Math.min(80, 15 + travelSeconds * exposure);
}

function warmUp() {
  if (game.state.player.temp >= 95) return;
  warmingStops++;
  walk(nearestDepot(), 40);
  const deadline = game.state.time + 20;
  while (game.state.mode === 'playing' && game.state.player.temp < 95) {
    assert.ok(game.state.time < deadline, 'returning to a working depot must restore temperature');
    step();
    warmingSeconds += 0.1;
  }
}

function targetFor(id) {
  const suffix = id.split(':')[1];
  if (suffix === 'camp') return game.state.camp;
  const tower = game.state.towers.find(value => value.id === suffix);
  if (tower) return tower;
  const turret = game.state.turrets.find(value => value.id === suffix);
  return turret || game.state.furnace;
}

function actionInfo(id) {
  return [...(game.nearby()?.actions || []), ...game.upgrades()].find(action => action.id === id);
}

function refuel() {
  if (game.state.furnace.fuel < 65 && game.state.resources.wood >= 10) game.action('fuel');
}

function deposit() {
  walk(game.state.furnace, 45);
  step();
  refuel();
  if (game.state.furnace.hp < game.state.furnace.maxHp * 0.7) game.action('repair:furnace');
  warmUp();
}

function gather(resource, required) {
  const deadline = game.state.time + 600;
  const type = resource === 'wood' ? 'tree' : 'ore';
  while (game.state.mode === 'playing' && game.state.resources[resource] < required) {
    assert.ok(game.state.time < deadline, `unable to acquire ${required} ${resource}`);
    if (game.state.player.bag.wood + game.state.player.bag.ore > 0) deposit();
    const node = game.state.nodes.filter(node => node.type === type && node.amount > 0)
      .sort((a, b) => distance(a, game.state.player) - distance(b, game.state.player))[0];
    if (!node) {
      deposit();
      for (let i = 0; i < 100; i++) step();
      continue;
    }
    walk(node, 30);
    const desired = Math.min(game.bagCapacity(), required - game.state.resources[resource]);
    const harvestDeadline = game.state.time + 60;
    while (game.state.mode === 'playing' && node.amount > 0 && game.state.player.bag[resource] < desired
      && game.state.player.bag.wood + game.state.player.bag.ore < game.bagCapacity()) {
      assert.ok(game.state.time < harvestDeadline, 'standing near resource did not harvest it');
      step();
      if (game.state.player.temp < retreatTemperature() || game.state.player.hp < 35) break;
    }
    deposit();
  }
}

function buy(id) {
  for (let attempt = 0; attempt < 16; attempt++) {
    if (game.state.mode !== 'playing') return;
    warmUp();
    walk(targetFor(id), 55);
    if (game.state.mode !== 'playing') return;
    const info = actionInfo(id);
    assert.ok(info, `${id} is missing from the player-facing actions`);
    const cost = info.cost || {};
    const missing = ['wood', 'ore'].filter(resource => game.state.resources[resource] < (cost[resource] || 0));
    if (missing.length) {
      for (const resource of missing) gather(resource, cost[resource]);
      continue;
    }
    const result = game.action(id);
    assert.equal(result.ok, true, `${id}: ${result.text || info.reason || 'action failed'}`);
    milestones.push({ action: id, time: Math.round(game.state.time), wood: game.state.resources.wood, ore: game.state.resources.ore });
    return;
  }
  throw new Error(`${id} could not be funded after repeated collection trips`);
}

function fight(enemy) {
  const deadline = game.state.time + 90;
  while (enemy.hp > 0 && game.state.mode === 'playing') {
    assert.ok(game.state.time < deadline, 'could not defeat an enemy through normal attacks');
    if (game.state.player.temp < retreatTemperature()) warmUp();
    const p = game.state.player;
    const d = Math.max(1, distance(p, enemy));
    const direction = d > 88 ? 1 : d < 62 ? -1 : 0;
    step({ x: direction * (enemy.x - p.x) / d, y: direction * (enemy.y - p.y) / d });
  }
}

function clearEnemies() {
  while (game.state.mode === 'playing' && game.state.enemies.length) {
    const enemy = [...game.state.enemies].sort((a, b) => distance(a, game.state.player) - distance(b, game.state.player))[0];
    fight(enemy);
  }
}

function repairTowers() {
  for (const tower of game.state.towers) {
    if (game.state.mode !== 'playing') return;
    if (tower.hp < tower.maxHp) buy('repair:' + tower.id);
  }
}

for (const action of [
  'upgrade:axe', 'upgrade:coat', 'upgrade:pack', 'build:camp', 'upgrade:furnace',
  'build:pine', 'build:turret1', 'upgrade:axe', 'upgrade:pack',
  'upgrade:boots', 'upgrade:coat', 'upgrade:furnace', 'build:ridge', 'build:turret2',
  'build:lake', 'build:turret3'
]) buy(action);

clearEnemies();
repairTowers();
gather('wood', 80);
deposit();
while (game.state.furnace.fuel < 100 && game.state.resources.wood >= 10) {
  if (!game.action('fuel').ok) break;
}
buy('final');
const finalStarted = game.state.time;
while (game.state.mode === 'playing' && game.state.time < finalStarted + 240) {
  const enemy = game.state.enemies.filter(enemy => enemy.hp > 0)
    .sort((a, b) => distance(a, game.state.player) - distance(b, game.state.player))[0];
  if (game.state.player.temp < retreatTemperature()) warmUp();
  else if (game.state.player.hp < 35) walk(nearestDepot(), 40);
  else if (enemy) fight(enemy);
  else if (game.state.final.elapsed >= 60) repairTowers();
  step();
  if (distance(game.state.player, game.state.furnace) <= 120) refuel();
}

assert.equal(game.state.mode, 'won', 'the legitimate player must be able to finish the expedition');
assert.ok(game.state.final.elapsed >= 60);
assert.ok(game.state.final.bossSpawned);
assert.equal(game.state.enemies.length, 0);
assert.ok(game.state.player.coat >= 2, 'the normal route must invest in insulation');
assert.ok(warmingStops > 0 && warmingSeconds > 0, 'the route must return to shelter and wait to recover warmth');
assert.equal(frozenSteps, 0, 'planned warm-up stops and coat upgrades must avoid freezing');
assert.equal(game.state.furnace.x, World.center.x);
assert.equal(game.state.furnace.y, World.center.y);
checkSave();
console.log(JSON.stringify({
  outcome: game.state.mode, seed: Number(process.argv[2]) || 7301,
  seconds: Math.round(game.state.time), minutes: +(game.state.time / 60).toFixed(2),
  rescues: game.state.rescues, kills: game.state.kills, warmth: game.state.warmth,
  warmingStops, warmingSeconds: +warmingSeconds.toFixed(1), frozenSteps, lowestTemperature: +lowestTemperature.toFixed(1),
  saveChecks, milestones
}, null, 2));
