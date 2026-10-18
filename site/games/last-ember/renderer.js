/* Procedural winter diorama. All artwork is drawn locally with Canvas 2D. */
(() => {
  'use strict';
  const TAU = Math.PI * 2;
  const GROUND_Y = 0.76;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const mix = (a, b, amount) => a + (b - a) * amount;
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const polygon = (ctx, points, fill, stroke, width = 1) => {
    ctx.beginPath();
    points.forEach((point, index) => index ? ctx.lineTo(...point) : ctx.moveTo(...point));
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke(); }
  };
  const ellipse = (ctx, x, y, rx, ry, color) => {
    ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, TAU); ctx.fillStyle = color; ctx.fill();
  };
  const line = (ctx, points, color, width = 1) => {
    ctx.beginPath(); points.forEach((point, index) => index ? ctx.lineTo(...point) : ctx.moveTo(...point));
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke();
  };
  function random(seed) {
    let value = seed >>> 0;
    return () => {
      value = Math.imul(value ^ value >>> 15, 1 | value);
      value ^= value + Math.imul(value ^ value >>> 7, 61 | value);
      return ((value ^ value >>> 14) >>> 0) / 4294967296;
    };
  }

  class WinterRenderer {
    constructor(canvas, engine) {
      this.canvas = canvas;
      this.engine = engine;
      this.ctx = canvas.getContext('2d', { alpha: false });
      const player = engine.state?.player || { x: 1100, y: 1000 };
      this.camera = { x: player.x, y: player.y, scale: 1 };
      this.width = 1; this.height = 1; this.dpr = 1;
      this.lastTime = 0;
      this.footprints = [];
      this.lastStep = { x: player.x, y: player.y };
      this.stepSide = 1;
      this.terrain = this.makeTerrain();
      const rand = random(64791);
      this.snow = Array.from({ length: 105 }, () => ({ x: rand(), y: rand(), size: 0.7 + rand() * 1.5, speed: 14 + rand() * 28, drift: rand() * TAU }));
      this.flowers = Array.from({ length: 360 }, () => {
        const angle = rand() * TAU, radius = Math.sqrt(rand()) * 790;
        return { x: 1100 + Math.cos(angle) * radius, y: 900 + Math.sin(angle) * radius, hue: rand(), size: 2 + rand() * 2 };
      });
      this.resize();
    }

    resize() {
      const rect = this.canvas.getBoundingClientRect();
      this.width = rect.width || window.innerWidth || 960;
      this.height = rect.height || window.innerHeight || 720;
      this.dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.canvas.width = Math.round(this.width * this.dpr);
      this.canvas.height = Math.round(this.height * this.dpr);
      this.camera.scale = this.width < 640 ? 0.76 : clamp(this.height / 820, 0.83, 1.15);
    }

    screenToWorld(clientX, clientY) {
      const rect = this.canvas.getBoundingClientRect();
      const x = (clientX - rect.left) * this.width / (rect.width || this.width);
      const y = (clientY - rect.top) * this.height / (rect.height || this.height);
      return {
        x: this.camera.x + (x - this.width / 2) / this.camera.scale,
        y: this.camera.y + (y - this.height * 0.54) / (this.camera.scale * GROUND_Y)
      };
    }

    point(x, y) {
      return { x: (x - this.camera.x) * this.camera.scale + this.width / 2,
        y: (y - this.camera.y) * this.camera.scale * GROUND_Y + this.height * 0.54 };
    }

    makeTerrain() {
      const canvas = document.createElement('canvas');
      canvas.width = 2200; canvas.height = 1800;
      const ctx = canvas.getContext('2d');
      const rand = random(75176);
      ctx.fillStyle = '#829faf'; ctx.fillRect(0, 0, 2200, 1800);
      for (let i = 0; i < 100; i++) {
        const x = rand() * 2200, y = rand() * 1800;
        line(ctx, [[x, y], [x + 16 + rand() * 90, y - 3]], 'rgba(194,221,232,.14)', 2);
      }
      const island = Array.from({ length: 80 }, (_, i) => {
        const angle = i / 80 * TAU, radius = 838 + rand() * 24;
        return [1100 + Math.cos(angle) * radius, 900 + Math.sin(angle) * radius];
      });
      polygon(ctx, island.map(([x, y]) => [x + 8, y + 20]), '#6d909e');
      polygon(ctx, island, '#d7e7ed', '#bdd6e1', 18);
      for (let i = 0; i < 95; i++) {
        const x = 270 + rand() * 1660, y = 70 + rand() * 1660;
        if (Math.hypot(x - 1100, y - 900) > 800) continue;
        const span = 60 + rand() * 130;
        polygon(ctx, [[x, y], [x + span, y - span * .3], [x + span * 1.5, y + span * .4], [x + 20, y + span * .5]], i % 2 ? '#deedf1' : '#d1e3eb');
      }
      // Frozen streams are shallow scenic features, so they do not imply collision.
      const river = () => {
        ctx.beginPath(); ctx.moveTo(335, 1260); ctx.bezierCurveTo(630, 1100, 470, 730, 630, 570);
        ctx.bezierCurveTo(770, 410, 750, 240, 700, 150);
      };
      ctx.lineCap = 'round'; river(); ctx.strokeStyle = '#c4dce7'; ctx.lineWidth = 80; ctx.stroke();
      river(); ctx.strokeStyle = '#a8cadb'; ctx.lineWidth = 55; ctx.stroke();
      river(); ctx.strokeStyle = '#b9d6e3'; ctx.lineWidth = 43; ctx.stroke();
      for (const [x, y] of [[520, 990], [570, 720], [660, 460], [705, 280]]) {
        line(ctx, [[x - 13, y - 20], [x + 9, y], [x - 9, y + 23]], '#d8edf2', 2);
        line(ctx, [[x + 9, y], [x + 24, y - 9]], '#e3f1f4', 1);
      }
      // Tracks lead the eye from the hearth towards all three distant beacons.
      for (const [x, y] of [[620, 550], [1580, 550], [1100, 1450]]) {
        ctx.beginPath(); ctx.moveTo(1100, 900); ctx.quadraticCurveTo((1100 + x) / 2 + 35, (900 + y) / 2, x, y);
        ctx.strokeStyle = '#c6d9df'; ctx.lineWidth = 43; ctx.stroke();
        ctx.strokeStyle = '#dce9ea'; ctx.lineWidth = 31; ctx.stroke();
        ctx.setLineDash([2, 13]); ctx.strokeStyle = '#b9cfd7'; ctx.lineWidth = 3; ctx.stroke(); ctx.setLineDash([]);
      }
      for (let i = 0; i < 850; i++) {
        const x = 300 + rand() * 1600, y = 100 + rand() * 1600;
        if (Math.hypot(x - 1100, y - 900) > 810) continue;
        ellipse(ctx, x, y, 1.2 + rand() * 2, .8, i % 3 ? 'rgba(255,255,255,.42)' : 'rgba(129,163,179,.17)');
      }
      // Faceted, snowy boulders form an obvious natural rim around the island.
      for (let i = 0; i < 51; i++) {
        const a = i / 51 * TAU, r = 813 + rand() * 21;
        const x = 1100 + Math.cos(a) * r, y = 900 + Math.sin(a) * r;
        const w = 28 + rand() * 28, h = 20 + rand() * 25;
        polygon(ctx, [[x - w, y + 13], [x - w * .8, y - h * .3], [x, y - h], [x + w * .85, y - h * .4], [x + w, y + 9]], '#a2bac7');
        polygon(ctx, [[x - w * .8, y - h * .3], [x, y - h], [x + w * .85, y - h * .4], [x + 3, y + 2]], '#e7f2f4');
        line(ctx, [[x + 3, y + 2], [x + w, y + 9]], '#8faebd', 2);
      }
      return canvas;
    }

    draw(timeSeconds) {
      const state = this.engine.state;
      if (!state?.player) return;
      const ctx = this.ctx, player = state.player;
      const dt = clamp(timeSeconds - this.lastTime, 0, .05);
      this.lastTime = timeSeconds;
      const follow = 1 - Math.exp(-dt * 8);
      this.camera.x = mix(this.camera.x, player.x, follow);
      this.camera.y = mix(this.camera.y, player.y, follow);
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.clearRect(0, 0, this.width, this.height);
      ctx.fillStyle = '#a2bbc8'; ctx.fillRect(0, 0, this.width, this.height);
      ctx.save(); this.worldTransform(ctx);
      ctx.drawImage(this.terrain, 0, 0);
      this.drawWarmth(ctx, state, timeSeconds);
      this.drawFootprints(ctx, player, timeSeconds);
      ctx.restore();
      const nearby = this.engine.nearby?.();
      const entities = [
        ...(state.nodes || []).filter(node => node.amount > 0 || node.type === 'tree').map(node => ({ ...node, kind: 'node' })),
        state.furnace, ...(state.towers || []), state.camp, ...(state.turrets || []),
        ...(state.workers || []).map(worker => ({ ...worker, kind: 'worker' })),
        ...(state.enemies || []).map(enemy => ({ ...enemy, kind: 'enemy' })),
        { ...player, kind: 'player' }
      ].filter(Boolean).sort((a, b) => a.y - b.y);
      for (const entity of entities) {
        const p = this.point(entity.x, entity.y);
        if (p.x < -150 || p.x > this.width + 150 || p.y < -150 || p.y > this.height + 170) continue;
        ctx.save(); ctx.translate(p.x, p.y); ctx.scale(this.camera.scale, this.camera.scale);
        if (nearby?.id === entity.id) this.drawSelection(ctx, entity, timeSeconds);
        const hit = entity.hit > 0 || entity.hurt > 0;
        if (hit) ctx.translate(Math.sin(timeSeconds * 65) * 2.5, 0);
        if (entity.kind === 'node') entity.type === 'tree' ? this.drawTree(ctx, entity, timeSeconds) : this.drawOre(ctx, entity);
        else if (entity.kind === 'furnace') this.drawFurnace(ctx, entity, timeSeconds);
        else if (entity.kind === 'tower') this.drawTower(ctx, entity, timeSeconds);
        else if (entity.kind === 'camp') this.drawCamp(ctx, entity, timeSeconds);
        else if (entity.kind === 'turret') this.drawTurret(ctx, entity, timeSeconds);
        else if (entity.kind === 'enemy') this.drawEnemy(ctx, entity, timeSeconds);
        else this.drawPerson(ctx, entity, timeSeconds, entity.kind === 'worker');
        ctx.restore();
      }
      this.drawEffects(ctx);
      this.drawAtmosphere(ctx, state, timeSeconds);
      this.drawMinimap(ctx, state);
    }

    worldTransform(ctx) {
      ctx.translate(this.width / 2 - this.camera.x * this.camera.scale, this.height * .54 - this.camera.y * this.camera.scale * GROUND_Y);
      ctx.scale(this.camera.scale, this.camera.scale * GROUND_Y);
    }

    drawWarmth(ctx, state, time) {
      const sources = this.engine.heatSources?.() || [];
      const won = state.mode === 'won';
      for (const source of sources) {
        const r = source.r;
        if (!r || r < 5) continue;
        const glow = ctx.createRadialGradient(source.x, source.y, r * .15, source.x, source.y, r * 1.1);
        glow.addColorStop(0, 'rgba(216,190,111,.16)'); glow.addColorStop(.8, 'rgba(190,178,116,.13)'); glow.addColorStop(1, 'rgba(190,178,116,0)');
        ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(source.x, source.y, r * 1.1, 0, TAU); ctx.fill();
        const points = Array.from({ length: 56 }, (_, i) => {
          const a = i / 56 * TAU, edge = r * (.87 + Math.sin(i * 2.31) * .025);
          return [source.x + Math.cos(a) * edge, source.y + Math.sin(a) * edge];
        });
        polygon(ctx, points, won ? '#a0b68a' : '#b0bea0', '#dce5d4', 8);
        const inner = ctx.createRadialGradient(source.x, source.y, 10, source.x, source.y, r);
        inner.addColorStop(0, '#9a9f73'); inner.addColorStop(.65, 'rgba(158,174,130,.65)'); inner.addColorStop(1, 'rgba(174,189,153,0)');
        ctx.fillStyle = inner; ctx.beginPath(); ctx.arc(source.x, source.y, r * .86, 0, TAU); ctx.fill();
        for (let i = 0; i < 26; i++) {
          const a = i * 2.399, d = Math.sqrt((i + .5) / 26) * r * .78;
          const x = source.x + Math.cos(a) * d, y = source.y + Math.sin(a) * d;
          line(ctx, [[x - 3, y], [x - 2, y - 5], [x, y], [x + 4, y - 7]], 'rgba(102,131,86,.42)', 1.4);
        }
      }
      for (const flower of this.flowers) {
        if (!won && !sources.some(source => distance(source, flower) < source.r * .7)) continue;
        const p = this.point(flower.x, flower.y);
        if (p.x < -20 || p.x > this.width + 20 || p.y < -20 || p.y > this.height + 20) continue;
        const sway = Math.sin(time * 1.5 + flower.x) * 1.2;
        line(ctx, [[flower.x, flower.y], [flower.x + sway, flower.y - 6]], '#7c9967', 1.6);
        let color = '#e9e9c9';
        if (flower.hue > .7) color = '#dcb5a2';
        else if (flower.hue > .45) color = '#f2dc9a';
        ellipse(ctx, flower.x + sway, flower.y - 7, flower.size, flower.size * .8, color);
      }
    }

    drawFootprints(ctx, player, time) {
      if (player.moving && distance(player, this.lastStep) > 20) {
        const f = player.face || { x: 0, y: 1 };
        this.footprints.push({ x: player.x - f.y * 5 * this.stepSide, y: player.y + f.x * 5 * this.stepSide, angle: Math.atan2(f.y, f.x), time });
        this.lastStep = { x: player.x, y: player.y }; this.stepSide *= -1;
      }
      this.footprints = this.footprints.filter(step => time - step.time < 22).slice(-180);
      for (const step of this.footprints) {
        ctx.save(); ctx.translate(step.x, step.y); ctx.rotate(step.angle);
        ellipse(ctx, 0, 0, 4, 2.1, `rgba(104,137,151,${.2 * (1 - (time - step.time) / 22)})`); ctx.restore();
      }
    }

    shadow(ctx, width, height = width * .29, opacity = .19) {
      ellipse(ctx, 9, 4, width, height, `rgba(39,72,88,${opacity})`);
    }

    drawSelection(ctx, entity, time) {
      const width = entity.kind === 'furnace' ? 57 : entity.kind === 'camp' ? 57 : 37;
      ctx.beginPath(); ctx.ellipse(0, 2, width, width * .46, 0, 0, TAU);
      ctx.strokeStyle = `rgba(255,226,153,${.68 + Math.sin(time * 4) * .15})`; ctx.lineWidth = 2;
      ctx.setLineDash([8, 5]); ctx.stroke(); ctx.setLineDash([]);
      ellipse(ctx, 0, 2, width - 3, width * .4, 'rgba(250,219,146,.11)');
    }

    drawTree(ctx, node, time) {
      const variant = (node.x * 13 + node.y * 7) % 17 / 17;
      const scale = .85 + variant * .28;
      if (node.amount <= 0) {
        this.shadow(ctx, 14); polygon(ctx, [[-8, 0], [-8, -9], [6, -11], [10, -3], [7, 3]], '#8f7865');
        ellipse(ctx, 0, -10, 8, 3, '#c4aa85'); line(ctx, [[-4, -10], [3, -9]], '#9e8064'); return;
      }
      ctx.save(); ctx.scale(scale, scale);
      const sway = Math.sin(time * 1.4 + node.x) * 1.2 + (node.hit > 0 ? Math.sin(time * 55) * 4 : 0);
      this.shadow(ctx, 29, 10);
      polygon(ctx, [[-7, 1], [-6, -38], [5, -38], [8, 0]], '#786858');
      ctx.translate(sway, 0);
      for (const [y, w, h] of [[-10, 37, 49], [-34, 30, 44], [-57, 23, 41]]) {
        polygon(ctx, [[-w, y], [0, y - h], [w, y], [w * .2, y + 6]], '#466a68');
        polygon(ctx, [[0, y - h], [w, y], [2, y + 4]], '#355c61');
        polygon(ctx, [[-w * .73, y - h * .17], [0, y - h], [w * .72, y - h * .18], [w * .32, y - h * .22], [w * .08, y - h * .11], [-w * .19, y - h * .24]], '#edf5f3');
        polygon(ctx, [[0, y - h], [w * .72, y - h * .18], [w * .14, y - h * .27]], '#d1e3e9');
      }
      if (node.hit > 0) { line(ctx, [[-24, -36], [-39, -42]], '#f5d391', 3); line(ctx, [[28, -36], [39, -45]], '#f5d391', 2); }
      ctx.restore();
    }

    drawOre(ctx, node) {
      this.shadow(ctx, 25, 9);
      polygon(ctx, [[-29, -3], [-22, -25], [-5, -36], [18, -30], [30, -9], [18, 4], [-12, 7]], '#839fae', '#6d8a9c', 1.3);
      polygon(ctx, [[-22, -25], [-5, -36], [18, -30], [5, -11], [-10, -6]], '#c6dbe1');
      polygon(ctx, [[5, -11], [18, -30], [30, -9], [18, 4]], '#6b8d9f');
      polygon(ctx, [[-22, -25], [-5, -36], [18, -30], [13, -25], [-3, -29], [-14, -20]], '#eef5f3');
      for (const [x, y] of [[-12, -17], [8, -22], [16, -6]]) {
        polygon(ctx, [[x - 4, y], [x, y - 7], [x + 6, y - 2], [x + 2, y + 4]], '#c7a574');
      }
      if (node.hit > 0) ellipse(ctx, -7, -16, 8, 5, 'rgba(255,228,170,.6)');
    }

    flame(ctx, x, y, size, time, active = true) {
      if (!active) { ellipse(ctx, x, y, size * .5, 3, '#718a92'); return; }
      const wave = Math.sin(time * 9 + x) * size * .12;
      const glow = ctx.createRadialGradient(x, y - size * .4, 0, x, y - size * .4, size * 2.5);
      glow.addColorStop(0, 'rgba(255,178,74,.24)'); glow.addColorStop(1, 'rgba(255,178,74,0)');
      ctx.fillStyle = glow; ctx.fillRect(x - size * 2.5, y - size * 3, size * 5, size * 5);
      polygon(ctx, [[x - size * .55, y], [x - size * .6, y - size * .45], [x - size * .17, y - size * 1.1], [x + wave, y - size * 1.8], [x + size * .25, y - size * .65], [x + size * .58, y - size * .93], [x + size * .62, y - size * .2], [x + size * .32, y + 3]], '#ed9050');
      polygon(ctx, [[x - size * .3, y], [x - size * .24, y - size * .45], [x + wave * .7, y - size * 1.12], [x + size * .12, y - size * .5], [x + size * .32, y], [x, y + 3]], '#ffdb85');
      for (let i = 0; i < 5; i++) {
        const phase = (time * .6 + i * .21) % 1;
        ellipse(ctx, x + Math.sin(time * 2 + i * 7) * size * .55, y - size * (1 + phase * 3.7), 1.3 * (1 - phase), 2 * (1 - phase), `rgba(255,202,110,${1 - phase})`);
      }
    }

    drawFurnace(ctx, furnace, time) {
      const active = furnace.fuel > 0 && furnace.hp > 0, level = furnace.level || 1;
      this.shadow(ctx, 51, 18, .24);
      polygon(ctx, [[-48, 9], [-50, -9], [-29, -24], [24, -25], [48, -7], [43, 12], [0, 23]], '#758b87');
      polygon(ctx, [[-43, 3], [-29, -17], [24, -19], [42, -3], [0, 12]], '#a3aca0');
      for (const x of [-27, 26]) polygon(ctx, [[x - 4, 5], [x - 4, -13], [x + 4, -13], [x + 4, 7]], '#49575a');
      polygon(ctx, [[-33, -10], [-35, -53], [-19, -67], [26, -63], [36, -47], [32, -10], [0, 1]], '#745b46', '#455359', 2);
      polygon(ctx, [[-33, -10], [-35, -53], [-12, -46], [-10, -3]], '#a27851');
      polygon(ctx, [[-35, -53], [-19, -67], [26, -63], [36, -47], [10, -40], [-12, -46]], '#b38f62', '#536162', 1.5);
      polygon(ctx, [[7, -56], [7, -104], [23, -108], [27, -58]], '#667575', '#45575a', 2);
      polygon(ctx, [[7, -104], [10, -111], [25, -111], [29, -105], [23, -102]], '#a9b7ad');
      line(ctx, [[8, -82], [25, -84]], '#a79270', 3);
      polygon(ctx, [[-13, -12], [-13, -31], [-5, -39], [12, -37], [19, -28], [18, -12]], '#283c42', '#d0a46c', 3);
      this.flame(ctx, 3, -13, 14 + level * 1.6, time, active);
      line(ctx, [[-18, -7], [23, -7]], '#474f4a', 5);
      for (const x of [-25, 28]) { ellipse(ctx, x, -38, 2, 2, '#d6b985'); ellipse(ctx, x, -17, 2, 2, '#d6b985'); }
      if (level >= 2) {
        polygon(ctx, [[-39, -21], [-46, -24], [-46, -47], [-38, -50]], '#64756e', '#c3a26a', 2);
        polygon(ctx, [[34, -26], [45, -29], [43, -50], [36, -48]], '#64756e', '#c3a26a', 2);
      }
      if (active) for (let i = 0; i < 4; i++) {
        const phase = (time * .17 + i * .25) % 1;
        ellipse(ctx, 17 + phase * 22 + Math.sin(time + i) * 3, -115 - phase * 60, 6 + phase * 11, 6 + phase * 12, `rgba(223,226,212,${.18 * (1 - phase)})`);
      }
      this.healthBar(ctx, furnace, -76, 48);
    }

    drawTower(ctx, tower, time) {
      if (!tower.built) {
        this.shadow(ctx, 29); polygon(ctx, [[-25, 4], [-21, -8], [20, -8], [29, 4], [0, 11]], '#adbec0');
        for (const x of [-17, 17]) line(ctx, [[x, 1], [x, -41]], '#889a99', 5);
        line(ctx, [[-20, -39], [20, -39]], '#b9cbc9', 6);
        polygon(ctx, [[-13, -39], [2, -59], [18, -39]], '#d9e5e5');
        this.blueprint(ctx, -13, -27); return;
      }
      this.shadow(ctx, 35);
      for (const [x, foot] of [[-19, -30], [19, 30], [0, 5]]) line(ctx, [[foot, 6], [x * .5, -57]], '#6f7562', 7);
      line(ctx, [[-20, -20], [20, -20]], '#a59569', 4);
      line(ctx, [[-18, -19], [16, -42]], '#66776b', 3);
      polygon(ctx, [[-25, -55], [-18, -42], [17, -42], [27, -56], [0, -63]], '#8b7152', '#5c6661', 2);
      ellipse(ctx, 0, -56, 24, 7, '#514d3f');
      const active = tower.hp > 0 && this.engine.state.furnace.fuel > 0;
      this.flame(ctx, 0, -56, 19, time + tower.x, active);
      if (tower.hp <= 0) line(ctx, [[-9, -31], [2, -24], [-3, -17], [10, -8]], '#465d64', 2.5);
      line(ctx, [[-24, -55], [25, -55]], '#c8ac76', 3);
      const sway = Math.sin(time * 3 + tower.x) * 3;
      polygon(ctx, [[24, -47], [43 + sway, -40], [25, -29]], '#ae6551');
      this.healthBar(ctx, tower, -102, 40);
    }

    blueprint(ctx, x, y) {
      polygon(ctx, [[x, y], [x + 24, y], [x + 24, y + 23], [x, y + 23]], '#d7e8e7', '#9eafb0', 1);
      line(ctx, [[x + 12, y + 5], [x + 12, y + 18]], '#7e9eaa', 2);
      line(ctx, [[x + 5, y + 11], [x + 19, y + 11]], '#7e9eaa', 2);
    }

    drawCamp(ctx, camp, time) {
      this.shadow(ctx, 48, 15);
      if (!camp.built) {
        for (const [x, y] of [[-26, -7], [-8, -4], [10, -5]]) {
          polygon(ctx, [[x, y], [x + 12, y - 8], [x + 28, y - 3], [x + 17, y + 5]], '#a2957c');
        }
        this.blueprint(ctx, -12, -35); return;
      }
      polygon(ctx, [[-45, 3], [-9, -61], [42, 2], [10, 15]], '#6e8e85', '#4e6e6c', 2);
      polygon(ctx, [[-9, -61], [20, -51], [51, -2], [42, 2]], '#50766f');
      polygon(ctx, [[-33, 3], [-9, -45], [13, 10]], '#d2b982');
      polygon(ctx, [[-23, 7], [-9, -31], [4, 12]], '#43595b');
      polygon(ctx, [[-9, -61], [-19, -42], [1, -45], [11, -30], [19, -38], [20, -51]], '#e4eeea');
      line(ctx, [[-9, -62], [-9, -71]], '#7b745a', 3);
      polygon(ctx, [[-9, -72], [16 + Math.sin(time * 2) * 3, -68], [-9, -59]], '#c28b59');
      for (const x of [-48, 48]) line(ctx, [[x, 8], [x, -2]], '#797c67', 3);
      ellipse(ctx, 14, 11, 4, 3, '#c6a272');
    }

    drawTurret(ctx, turret, time) {
      this.shadow(ctx, 28);
      if (!turret.built) {
        polygon(ctx, [[-23, 1], [-13, -12], [13, -12], [25, 2], [0, 10]], '#b9c9c9');
        this.blueprint(ctx, -12, -29); return;
      }
      for (const x of [-17, 17]) line(ctx, [[x, 3], [x * .4, -33]], '#716e58', 6);
      polygon(ctx, [[-16, -31], [-12, -43], [16, -43], [20, -30], [2, -22]], '#a28a5d', '#566864', 2);
      polygon(ctx, [[1, -41], [5, -53], [38, -48], [39, -38]], '#657e7d', '#435e64', 2);
      ellipse(ctx, 39, -43, 4, 7, '#344d58');
      line(ctx, [[-24, -35], [-13, -45], [9, -45], [20, -35]], '#cedbd2', 2);
      if (turret.hp > 0 && turret.cooldown > .5) this.flame(ctx, 43, -42, 7, time * 2, true);
      if (turret.hp <= 0) line(ctx, [[-10, -40], [2, -32], [-2, -24]], '#3d5661', 2.5);
      this.healthBar(ctx, turret, -65, 35);
    }

    drawPerson(ctx, person, time, worker) {
      const moving = worker ? person.phase !== 'idle' : person.moving;
      const step = moving ? Math.sin(time * 11 + (worker ? person.x : 0)) * 4 : 0;
      const face = person.face || { x: 0, y: 1 };
      const direction = face.x < -.25 ? -1 : 1;
      const body = worker ? '#b48c5c' : '#6a8f93';
      this.shadow(ctx, 15, 6);
      ctx.save(); ctx.translate(0, -Math.abs(step) * .3);
      polygon(ctx, [[-10, -5], [-9, -18], [-1, -17], [-2, 0]], '#445b65');
      polygon(ctx, [[2, -1], [1, -17], [9, -17], [10, -5]], '#344d5c');
      ellipse(ctx, -7, 1 + step, 5, 3, '#364d58'); ellipse(ctx, 7, 1 - step, 5, 3, '#364d58');
      polygon(ctx, [[-14, -17], [-14, -35], [-7, -40], [11, -38], [15, -18], [6, -12], [-8, -12]], body, '#536e76', 1);
      polygon(ctx, [[-14, -18], [-16, -34], [-9, -37], [-4, -16]], '#a48b61');
      line(ctx, [[-10, -33], [-8, -18]], '#ddc692', 2);
      if ((person.bag?.wood || 0) > 0 || worker) {
        for (let i = 0; i < 3; i++) {
          const x = -16 + i * 6;
          polygon(ctx, [[x, -30], [x - 3, -48], [x + 2, -50], [x + 5, -32]], '#b99365', '#806f54', 1);
          ellipse(ctx, x, -49, 3, 2, '#e0bc84');
        }
      }
      line(ctx, [[-12, -31], [-18, -16 + step * .3]], body, 7);
      line(ctx, [[12, -32], [19, -19 - step * .3]], body, 7);
      ellipse(ctx, 19, -18 - step * .3, 3.5, 3.5, '#d6b895');
      ellipse(ctx, 0, -46, 10, 11, '#e0c6a8');
      polygon(ctx, [[-12, -45], [-10, -57], [-3, -62], [8, -58], [12, -45]], worker ? '#748e83' : '#4b697c');
      polygon(ctx, [[-10, -57], [-3, -62], [8, -58], [9, -54], [-6, -55]], '#e6eeea');
      line(ctx, [[-11, -45], [11, -45]], '#d7e2dc', 4);
      if (face.y > -.6) { ellipse(ctx, direction * 4, -41, 1.3, 1.5, '#4d5050'); }
      const scarf = worker ? '#e1b465' : '#bd6558';
      line(ctx, [[-10, -36], [11, -36]], scarf, 5);
      polygon(ctx, [[-6, -36], [-20, -31], [-27 - Math.sin(time * 5) * 3, -35], [-22, -25], [-6, -30]], scarf);
      if (!worker) {
        ctx.save(); ctx.translate(17, -20);
        const swing = person.swing > 0 ? Math.sin(person.swing * Math.PI * 7) * 1.3 : -.45;
        ctx.rotate(direction * swing);
        line(ctx, [[0, 9], [6, -19]], '#b39466', 3.5);
        polygon(ctx, [[4, -23], [15, -27], [21, -18], [7, -13]], '#d5e4e4', '#6d8893', 1.2);
        if (person.swing > 0) {
          ctx.beginPath(); ctx.arc(0, 0, 39, -1.8, -.3); ctx.strokeStyle = 'rgba(255,239,186,.65)'; ctx.lineWidth = 4; ctx.stroke();
        }
        ctx.restore();
      }
      ctx.restore();
    }

    drawEnemy(ctx, enemy, time) {
      const boss = enemy.type === 'boss';
      const scale = boss ? 2.35 : 1;
      const face = typeof enemy.face === 'object' ? enemy.face : { x: Math.cos(enemy.face || 0), y: Math.sin(enemy.face || 0) };
      const direction = face.x < 0 ? -1 : 1;
      this.shadow(ctx, boss ? 40 : 21, boss ? 14 : 7);
      ctx.save(); ctx.scale(scale * direction, scale);
      const step = Math.sin(time * (boss ? 6 : 10) + enemy.x) * 4;
      const fur = boss ? '#4d6477' : '#a3b6be';
      const light = boss ? '#8da5b7' : '#d2e0e3';
      polygon(ctx, [[-25, -12], [-40, -23], [-38, -12], [-26, -5]], fur);
      for (const [x, stride] of [[-15, step], [-6, -step], [12, -step], [19, step]]) {
        line(ctx, [[x, -9], [x + stride, 2]], boss ? '#354d63' : '#8199a6', 4);
      }
      polygon(ctx, [[-25, -10], [-21, -26], [-7, -30], [18, -25], [24, -13], [12, -5], [-12, -4]], fur);
      polygon(ctx, [[-21, -26], [-7, -30], [18, -25], [5, -18], [-17, -18]], light);
      polygon(ctx, [[12, -22], [18, -37], [30, -33], [39, -20], [32, -15], [20, -13]], fur);
      polygon(ctx, [[16, -31], [17, -45], [25, -34]], light);
      polygon(ctx, [[27, -32], [31, -43], [34, -28]], fur);
      polygon(ctx, [[31, -26], [40, -22], [38, -18], [28, -18]], light);
      ellipse(ctx, 39, -22, 2, 2, '#3f505d');
      ellipse(ctx, 29, -28, boss ? 2.1 : 1.5, 1.5, boss ? '#efb465' : '#e8cb83');
      if (boss) {
        polygon(ctx, [[8, -28], [-1, -42], [-1, -29], [-10, -35], [-6, -24], [-19, -26], [-10, -17], [7, -15]], '#bfd2de');
        line(ctx, [[2, -33], [-1, -48], [-9, -54]], '#e0eaf0', 3);
        line(ctx, [[-1, -44], [5, -50]], '#e0eaf0', 2);
        polygon(ctx, [[-21, -26], [-19, -34], [-14, -26]], '#c6dce5');
      }
      ctx.restore();
      this.healthBar(ctx, enemy, boss ? -126 : -58, boss ? 72 : 32);
    }

    healthBar(ctx, entity, y, width) {
      if (!Number.isFinite(entity.hp) || !entity.maxHp || entity.hp >= entity.maxHp) return;
      const ratio = clamp(entity.hp / entity.maxHp, 0, 1);
      ctx.fillStyle = 'rgba(48,70,80,.58)'; ctx.fillRect(-width / 2, y, width, 4);
      ctx.fillStyle = entity.kind === 'enemy' ? '#ca8069' : '#dbc180'; ctx.fillRect(-width / 2, y, width * ratio, 4);
    }

    drawEffects(ctx) {
      for (const effect of this.engine.effects || []) {
        const p = this.point(effect.x, effect.y);
        const ratio = clamp(effect.life / (effect.maxLife || 1), 0, 1);
        const progress = 1 - ratio;
        ctx.save(); ctx.translate(p.x, p.y); ctx.globalAlpha = ratio;
        if (effect.text) {
          ctx.font = '600 14px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(31,55,67,.75)';
          ctx.strokeText(effect.text, 0, -32 - progress * 35); ctx.fillStyle = effect.color || '#fff0bd'; ctx.fillText(effect.text, 0, -32 - progress * 35);
        }
        if (['hit', 'gather', 'spark', 'build', 'rescue', 'deposit'].includes(effect.type)) {
          const color = effect.color || (effect.type === 'hit' ? '#e6b98c' : '#fff0b4');
          for (let i = 0; i < 6; i++) {
            const angle = i / 6 * TAU + .3, radius = 10 + progress * 27;
            line(ctx, [[Math.cos(angle) * radius, Math.sin(angle) * radius * .6 - 15], [Math.cos(angle) * (radius + 4), Math.sin(angle) * (radius + 4) * .6 - 15]], color, 2);
          }
        }
        ctx.restore();
      }
    }

    drawAtmosphere(ctx, state, time) {
      const danger = state.final?.active || (state.wave?.number || 0) >= 3;
      const won = state.mode === 'won';
      if (danger && !won) { ctx.fillStyle = 'rgba(48,74,107,.055)'; ctx.fillRect(0, 0, this.width, this.height); }
      const vignette = ctx.createRadialGradient(this.width / 2, this.height * .52, this.width * .16, this.width / 2, this.height * .52, Math.max(this.width, this.height) * .72);
      vignette.addColorStop(0, 'rgba(33,63,82,0)'); vignette.addColorStop(1, won ? 'rgba(186,154,91,.11)' : 'rgba(41,69,90,.18)');
      ctx.fillStyle = vignette; ctx.fillRect(0, 0, this.width, this.height);
      if (won) return;
      for (const flake of this.snow) {
        const x = (flake.x * this.width + time * (danger ? 31 : 13) + Math.sin(time * .45 + flake.drift) * 13) % (this.width + 30) - 15;
        const y = (flake.y * this.height + time * flake.speed) % (this.height + 20) - 10;
        line(ctx, [[x, y], [x - (danger ? 5 : 1.5), y - flake.size * 2]], `rgba(255,255,255,${.24 + flake.size * .12})`, flake.size);
      }
      if (state.player.temp < 30) {
        ctx.strokeStyle = `rgba(211,238,250,${(30 - state.player.temp) / 85})`; ctx.lineWidth = 8;
        ctx.strokeRect(4, 4, this.width - 8, this.height - 8);
      }
    }

    drawMinimap(ctx, state) {
      const compact = this.width < 640;
      if (compact && this.height < 550) return;
      let size = 132;
      let top = this.height - size - 112;
      if (compact) {
        const shortViewport = this.height < 680;
        size = shortViewport ? 80 : 100;
        top = shortViewport ? 252 : 264;
      }
      const left = this.width - size - 18;
      if (top < 150) return;
      const centerX = left + size / 2, centerY = top + size / 2;
      ctx.save();
      ctx.fillStyle = 'rgba(30,54,65,.73)'; ctx.beginPath(); ctx.roundRect(left - 6, top - 6, size + 12, size + 12, 15); ctx.fill();
      ctx.strokeStyle = 'rgba(222,236,230,.24)'; ctx.lineWidth = 1; ctx.stroke();
      ellipse(ctx, centerX, centerY, size * .46, size * .46, '#91aeb8');
      const map = (x, y) => ({ x: centerX + (x - 1100) / 1800 * size, y: centerY + (y - 900) / 1800 * size });
      ctx.save(); ctx.beginPath(); ctx.arc(centerX, centerY, size * .46, 0, TAU); ctx.clip();
      for (const source of this.engine.heatSources?.() || []) {
        const p = map(source.x, source.y); ellipse(ctx, p.x, p.y, source.r / 1800 * size, source.r / 1800 * size, '#b9b986');
      }
      for (const entity of [state.furnace, ...(state.towers || [])].filter(Boolean)) {
        const p = map(entity.x, entity.y); const active = entity.kind === 'furnace' ? entity.fuel > 0 && entity.hp > 0 : entity.built && entity.hp > 0;
        polygon(ctx, [[p.x, p.y - 4], [p.x + 3, p.y], [p.x, p.y + 4], [p.x - 3, p.y]], active ? '#ffdaa0' : '#dbe6e5');
      }
      for (const enemy of state.enemies || []) {
        const p = map(enemy.x, enemy.y); ellipse(ctx, p.x, p.y, enemy.type === 'boss' ? 3 : 1.4, enemy.type === 'boss' ? 3 : 1.4, '#a95752');
      }
      const p = map(state.player.x, state.player.y);
      ellipse(ctx, p.x, p.y, 3.4, 3.4, '#f6f5dc'); ellipse(ctx, p.x, p.y, 1.6, 1.6, '#bc6654');
      ctx.restore();
      ctx.font = '9px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#dce9e4'; ctx.fillText('N', centerX, top + 5);
      ctx.restore();
    }
  }
  window.WinterRenderer = WinterRenderer;
})();
