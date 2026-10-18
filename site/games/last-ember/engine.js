(function (root) {
  'use strict';
  const CENTER = { x: 1100, y: 900 };
  const SAVE_VERSION = 1;
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const furnaceCosts = [{ wood: 45, ore: 8 }, { wood: 115, ore: 34 }];
  const gearCosts = {
    axe: [{ wood: 24, ore: 6 }, { wood: 65, ore: 24 }],
    pack: [{ wood: 28, ore: 4 }, { wood: 55, ore: 14 }],
    boots: [{ wood: 32, ore: 8 }, { wood: 65, ore: 20 }]
  };
  const names = { axe: '伐木斧', pack: '背包', boots: '雪地靴' };
  class WinterEngine {
    constructor(seed = 7301) {
      this.state = {
        version: SAVE_VERSION, seed, rng: seed >>> 0, mode: 'menu', time: 0,
        player: { x: 1100, y: 1020, hp: 100, temp: 100, bag: { wood: 0, ore: 0 }, axe: 1, pack: 1, boots: 1, face: { x: 0, y: 1 }, swing: 0, hurt: 0, moving: false, gather: 0, attack: 0, invincible: 0 },
        resources: { wood: 0, ore: 0 },
        furnace: { id: 'furnace', kind: 'furnace', name: '中央熔炉', x: 1100, y: 900, level: 1, fuel: 85, hp: 100, maxHp: 100 },
        towers: [
          { id: 'pine', name: '松林供热塔', x: 620, y: 550, cost: { wood: 85, ore: 24 } },
          { id: 'ridge', name: '山脊供热塔', x: 1580, y: 550, cost: { wood: 110, ore: 32 } },
          { id: 'lake', name: '湖畔供热塔', x: 1100, y: 1450, cost: { wood: 140, ore: 40 } }
        ].map(t => ({ ...t, kind: 'tower', built: false, hp: 160, maxHp: 160 })),
        camp: { id: 'camp', kind: 'camp', name: '伐木营地', x: 865, y: 940, built: false, production: 0, cost: { wood: 35, ore: 8 } },
        turrets: [[1100, 680], [1310, 1000], [900, 1090]].map(([x, y], i) => ({ id: 'turret' + (i + 1), kind: 'turret', name: '守望箭塔 ' + (i + 1), x, y, built: false, hp: 120, maxHp: 120, cooldown: 0, cost: { wood: 45, ore: 14 } })),
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
      [[1240, 1010], [1260, 870], [1145, 1105], [1030, 1115], [955, 780], [1185, 715], [790, 1040], [790, 840]].forEach(p => put('tree', ...p));
      [[1345, 805], [1310, 1170], [935, 1150], [890, 665], [1460, 935]].forEach(p => put('ore', ...p));
      for (let i = 0; i < 750 && this.state.nodes.length < 145; i++) {
        const angle = this.random() * Math.PI * 2;
        const r = 150 + Math.sqrt(this.random()) * 635;
        const p = { x: CENTER.x + Math.cos(angle) * r, y: CENTER.y + Math.sin(angle) * r * .92 };
        if (structures.some(s => distance(s, p) < 115) || this.state.nodes.some(n => distance(n, p) < 64)) continue;
        put(this.random() < .28 ? 'ore' : 'tree', p.x, p.y);
      }
    }
    start() { this.state.mode = 'playing'; this.notify('先去砍树，把木材带回炉旁。靠近树木会自动采集。'); }
    pause() { if (this.state.mode === 'playing') this.state.mode = 'paused'; }
    resume() { if (this.state.mode === 'paused') this.state.mode = 'playing'; }
    notify(text, type = 'info') { this.events.push({ text, type }); if (this.events.length > 30) this.events.shift(); }
    drainEvents() { return this.events.splice(0); }
    effect(type, x, y, text = '', color = '#ffbd71') {
      this.effects.push({ type, x, y, text, color, life: 1, maxLife: 1 });
      if (this.effects.length > 90) this.effects.shift();
    }
    structures() { const s = this.state; return [s.furnace, s.camp, ...s.towers, ...s.turrets]; }
    bagCapacity() { return 28 + (this.state.player.pack - 1) * 22; }
    heatSources() {
      const s = this.state;
      if (s.mode === 'won') return [{ ...CENTER, r: 2200 }];
      const f = s.furnace;
      const strength = f.fuel > 0 && f.hp > 0 ? 1 : .34;
      const sources = [{ x: f.x, y: f.y, r: (235 + (f.level - 1) * 95) * strength }];
      for (const t of s.towers) if (t.built && t.hp > 0) sources.push({ x: t.x, y: t.y, r: f.fuel > 0 ? 570 : 170 });
      return sources;
    }
    warmAt(x, y) { return this.heatSources().some(h => Math.hypot(h.x - x, h.y - y) <= h.r); }
    updateWarmth() {
      if (this.state.mode === 'won') { this.state.warmth = 100; return; }
      let covered = 0, total = 0;
      const heat = this.heatSources();
      for (let x = 300; x <= 1900; x += 80) for (let y = 160; y <= 1640; y += 80) {
        if (Math.hypot((x - 1100) / 820, (y - 900) / 755) > 1) continue;
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
        const reason = level >= 3 ? '已达最高等级' : !this.warmAt(this.state.player.x, this.state.player.y) ? '请回到暖区升级' : '';
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
        camp: target.built ? '工人正在伐木，每秒为仓库送来木材。' : '救出受困工人，让他们承担日常木材采集。',
        tower: target.built ? '温暖正在扩散，靠近这里也能卸货、恢复体温。' : '让温暖抵达这片雪原。修复后可在这里卸货。',
        turret: target.built ? '自动射击附近入侵者。受损后可用木材修复。' : '建造守望箭塔，自动抵御附近的入侵者。'
      };
      return { id: target.id, name: target.name + (target.kind === 'furnace' ? ' · Lv.' + target.level : ''), description: descriptions[target.kind], actions: this.actionsFor(target) };
    }
    action(id) {
      const s = this.state;
      if (s.mode !== 'playing') return { ok: false, text: '请先开始或继续游戏' };
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
          s.workers = [{ x: target.x - 25, y: target.y + 30, phase: 0 }, { x: target.x + 25, y: target.y + 20, phase: 2 }];
          message = '两位工人得救了！伐木营地开始持续供应木材。';
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
      let dx = Number.isFinite(input.x) ? clamp(input.x, -1, 1) : 0;
      let dy = Number.isFinite(input.y) ? clamp(input.y, -1, 1) : 0;
      const length = Math.hypot(dx, dy);
      if (length > 1) { dx /= length; dy /= length; }
      p.moving = length > .08;
      if (p.moving) {
        p.face = { x: dx, y: dy };
        const speed = (132 + (p.boots - 1) * 19) * (p.temp < 25 ? .72 : 1);
        p.x += dx * speed * dt; p.y += dy * speed * dt;
        const r = Math.hypot((p.x - 1100) / 810, (p.y - 900) / 745);
        if (r > 1) { p.x = 1100 + (p.x - 1100) / r; p.y = 900 + (p.y - 900) / r; }
      }
      const warm = this.warmAt(p.x, p.y);
      p.temp = clamp(p.temp + dt * (warm ? 13 : -(1.25 + (s.final.active ? .65 : 0)) / (1 + (p.boots - 1) * .3)), 0, 100);
      if (warm && !s.enemies.some(e => distance(e, p) < 150)) p.hp = Math.min(100, p.hp + dt * 3.5);
      if (p.temp <= 0) p.hp -= dt * 7;
      const built = s.towers.filter(t => t.built).length;
      s.furnace.fuel = Math.max(0, s.furnace.fuel - dt * (.10 + .025 * s.furnace.level + .035 * built));
      if (s.autoFeed && s.furnace.fuel < 25 && s.resources.wood >= 10) {
        s.resources.wood -= 10; s.furnace.fuel += 40; this.effect('spark', 1100, 900, '自动添火');
      }
      const depot = [s.furnace, ...s.towers.filter(t => t.built && t.hp > 0)].find(t => distance(t, p) < 95);
      if (depot && p.bag.wood + p.bag.ore > 0) {
        s.resources.wood += p.bag.wood; s.resources.ore += p.bag.ore;
        this.effect('deposit', depot.x, depot.y, '+' + (p.bag.wood + p.bag.ore));
        p.bag.wood = p.bag.ore = 0;
      }
      for (const node of s.nodes) {
        node.hit = Math.max(0, node.hit - dt);
        if (node.amount <= 0) { node.respawn -= dt; if (node.respawn <= 0) node.amount = node.max; }
      }
      const enemyInRange = s.enemies.some(e => e.hp > 0 && distance(e, p) < 100);
      if (!enemyInRange && p.gather <= 0 && p.bag.wood + p.bag.ore < this.bagCapacity()) {
        const node = s.nodes.filter(n => n.amount > 0 && distance(n, p) < 72).sort((a, b) => distance(a, p) - distance(b, p))[0];
        if (node) {
          const key = node.type === 'tree' ? 'wood' : 'ore';
          const amount = Math.min(node.amount, this.bagCapacity() - p.bag.wood - p.bag.ore, key === 'wood' ? p.axe + 2 : p.axe);
          p.bag[key] += amount; node.amount -= amount; node.hit = .22; p.swing = .24; p.gather = .82 - (p.axe - 1) * .08;
          if (node.amount <= 0) node.respawn = node.type === 'tree' ? 48 : 70;
          this.effect('gather', node.x, node.y, '+' + amount, key === 'wood' ? '#efbc79' : '#b5deef');
        }
      }
      if (s.camp.built) {
        s.camp.production += dt * .72;
        if (s.camp.production >= 1) { const n = Math.floor(s.camp.production); s.resources.wood += n; s.camp.production -= n; }
        for (let i = 0; i < s.workers.length; i++) {
          const worker = s.workers[i]; worker.phase += dt * .8;
          worker.x = s.camp.x + Math.sin(worker.phase) * 68;
          worker.y = s.camp.y + 28 + Math.cos(worker.phase * 1.1) * 34;
        }
      }
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
        s.enemies.push({ id: s.nextEnemy++, type, x: 1100 + Math.cos(a) * 770, y: 900 + Math.sin(a) * 700, hp, maxHp: hp, face: { x: 0, y: 1 }, hit: 0, cooldown: 0 });
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
      if (nearby.length && p.attack <= 0) {
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
      s.rescues++; p.x = 1100; p.y = 1010; p.hp = 85; p.temp = 100; p.invincible = 5;
      p.bag.wood = Math.floor(p.bag.wood * .75); p.bag.ore = Math.floor(p.bag.ore * .75);
      this.effect('rescue', p.x, p.y, '营地救援');
      this.notify('你被救回了炉旁，丢失少量背包物资。装备与建筑都保留。', 'danger');
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
        const data = typeof json === 'string' ? JSON.parse(json) : JSON.parse(JSON.stringify(json));
        const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
        const number = (value, min = 0, max = 1e7) => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
        const integer = (value, min = 0, max = 1e7) => Number.isInteger(value) && number(value, min, max);
        const fields = (value, keys, min = 0, max = 1e7) => object(value) && keys.every(key => number(value[key], min, max));
        const point = value => fields(value, ['x'], 0, 2200) && fields(value, ['y'], 0, 1800);
        const face = value => fields(value, ['x', 'y'], -1, 1);
        const resources = value => fields(value, ['wood', 'ore'], 0, 1e9);
        const health = value => fields(value, ['maxHp'], 1, 1000) && number(value.hp, 0, value.maxHp);
        const building = (value, kind) => point(value) && value.kind === kind && typeof value.name === 'string' && value.name.length <= 80;
        const buildable = (value, kind) => building(value, kind) && typeof value.built === 'boolean' && resources(value.cost);
        const roster = (values, ids, kind) => Array.isArray(values) && values.length === ids.length &&
          ids.every(id => values.filter(value => object(value) && value.id === id).length === 1) &&
          values.every(value => buildable(value, kind) && health(value));
        if (!object(data) || data.version !== SAVE_VERSION || !['playing', 'paused', 'won', 'menu'].includes(data.mode)) return null;
        if (!integer(data.seed, 0, 0xffffffff) || !integer(data.rng, 0, 0xffffffff) || !number(data.time)) return null;
        const p = data.player, f = data.furnace, finale = data.final;
        if (!point(p) || !fields(p, ['hp', 'temp'], 0, 100) || !resources(p.bag) || !resources(data.resources)) return null;
        if (!['axe', 'pack', 'boots'].every(key => integer(p[key], 1, 3)) || p.bag.wood + p.bag.ore > 28 + (p.pack - 1) * 22) return null;
        if (!face(p.face) || typeof p.moving !== 'boolean' || !fields(p, ['swing', 'hurt', 'invincible'], 0, 10) || !fields(p, ['gather', 'attack'], -1e7, 10)) return null;
        if (!building(f, 'furnace') || f.id !== 'furnace' || !health(f) || !integer(f.level, 1, 3) || !number(f.fuel, 0, 100)) return null;
        if (!roster(data.towers, ['pine', 'ridge', 'lake'], 'tower') || !roster(data.turrets, ['turret1', 'turret2', 'turret3'], 'turret')) return null;
        if (data.turrets.some(value => !number(value.cooldown, -1e7, 10))) return null;
        if (!buildable(data.camp, 'camp') || data.camp.id !== 'camp' || !number(data.camp.production, 0, 1)) return null;
        if (!Array.isArray(data.workers) || data.workers.length > 2 || data.workers.some(value => !point(value) || !number(value.phase))) return null;
        if (!Array.isArray(data.nodes) || !data.nodes.length || data.nodes.length > 250 || data.nodes.some(value =>
          !point(value) || typeof value.id !== 'string' || !['tree', 'ore'].includes(value.type) || !number(value.max, 1, 1000) ||
          !number(value.amount, 0, value.max) || !number(value.respawn, -1, 300) || !number(value.hit, 0, 1))) return null;
        if (!Array.isArray(data.enemies) || data.enemies.length > 100 || data.enemies.some(value =>
          !point(value) || !integer(value.id, 1) || !['wolf', 'boss'].includes(value.type) || !health(value) || !face(value.face) ||
          !number(value.hit, 0, 1) || !number(value.cooldown, -1e7, 10))) return null;
        if (!object(data.wave) || !integer(data.wave.number) || !number(data.wave.timer, 0, 110)) return null;
        if (!object(finale) || typeof finale.active !== 'boolean' || typeof finale.bossSpawned !== 'boolean' || !number(finale.elapsed) || !integer(finale.nextSpawn, 0, 60)) return null;
        if (!['kills', 'rescues'].every(key => integer(data[key])) || !integer(data.nextEnemy, 1) || typeof data.autoFeed !== 'boolean' ||
          !number(data.warmth, 0, 100) || !number(data.heatClock, 0, 1) || !number(data.hintClock)) return null;
        if (data.mode === 'won' && (!finale.active || finale.elapsed < 60 || !finale.bossSpawned || data.enemies.length || data.towers.some(t => !t.built || t.hp <= 0) || f.hp <= 0)) return null;
        const engine = new WinterEngine(data.seed);
        engine.state = data;
        if (data.mode === 'playing') data.mode = 'paused';
        engine.updateWarmth();
        return engine;
      } catch { return null; }
    }
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = WinterEngine;
  else root.WinterEngine = WinterEngine;
})(typeof globalThis !== 'undefined' ? globalThis : this);
