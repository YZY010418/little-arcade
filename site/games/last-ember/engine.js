(function (root) {
  'use strict';
  const World = typeof module !== 'undefined' && module.exports ? require('./world.js') : root.WinterWorld;
  const CENTER = World.center;
  const SAVE_VERSION = 2;
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const furnaceCosts = [{ wood: 45, ore: 8 }, { wood: 115, ore: 34 }];
  const gearCosts = {
    axe: [{ wood: 24, ore: 6 }, { wood: 65, ore: 24 }],
    pack: [{ wood: 28, ore: 4 }, { wood: 55, ore: 14 }],
    boots: [{ wood: 32, ore: 8 }, { wood: 65, ore: 20 }],
    coat: [{ wood: 32, ore: 8 }, { wood: 65, ore: 20 }]
  };
  const names = { axe: '伐木斧', pack: '背包', boots: '雪地靴', coat: '防寒服' };
  class WinterEngine {
    constructor(seed = 7301) {
      this.state = {
        version: SAVE_VERSION, seed, rng: seed >>> 0, mode: 'menu', time: 0,
        player: { x: CENTER.x, y: CENTER.y + 120, hp: 100, temp: 100, bag: { wood: 0, ore: 0 }, axe: 1, pack: 1, boots: 1, coat: 1, frozen: false, freezeTimer: 0, coldWarned: false, face: { x: 0, y: 1 }, swing: 0, hurt: 0, moving: false, gather: 0, attack: 0, invincible: 0 },
        resources: { wood: 0, ore: 0 },
        furnace: { id: 'furnace', kind: 'furnace', name: '中央熔炉', ...CENTER, level: 1, fuel: 85, hp: 100, maxHp: 100 },
        towers: World.towers.map((tower, i) => ({ ...tower, cost: [{ wood: 85, ore: 24 }, { wood: 110, ore: 32 }, { wood: 140, ore: 40 }][i], kind: 'tower', built: false, hp: 160, maxHp: 160 })),
        camp: { id: 'camp', kind: 'camp', name: '伐木营地', x: CENTER.x - 235, y: CENTER.y + 40, built: false, production: 0, cost: { wood: 35, ore: 8 } },
        turrets: [[0, -220], [210, 100], [-200, 190]].map(([x, y], i) => ({ id: 'turret' + (i + 1), kind: 'turret', name: '守望箭塔 ' + (i + 1), x: CENTER.x + x, y: CENTER.y + y, built: false, hp: 120, maxHp: 120, cooldown: 0, cost: { wood: 45, ore: 14 } })),
        nodes: [], enemies: [], workers: [], wave: { number: 0, timer: 110 },
        final: { active: false, elapsed: 0, bossSpawned: false, nextSpawn: 0 },
        warmth: 0, kills: 0, rescues: 0, nextEnemy: 1, autoFeed: true, heatClock: 0, hintClock: 0
      };
      this.effects = [];
      this.events = [];
      this.createNodes();
      this.updateWarmth();
    }
    random() {
      let t = this.state.rng += 0x6D2B79F5;
      t = Math.imul(t ^ t >>> 15, t | 1);
      t ^= t + Math.imul(t ^ t >>> 7, t | 61);
      this.state.rng >>>= 0;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    }
    createNodes() {
      const structures = this.structures();
      const put = (type, x, y) => {
        const amount = type === 'tree' ? 24 : 20;
        this.state.nodes.push({ id: 'node' + this.state.nodes.length, type, x, y, amount, max: amount, respawn: 0, hit: 0 });
      };
      [[140, 110], [160, -30], [45, 205], [-70, 215], [-145, -120], [85, -185], [-310, 140], [-310, -60]].forEach(([x, y]) => put('tree', CENTER.x + x, CENTER.y + y));
      [[245, -95], [210, 270], [-165, 250], [-210, -235], [360, 35]].forEach(([x, y]) => put('ore', CENTER.x + x, CENTER.y + y));
      for (let i = 0; i < 1800 && this.state.nodes.length < 230; i++) {
        const angle = this.random() * Math.PI * 2;
        const radius = .13 + Math.sqrt(this.random()) * .83;
        const p = { x: CENTER.x + Math.cos(angle) * World.bounds.rx * radius, y: CENTER.y + Math.sin(angle) * World.bounds.ry * radius };
        if (World.riverDistance(p.x, p.y) < 80 || structures.some(s => distance(s, p) < 115) || this.state.nodes.some(n => distance(n, p) < 78)) continue;
        const region = World.regionAt(p.x, p.y);
        if (region === 'plain' && this.random() < .7) continue;
        put(this.random() < (region === 'mountain' ? .6 : .28) ? 'ore' : 'tree', p.x, p.y);
      }
    }
    start() { this.state.mode = 'playing'; this.notify('先去砍树，把木材带回炉旁。靠近树木会自动采集。'); }
    pause() { if (this.state.mode === 'playing') this.state.mode = 'paused'; }
    resume() { if (this.state.mode === 'paused') this.state.mode = 'playing'; }
    notify(text, type = 'info', metadata = {}) { this.events.push({ text, type, ...metadata }); if (this.events.length > 30) this.events.shift(); }
    drainEvents() { return this.events.splice(0); }
    effect(type, x, y, text = '', color = '#ffbd71') {
      this.effects.push({ type, x, y, text, color, life: 1, maxLife: 1 });
      if (this.effects.length > 90) this.effects.shift();
    }
    structures() { const s = this.state; return [s.furnace, s.camp, ...s.towers, ...s.turrets]; }
    bagCapacity() { return 28 + (this.state.player.pack - 1) * 22; }
    heatSources() {
      const s = this.state;
      if (s.mode === 'won') return [{ ...CENTER, r: Math.hypot(World.width, World.height) }];
      const f = s.furnace;
      const strength = f.fuel > 0 && f.hp > 0 ? 1 : .34;
      const sources = [{ x: f.x, y: f.y, r: World.FURNACE_RADII[f.level - 1] * strength }];
      for (const t of s.towers) if (t.built && t.hp > 0) sources.push({ x: t.x, y: t.y, r: f.fuel > 0 ? World.towerRadius : World.towerRadius * .3 });
      return sources;
    }
    warmAt(x, y) { return this.heatSources().some(h => Math.hypot(h.x - x, h.y - y) <= h.r); }
    coldRate(x = this.state.player.x, y = this.state.player.y) {
      return this.warmAt(x, y) ? 0 : 3.3 * World.coldMultiplier(x, y) / (1 + .4 * (this.state.player.coat - 1));
    }
    createWorkers() {
      const camp = this.state.camp;
      this.state.workers = [12, 16].map((capacity, index) => ({
        id: 'worker' + (index + 1), x: camp.x + (index ? 25 : -25), y: camp.y + 30,
        bag: { wood: 0, ore: 0 }, capacity, moving: false, face: { x: 0, y: 1 },
        swing: 0, phase: index * 2, task: 'seek', targetId: null, chopTimer: 0
      }));
    }
    depositCargo(actor, target, source) {
      const wood = actor.bag.wood, ore = actor.bag.ore;
      if (wood + ore <= 0) return;
      this.state.resources.wood += wood;
      this.state.resources.ore += ore;
      actor.bag.wood = actor.bag.ore = 0;
      const label = [wood ? '木材 +' + wood : '', ore ? '矿石 +' + ore : ''].filter(Boolean).join(' · ');
      this.effect('deposit', target.x, target.y, label);
      this.effect('transfer', actor.x, actor.y, '', source === 'worker' ? '#c7d7a0' : '#efbc79');
      Object.assign(this.effects[this.effects.length - 1], { targetX: target.x, targetY: target.y, wood, ore, source });
      this.notify((source === 'worker' ? '工人卸货：' : '物资已入库：') + label, 'deposit', { wood, ore, source, x: target.x, y: target.y });
    }
    updateWorkers(dt) {
      const s = this.state;
      if (!s.camp.built) return;
      for (const worker of s.workers) {
        worker.phase += dt * .8;
        worker.swing = Math.max(0, worker.swing - dt);
        worker.chopTimer -= dt;
        worker.moving = false;
        if (worker.task === 'seek') {
          if (worker.bag.wood >= worker.capacity) worker.task = 'return';
          else if (worker.chopTimer <= 0) {
            const reserved = s.workers.filter(other => other !== worker).map(other => other.targetId);
            const trees = s.nodes.filter(node => node.type === 'tree' && node.amount > 0 && !reserved.includes(node.id));
            trees.sort((a, b) => distance(a, worker) + distance(a, s.furnace) * .4 - distance(b, worker) - distance(b, s.furnace) * .4);
            if (trees.length) { worker.targetId = trees[0].id; worker.task = 'walk'; }
            else if (worker.bag.wood > 0) worker.task = 'return';
            else worker.chopTimer = 1;
          }
        }
        if (worker.task === 'walk' || worker.task === 'chop') {
          const node = s.nodes.find(node => node.id === worker.targetId && node.type === 'tree' && node.amount > 0);
          if (!node) { worker.targetId = null; worker.task = worker.bag.wood >= worker.capacity ? 'return' : 'seek'; continue; }
          const d = distance(worker, node);
          if (d > 34) {
            worker.task = 'walk';
            this.moveWorker(worker, node, dt);
          } else {
            worker.task = 'chop';
            worker.face = { x: (node.x - worker.x) / (d || 1), y: (node.y - worker.y) / (d || 1) };
            if (worker.chopTimer <= 0) {
              const amount = Math.min(1, node.amount, worker.capacity - worker.bag.wood);
              node.amount -= amount; worker.bag.wood += amount;
              node.hit = .22; worker.swing = .32; worker.chopTimer = 2.4;
              if (node.amount <= 0) node.respawn = 48;
              this.effect('gather', node.x, node.y, '+' + amount, '#c7d7a0');
              if (worker.bag.wood >= worker.capacity) { worker.targetId = null; worker.task = 'return'; }
            }
          }
        } else if (worker.task === 'return') {
          worker.targetId = null;
          if (distance(worker, s.furnace) > 70) this.moveWorker(worker, s.furnace, dt);
          else worker.task = 'unload';
        } else if (worker.task === 'unload') {
          if (distance(worker, s.furnace) > 95) worker.task = 'return';
          else {
            this.depositCargo(worker, s.furnace, 'worker');
            worker.task = 'seek'; worker.chopTimer = 0;
          }
        }
      }
    }
    moveWorker(worker, target, dt) {
      const d = distance(worker, target) || 1;
      worker.face = { x: (target.x - worker.x) / d, y: (target.y - worker.y) / d };
      const amount = Math.min(d, dt * 92);
      worker.x += worker.face.x * amount; worker.y += worker.face.y * amount;
      worker.moving = true;
    }
    updateTemperature(dt) {
      const p = this.state.player;
      const warm = this.warmAt(p.x, p.y), wasZero = p.temp <= 0;
      p.temp = clamp(p.temp + dt * (warm ? 18 : -this.coldRate()), 0, 100);
      if (p.temp < 30 && !p.coldWarned) {
        p.coldWarned = true;
        this.notify('体温过低，行动变慢！尽快回到暖区，防寒服能延长外出时间。', 'cold');
      }
      if (p.temp >= 60) p.coldWarned = false;
      if ((wasZero || p.temp <= 0) && !p.frozen) {
        p.frozen = true; p.freezeTimer = 0; p.moving = false; p.swing = 0;
        this.notify('你被冻住了，暂时无法移动和工作。5 秒后救援队会把你带回炉旁。', 'freeze');
      }
      if (!p.frozen) return false;
      if (warm && p.temp >= 20) {
        p.frozen = false; p.freezeTimer = 0;
        this.notify('体温恢复，可以继续行动了。', 'thaw');
        return false;
      }
      p.freezeTimer += dt;
      if (p.freezeTimer >= 5 - 1e-8) { this.rescue(); return true; }
      return false;
    }
    updateWarmth() {
      if (this.state.mode === 'won') { this.state.warmth = 100; return; }
      let covered = 0, total = 0;
      const heat = this.heatSources();
      for (let x = CENTER.x - World.bounds.rx; x <= CENTER.x + World.bounds.rx; x += 100) for (let y = CENTER.y - World.bounds.ry; y <= CENTER.y + World.bounds.ry; y += 100) {
        if (Math.hypot((x - CENTER.x) / World.bounds.rx, (y - CENTER.y) / World.bounds.ry) > 1) continue;
        total++;
        if (heat.some(h => Math.hypot(h.x - x, h.y - y) <= h.r)) covered++;
      }
      this.state.warmth = Math.min(96, Math.round(covered / total * 100));
    }
    canAfford(cost) { return this.state.resources.wood >= (cost.wood || 0) && this.state.resources.ore >= (cost.ore || 0); }
    option(id, label, cost = {}, reason = '') {
      if (!reason && !this.canAfford(cost)) reason = '仓库资源不足';
      return { id, label, cost, disabled: Boolean(reason), reason };
    }
    upgrades() {
      return Object.keys(gearCosts).map(key => {
        const level = this.state.player[key];
        const reason = level >= 3 ? '已达最高等级' : this.state.player.frozen ? '冻结时无法升级，请先等待救援' : !this.warmAt(this.state.player.x, this.state.player.y) ? '请回到暖区升级' : '';
        return this.option('upgrade:' + key, names[key] + (level >= 3 ? ' · 已满级' : ' → Lv.' + (level + 1)), gearCosts[key][level - 1] || {}, reason);
      });
    }
    actionsFor(target) {
      const s = this.state;
      if (target.kind === 'furnace') {
        const actions = [];
        if (target.level < 3) actions.push(this.option('upgrade:furnace', '升级熔炉 → Lv.' + (target.level + 1), furnaceCosts[target.level - 1]));
        if (target.fuel < 95) actions.push(this.option('fuel', '添火 +40 燃料', { wood: 10 }));
        if (target.hp < target.maxHp) actions.push(this.option('repair:furnace', '修复熔炉', { wood: 15 }));
        if (!s.final.active) {
          const ready = s.furnace.level === 3 && s.towers.every(t => t.built && t.hp > 0);
          actions.push(this.option('final', '迎接最终暴风雪', {}, ready ? '' : '需要 3 级熔炉和 3 座完好的供热塔'));
        }
        return actions;
      }
      if (!target.built) {
        const reason = target.kind === 'tower' && s.furnace.level < 2 ? '需要 2 级熔炉' : target.kind === 'turret' && s.furnace.level < 2 ? '需要 2 级熔炉' : '';
        return [this.option('build:' + target.id, target.kind === 'camp' ? '救援工人 · 建立伐木营地' : '修复' + target.name, target.cost, reason)];
      }
      if (target.hp !== undefined && target.hp < target.maxHp) return [this.option('repair:' + target.id, '修复' + target.name, { wood: target.kind === 'tower' ? 18 : 12 })];
      return [];
    }
    nearby() {
      const target = this.structures().filter(t => distance(t, this.state.player) <= 145).sort((a, b) => distance(a, this.state.player) - distance(b, this.state.player))[0];
      if (!target) return null;
      const descriptions = {
        furnace: '炉旁自动卸货。燃料低于 25 时，会用仓库木材自动添火。',
        camp: target.built ? '工人会走到树旁伐木，背回炉旁后将木材存入仓库。' : '救出受困工人，让他们承担日常木材采集。',
        tower: target.built ? '温暖正在扩散，靠近这里也能卸货、恢复体温。' : '让温暖抵达这片雪原。修复后可在这里卸货。',
        turret: target.built ? '自动射击附近入侵者。受损后可用木材修复。' : '建造守望箭塔，自动抵御附近的入侵者。'
      };
      return { id: target.id, name: target.name + (target.kind === 'furnace' ? ' · Lv.' + target.level : ''), description: descriptions[target.kind], actions: this.actionsFor(target) };
    }
    action(id) {
      const s = this.state;
      if (s.mode !== 'playing') return { ok: false, text: '请先开始或继续游戏' };
      if (id === 'rescue') {
        if (!s.player.frozen) return { ok: false, text: '尚未冻结，可以自行返回暖区' };
        this.rescue(); return { ok: true, text: '救援队已把你带回炉旁' };
      }
      if (s.player.frozen) return { ok: false, text: '你已冻结，请等待或呼叫救援' };
      if (typeof id !== 'string') return { ok: false, text: '未知操作' };
      let option, target;
      if (id.startsWith('upgrade:') && names[id.split(':')[1]]) option = this.upgrades().find(o => o.id === id);
      else {
        target = id === 'fuel' || id === 'final' || id === 'upgrade:furnace' ? s.furnace : this.structures().find(t => t.id === id.split(':')[1]);
        if (!target || distance(target, s.player) > 145) return { ok: false, text: '靠近对应建筑后再操作' };
        option = this.actionsFor(target).find(o => o.id === id);
      }
      if (!option || option.disabled) return { ok: false, text: option?.reason || '暂时无法执行这项操作' };
      s.resources.wood -= option.cost.wood || 0;
      s.resources.ore -= option.cost.ore || 0;
      let message = '';
      if (id === 'fuel') { s.furnace.fuel = Math.min(100, s.furnace.fuel + 40); message = '炉火更旺了，继续向雪原出发。'; }
      else if (id === 'upgrade:furnace') {
        s.furnace.level++; s.furnace.maxHp += 45; s.furnace.hp = s.furnace.maxHp; s.furnace.fuel = 100;
        message = '熔炉升至 ' + s.furnace.level + ' 级，新的暖区已经展开！';
      } else if (id.startsWith('upgrade:')) { const key = id.split(':')[1]; s.player[key]++; message = names[key] + '升级！'; }
      else if (id.startsWith('build:')) {
        target.built = true;
        if (target.kind === 'camp') {
          this.createWorkers();
          message = '两位工人得救了！他们会采集树木，再将物资运回炉旁。';
        } else if (target.kind === 'tower') {
          message = target.name + '已点亮！温暖正在融化积雪。';
          s.wave.timer = Math.min(s.wave.timer, 38);
        } else message = '守望箭塔就绪，靠近它可以得到火力掩护。';
      } else if (id.startsWith('repair:')) { target.hp = target.maxHp; message = target.name + '已修复。'; }
      else if (id === 'final') {
        s.final = { active: true, elapsed: 0, bossSpawned: false, nextSpawn: 0 };
        s.furnace.fuel = 100;
        message = '最后的暴风雪来了。守住 60 秒，击败霜牙巨兽！';
      }
      this.effect('build', target?.x || s.player.x, target?.y || s.player.y, '✦');
      this.updateWarmth(); this.notify(message, 'build');
      return { ok: true, text: message };
    }
    update(dt, input = {}) {
      if (this.state.mode !== 'playing' || !Number.isFinite(dt) || dt <= 0) return;
      let remaining = Math.min(dt, 5);
      while (remaining > 1e-8 && this.state.mode === 'playing') {
        const step = Math.min(.05, remaining);
        this.tick(step, input); remaining -= step;
      }
    }
    tick(dt, input) {
      const s = this.state, p = s.player;
      s.time += dt; s.hintClock += dt;
      p.swing = Math.max(0, p.swing - dt); p.hurt = Math.max(0, p.hurt - dt); p.invincible = Math.max(0, p.invincible - dt);
      p.attack -= dt; p.gather -= dt;
      const rescuedFromCold = this.updateTemperature(dt);
      let dx = Number.isFinite(input.x) ? clamp(input.x, -1, 1) : 0;
      let dy = Number.isFinite(input.y) ? clamp(input.y, -1, 1) : 0;
      const length = Math.hypot(dx, dy);
      if (length > 1) { dx /= length; dy /= length; }
      p.moving = length > .08 && !p.frozen && !rescuedFromCold;
      if (p.moving) {
        p.face = { x: dx, y: dy };
        const speed = (132 + (p.boots - 1) * 19) * (p.temp < 30 ? .72 : 1);
        p.x += dx * speed * dt; p.y += dy * speed * dt;
        Object.assign(p, World.clampPoint(p));
      }
      const warm = this.warmAt(p.x, p.y);
      if (warm && !s.enemies.some(e => distance(e, p) < 150)) p.hp = Math.min(100, p.hp + dt * 3.5);
      if (p.temp <= 0) p.hp -= dt * 7;
      const built = s.towers.filter(t => t.built).length;
      s.furnace.fuel = Math.max(0, s.furnace.fuel - dt * (.10 + .025 * s.furnace.level + .035 * built));
      if (s.autoFeed && s.furnace.fuel < 25 && s.resources.wood >= 10) {
        s.resources.wood -= 10; s.furnace.fuel += 40; this.effect('spark', s.furnace.x, s.furnace.y, '自动添火');
      }
      const depot = [s.furnace, ...s.towers.filter(t => t.built && t.hp > 0)].find(t => distance(t, p) < 95);
      if (depot) this.depositCargo(p, depot, 'player');
      for (const node of s.nodes) {
        node.hit = Math.max(0, node.hit - dt);
        if (node.amount <= 0) { node.respawn -= dt; if (node.respawn <= 0) node.amount = node.max; }
      }
      const enemyInRange = s.enemies.some(e => e.hp > 0 && distance(e, p) < 100);
      if (!p.frozen && !rescuedFromCold && !enemyInRange && p.gather <= 0 && p.bag.wood + p.bag.ore < this.bagCapacity()) {
        const node = s.nodes.filter(n => n.amount > 0 && distance(n, p) < 72).sort((a, b) => distance(a, p) - distance(b, p))[0];
        if (node) {
          const key = node.type === 'tree' ? 'wood' : 'ore';
          const amount = Math.min(node.amount, this.bagCapacity() - p.bag.wood - p.bag.ore, key === 'wood' ? p.axe + 2 : p.axe);
          p.bag[key] += amount; node.amount -= amount; node.hit = .22; p.swing = .24; p.gather = .82 - (p.axe - 1) * .08;
          if (node.amount <= 0) node.respawn = node.type === 'tree' ? 48 : 70;
          this.effect('gather', node.x, node.y, '+' + amount, key === 'wood' ? '#efbc79' : '#b5deef');
        }
      }
      this.updateWorkers(dt);
      this.updateWaves(dt);
      this.updateCombat(dt);
      if (p.hp <= 0) this.rescue();
      for (const e of this.effects) e.life -= dt;
      this.effects = this.effects.filter(e => e.life > 0);
      s.heatClock += dt;
      if (s.heatClock >= 1) { s.heatClock -= 1; this.updateWarmth(); }
      if (s.final.active && s.final.elapsed >= 60 && s.final.bossSpawned && s.enemies.length === 0 && s.towers.every(t => t.built && t.hp > 0) && s.furnace.hp > 0) {
        s.mode = 'won'; s.warmth = 100; s.furnace.fuel = 100;
        this.notify('暴风雪停了。你让整座山谷重新迎来了温暖。', 'win');
      }
    }
    spawnWave(count, boss = false) {
      const s = this.state;
      const angle = this.random() * Math.PI * 2;
      if (!boss) s.wave.number++;
      for (let i = 0; i < count; i++) {
        const a = angle + (i - count / 2) * .11;
        const type = boss && i === 0 ? 'boss' : 'wolf';
        const hp = type === 'boss' ? 720 : 48 + Math.min(36, s.wave.number * 4);
        s.enemies.push({ id: s.nextEnemy++, type, x: CENTER.x + Math.cos(a) * World.bounds.rx * .94, y: CENTER.y + Math.sin(a) * World.bounds.ry * .94, hp, maxHp: hp, face: { x: 0, y: 1 }, hit: 0, cooldown: 0 });
      }
      const direction = Math.abs(Math.cos(angle)) > Math.abs(Math.sin(angle)) ? (Math.cos(angle) > 0 ? '东侧' : '西侧') : Math.sin(angle) > 0 ? '南侧' : '北侧';
      this.notify(boss ? '霜牙巨兽出现！靠近箭塔，与它合力战斗。' : '第 ' + s.wave.number + ' 波兽潮从' + direction + '来袭！', 'wave');
    }
    updateWaves(dt) {
      const s = this.state;
      if (s.final.active) {
        s.final.elapsed += dt;
        if (s.final.elapsed >= s.final.nextSpawn && s.final.nextSpawn < 50) {
          this.spawnWave(3); s.final.nextSpawn += 20;
        }
        if (s.final.elapsed >= 18 && !s.final.bossSpawned) { s.final.bossSpawned = true; this.spawnWave(1, true); }
      } else {
        s.wave.timer -= dt;
        if (s.wave.timer <= 0) { this.spawnWave(Math.min(6, 2 + Math.floor(s.wave.number / 2))); s.wave.timer = 108; }
      }
    }
    hitEnemy(enemy, damage, source) {
      enemy.hp -= damage; enemy.hit = .2;
      this.effect('hit', enemy.x, enemy.y - 18, String(Math.round(damage)), '#ffe0a0');
      if (source) this.effect('spark', source.x, source.y, '', '#ffcd76');
    }
    updateCombat(dt) {
      const s = this.state, p = s.player;
      const nearby = s.enemies.filter(e => e.hp > 0 && distance(e, p) < 100).sort((a, b) => distance(a, p) - distance(b, p));
      if (!p.frozen && nearby.length && p.attack <= 0) {
        const enemy = nearby[0], d = distance(p, enemy) || 1;
        p.face = { x: (enemy.x - p.x) / d, y: (enemy.y - p.y) / d };
        p.attack = .7 - (p.axe - 1) * .08; p.swing = .28;
        for (const target of nearby.slice(0, p.axe)) this.hitEnemy(target, 18 + p.axe * 12);
      }
      for (const turret of s.turrets) if (turret.built && turret.hp > 0) {
        turret.cooldown -= dt;
        const enemy = s.enemies.filter(e => e.hp > 0 && distance(e, turret) < 310).sort((a, b) => distance(a, turret) - distance(b, turret))[0];
        if (enemy && turret.cooldown <= 0) { turret.cooldown = .9; this.hitEnemy(enemy, 25, turret); }
      }
      for (const enemy of s.enemies) {
        if (enemy.hp <= 0) continue;
        enemy.hit = Math.max(0, enemy.hit - dt); enemy.cooldown -= dt;
        const potential = [s.furnace, ...s.towers.filter(t => t.built && t.hp > 0), ...s.turrets.filter(t => t.built && t.hp > 0)];
        let target = distance(p, enemy) < (enemy.type === 'boss' ? 260 : 180) ? p : potential.sort((a, b) => distance(a, enemy) - distance(b, enemy))[0];
        const d = distance(enemy, target) || 1;
        enemy.face = { x: (target.x - enemy.x) / d, y: (target.y - enemy.y) / d };
        if (d > (target === p ? 33 : 48)) {
          const speed = enemy.type === 'boss' ? 59 : 78;
          enemy.x += enemy.face.x * speed * dt; enemy.y += enemy.face.y * speed * dt;
        } else if (enemy.cooldown <= 0) {
          enemy.cooldown = enemy.type === 'boss' ? 1.05 : 1.3;
          if (target === p) {
            if (p.invincible <= 0) { p.hp -= enemy.type === 'boss' ? 15 : 7; p.hurt = .25; }
          } else {
            target.hp = Math.max(target.kind === 'furnace' ? 1 : 0, target.hp - (enemy.type === 'boss' ? 14 : 6));
            if (target.hp === 0) this.notify(target.name + '受损停机，靠近后可以修复。', 'danger');
          }
        }
      }
      const dead = s.enemies.filter(e => e.hp <= 0);
      for (const e of dead) {
        s.kills++; s.resources.wood += e.type === 'boss' ? 40 : 5; s.resources.ore += e.type === 'boss' ? 12 : 2;
        this.effect('deposit', e.x, e.y, e.type === 'boss' ? '巨兽已击败' : '+战利品');
        if (e.type === 'boss') this.notify('霜牙巨兽倒下了！守好供热塔，清除剩余敌人。', 'build');
      }
      s.enemies = s.enemies.filter(e => e.hp > 0);
    }
    rescue() {
      const s = this.state, p = s.player;
      s.rescues++; p.x = s.furnace.x; p.y = s.furnace.y + 110; p.hp = 85; p.temp = 100; p.invincible = 5;
      p.frozen = false; p.freezeTimer = 0; p.coldWarned = false; p.moving = false; p.swing = 0;
      p.bag.wood = Math.floor(p.bag.wood * .75); p.bag.ore = Math.floor(p.bag.ore * .75);
      this.effect('rescue', p.x, p.y, '营地救援');
      this.notify('你被救回了炉旁，丢失少量背包物资。装备与建筑都保留。', 'rescue');
    }
    objective() {
      const s = this.state, lit = s.towers.filter(t => t.built && t.hp > 0).length;
      if (s.mode === 'won') return { chapter: '春天抵达', title: '整座山谷，重新温暖。', description: '供暖覆盖率 100% · 远征完成' };
      if (s.final.active) return { chapter: '最后的暴风雪', title: '守住炉火 ' + Math.min(60, Math.floor(s.final.elapsed)) + ' / 60 秒', description: s.enemies.length ? '剩余 ' + s.enemies.length + ' 个入侵者 · 保护供热塔' : lit < 3 ? '修复受损的供热塔，恢复全网供暖' : '坚守到最后一刻，等待风雪平息' };
      if (s.furnace.level === 1) return { chapter: '01 / 寒夜里的火种', title: '升级中央熔炉', description: '采集并带回 45 木材 + 8 矿石。炉旁自动卸货。' };
      if (!s.camp.built) return { chapter: '02 / 有人与你同行', title: '救援伐木营地的工人', description: '熔炉西侧的营地：35 木材 + 8 矿石。' };
      if (lit < 3) return { chapter: '03 / 让暖光走得更远', title: '点亮供热塔 ' + lit + ' / 3', description: '向西北、东北和南方探索。随时升级装备或修建箭塔。' };
      if (s.furnace.level < 3) return { chapter: '04 / 风暴前的准备', title: '将中央熔炉升到 3 级', description: '需要 115 木材 + 34 矿石。准备好守望箭塔。' };
      return { chapter: '05 / 最后一次守望', title: '回到炉旁，迎接暴风雪', description: '启动最终挑战，守住 60 秒并击败霜牙巨兽。' };
    }
    serialize() { return JSON.stringify(this.state); }
    static restore(json) {
      try {
        if (typeof json === 'string' && json.length > 500000) return null;
        let data = typeof json === 'string' ? JSON.parse(json) : JSON.parse(JSON.stringify(json));
        const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
        const legacy = object(data) && data.version === 1;
        const number = (value, min = 0, max = 1e7) => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
        const integer = (value, min = 0, max = 1e7) => Number.isInteger(value) && number(value, min, max);
        const fields = (value, keys, min = 0, max = 1e7) => object(value) && keys.every(key => number(value[key], min, max));
        const point = value => fields(value, ['x'], 0, legacy ? 2200 : World.width) && fields(value, ['y'], 0, legacy ? 1800 : World.height);
        const face = value => fields(value, ['x', 'y'], -1, 1);
        const resources = value => fields(value, ['wood', 'ore'], 0, 1e9);
        const health = value => fields(value, ['maxHp'], 1, 1000) && number(value.hp, 0, value.maxHp);
        const building = (value, kind) => point(value) && value.kind === kind && typeof value.name === 'string' && value.name.length <= 80;
        const buildable = (value, kind) => building(value, kind) && typeof value.built === 'boolean' && resources(value.cost);
        const roster = (values, ids, kind) => Array.isArray(values) && values.length === ids.length &&
          ids.every(id => values.filter(value => object(value) && value.id === id).length === 1) &&
          values.every(value => buildable(value, kind) && health(value));
        if (!object(data) || (!legacy && data.version !== SAVE_VERSION) || !['playing', 'paused', 'won', 'menu'].includes(data.mode)) return null;
        if (!integer(data.seed, 0, 0xffffffff) || !integer(data.rng, 0, 0xffffffff) || !number(data.time)) return null;
        const p = data.player, f = data.furnace, finale = data.final;
        if (!point(p) || !fields(p, ['hp', 'temp'], 0, 100) || !resources(p.bag) || !resources(data.resources)) return null;
        if (!['axe', 'pack', 'boots'].every(key => integer(p[key], 1, 3)) || p.bag.wood + p.bag.ore > 28 + (p.pack - 1) * 22) return null;
        if (!face(p.face) || typeof p.moving !== 'boolean' || !fields(p, ['swing', 'hurt', 'invincible'], 0, 10) || !fields(p, ['gather', 'attack'], -1e7, 10)) return null;
        if (!legacy && (!integer(p.coat, 1, 3) || typeof p.frozen !== 'boolean' || typeof p.coldWarned !== 'boolean' || !number(p.freezeTimer, 0, 5))) return null;
        if (!building(f, 'furnace') || f.id !== 'furnace' || !health(f) || !integer(f.level, 1, 3) || !number(f.fuel, 0, 100)) return null;
        if (!roster(data.towers, ['pine', 'ridge', 'lake'], 'tower') || !roster(data.turrets, ['turret1', 'turret2', 'turret3'], 'turret')) return null;
        if (data.turrets.some(value => !number(value.cooldown, -1e7, 10))) return null;
        if (!buildable(data.camp, 'camp') || data.camp.id !== 'camp' || !number(data.camp.production, 0, 1)) return null;
        if (!Array.isArray(data.workers) || data.workers.length > 2 || data.workers.some(value => !point(value) || !number(value.phase))) return null;
        if (!Array.isArray(data.nodes) || !data.nodes.length || data.nodes.length > 400 || data.nodes.some(value =>
          !point(value) || typeof value.id !== 'string' || value.id.length > 80 || !['tree', 'ore'].includes(value.type) || !number(value.max, 1, 1000) ||
          !number(value.amount, 0, value.max) || !number(value.respawn, -1, 300) || !number(value.hit, 0, 1))) return null;
        if (new Set(data.nodes.map(node => node.id)).size !== data.nodes.length) return null;
        if (!legacy && (data.workers.length !== (data.camp.built ? 2 : 0) || data.workers.some((worker, index) =>
          worker.id !== 'worker' + (index + 1) || worker.capacity !== (index ? 16 : 12) || !resources(worker.bag) || worker.bag.ore !== 0 || worker.bag.wood > worker.capacity ||
          typeof worker.moving !== 'boolean' || !face(worker.face) || !number(worker.swing, 0, 1) || !number(worker.chopTimer, -1e7, 3) ||
          !['seek', 'walk', 'chop', 'return', 'unload'].includes(worker.task) ||
          (worker.targetId !== null && !data.nodes.some(node => node.id === worker.targetId && node.type === 'tree')) ||
          (['walk', 'chop'].includes(worker.task) && worker.targetId === null)))) return null;
        if (!Array.isArray(data.enemies) || data.enemies.length > 100 || data.enemies.some(value =>
          !point(value) || !integer(value.id, 1) || !['wolf', 'boss'].includes(value.type) || !health(value) || !face(value.face) ||
          !number(value.hit, 0, 1) || !number(value.cooldown, -1e7, 10))) return null;
        if (new Set(data.enemies.map(enemy => enemy.id)).size !== data.enemies.length) return null;
        if (!object(data.wave) || !integer(data.wave.number) || !number(data.wave.timer, 0, 110)) return null;
        if (!object(finale) || typeof finale.active !== 'boolean' || typeof finale.bossSpawned !== 'boolean' || !number(finale.elapsed) || !integer(finale.nextSpawn, 0, 60)) return null;
        if (!['kills', 'rescues'].every(key => integer(data[key])) || !integer(data.nextEnemy, 1) || typeof data.autoFeed !== 'boolean' ||
          !number(data.warmth, 0, 100) || !number(data.heatClock, 0, 1) || !number(data.hintClock)) return null;
        if (data.mode === 'won' && (!finale.active || finale.elapsed < 60 || !finale.bossSpawned || data.enemies.length || data.towers.some(t => !t.built || t.hp <= 0) || f.hp <= 0)) return null;
        const engine = new WinterEngine(data.seed);
        if (legacy) {
          const fresh = engine.state;
          const dx = CENTER.x - 1100, dy = CENTER.y - 900;
          const translate = value => World.clampPoint({ x: value.x + dx, y: value.y + dy });
          data = {
            ...data, version: SAVE_VERSION,
            player: { ...p, ...translate(p), coat: p.boots, frozen: false, freezeTimer: 0, coldWarned: false },
            furnace: { ...f, x: fresh.furnace.x, y: fresh.furnace.y },
            camp: { ...fresh.camp, built: data.camp.built },
            towers: fresh.towers.map(tower => {
              const old = data.towers.find(value => value.id === tower.id);
              return { ...tower, built: old.built, hp: old.hp, maxHp: old.maxHp };
            }),
            turrets: fresh.turrets.map(turret => {
              const old = data.turrets.find(value => value.id === turret.id);
              return { ...turret, built: old.built, hp: old.hp, maxHp: old.maxHp, cooldown: old.cooldown };
            }),
            nodes: fresh.nodes, workers: [],
            enemies: data.enemies.map(enemy => ({ ...enemy, ...translate(enemy) }))
          };
        }
        engine.state = data;
        if (legacy && data.camp.built) engine.createWorkers();
        if (legacy) engine.notify('旧进度已迁移到新雪原，装备、物资和建筑均已保留。', 'info');
        if (data.mode === 'playing') data.mode = 'paused';
        engine.updateWarmth();
        return engine;
      } catch { return null; }
    }
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = WinterEngine;
  else root.WinterEngine = WinterEngine;
})(typeof globalThis !== 'undefined' ? globalThis : this);
