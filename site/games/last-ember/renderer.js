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
      this.world = window.WinterWorld;
      if (!this.world) throw new Error('WinterWorld must load before WinterRenderer');
      this.overview = false;
      this.cacheScale = 0.6;
      this.heatKey = null;
      this.minimapRect = null;
      const player = engine.state?.player || this.world.center;
      this.camera = { x: player.x, y: player.y, scale: 1 };
      this.width = 1; this.height = 1; this.dpr = 1;
      this.lastTime = 0;
      this.footprints = [];
      this.lastStep = { x: player.x, y: player.y };
      this.stepSide = 1;
      this.terrainCold = this.makeTerrain(false);
      this.terrainWarm = this.makeTerrain(true);
      this.warmLayer = this.makeCache();
      const rand = random(64791);
      this.snow = Array.from({ length: 105 }, () => ({ x: rand(), y: rand(), size: 0.7 + rand() * 1.5, speed: 14 + rand() * 28, drift: rand() * TAU }));
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

    makeCache() {
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(this.world.width * this.cacheScale);
      canvas.height = Math.ceil(this.world.height * this.cacheScale);
      return canvas;
    }

    islandOutline() {
      const { center, bounds } = this.world;
      return Array.from({ length: 100 }, (_, i) => {
        const angle = i / 100 * TAU;
        const ripple = 1 + Math.sin(i * 2.17) * .008;
        return [center.x + Math.cos(angle) * bounds.rx * ripple, center.y + Math.sin(angle) * bounds.ry * ripple];
      });
    }

    riverPath(ctx) {
      const points = this.world.riverPoints;
      ctx.beginPath(); ctx.moveTo(...points[0]);
      for (let i = 1; i < points.length - 1; i++) {
        const next = points[i + 1];
        ctx.quadraticCurveTo(...points[i], (points[i][0] + next[0]) / 2, (points[i][1] + next[1]) / 2);
      }
      ctx.lineTo(...points[points.length - 1]);
    }

    makeTerrain(warm) {
      const canvas = this.makeCache();
      const ctx = canvas.getContext('2d');
      ctx.scale(this.cacheScale, this.cacheScale);
      const { width, height, center, bounds } = this.world;
      const rand = random(75176);
      ctx.fillStyle = warm ? '#769f9d' : '#87a5b5'; ctx.fillRect(0, 0, width, height);
      for (let i = 0; i < 170; i++) {
        const x = rand() * width, y = rand() * height;
        line(ctx, [[x, y], [x + 22 + rand() * 100, y - 3]], 'rgba(206,230,231,.18)', 2);
      }
      const outline = this.islandOutline();
      polygon(ctx, outline.map(([x, y]) => [x + 8, y + 20]), warm ? '#678d82' : '#7095a6');
      polygon(ctx, outline, warm ? '#a7b68c' : '#d9e8ed', warm ? '#bfd0ad' : '#bdd5df', 18);
      ctx.save(); ctx.clip();
      for (let i = 0; i < 175; i++) {
        const x = 250 + rand() * (width - 500), y = 220 + rand() * (height - 440);
        const span = 80 + rand() * 170;
        const color = warm ? (i % 2 ? '#a1b389' : '#b4bf97') : (i % 2 ? '#e4eef0' : '#d0e2e9');
        polygon(ctx, [[x, y], [x + span, y - span * .3], [x + span * 1.5, y + span * .4], [x + 20, y + span * .5]], color);
      }
      this.paintPlain(ctx, warm, rand);
      this.paintMountain(ctx, warm);
      this.paintRiver(ctx, warm);
      // Winding tracks remain visible on both the snow and the thawed terrain.
      const routes = [
        [[center.x, center.y], [1450, 1290], [1160, 1170], [800, 1050]],
        [[center.x, center.y], [1910, 1270], [2080, 1120], [2260, 1080], [2150, 925], [2510, 930], [2370, 790], [2560, 690]],
        [[center.x, center.y], [1640, 1700], [1770, 1950], [1850, 2290]]
      ];
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      for (const points of routes) {
        line(ctx, points, warm ? '#a59b7c' : '#bccfd7', 40);
        line(ctx, points, warm ? '#c6bc96' : '#e1ebeb', 28);
        ctx.setLineDash([2, 15]); line(ctx, points, warm ? 'rgba(132,127,93,.35)' : '#bdd0d8', 2); ctx.setLineDash([]);
      }
      this.paintBridge(ctx, 755, 1100, warm);
      this.paintBridge(ctx, 794, 1665, warm);
      // Small mineral outcrops and plants add readable scale without image assets.
      for (let i = 0; i < 1700; i++) {
        const x = 250 + rand() * (width - 500), y = 220 + rand() * (height - 440);
        if (this.world.riverDistance(x, y) < 54) continue;
        if (warm) {
          line(ctx, [[x - 3, y], [x - 1, y - 6], [x + 1, y], [x + 5, y - 8]], i % 2 ? '#8b9e72' : '#96a67b', 1.6);
          if (i % 9 === 0) ellipse(ctx, x + 5, y - 9, 2.5, 2, i % 3 ? '#f1d9a0' : '#d5c4b1');
        } else ellipse(ctx, x, y, 1.5 + rand() * 2, .9, i % 3 ? 'rgba(255,255,255,.48)' : 'rgba(129,163,179,.18)');
      }
      // Boundary boulders keep the enlarged island visually legible.
      for (let i = 0; i < 80; i++) {
        const a = i / 80 * TAU;
        const x = center.x + Math.cos(a) * bounds.rx * .982;
        const y = center.y + Math.sin(a) * bounds.ry * .982;
        const w = 32 + rand() * 30, h = 22 + rand() * 32;
        polygon(ctx, [[x - w, y + 13], [x - w * .8, y - h * .3], [x, y - h], [x + w * .85, y - h * .4], [x + w, y + 9]], warm ? '#82958a' : '#9eb9c7');
        polygon(ctx, [[x - w * .8, y - h * .3], [x, y - h], [x + w * .85, y - h * .4], [x + 3, y + 2]], warm ? '#afbb9f' : '#e8f2f3');
        line(ctx, [[x + 3, y + 2], [x + w, y + 9]], warm ? '#708c80' : '#90acbc', 2);
      }
      ctx.restore();
      return canvas;
    }

    paintPlain(ctx, warm, rand) {
      const { x, y, rx, ry } = this.world.plain;
      const points = Array.from({ length: 40 }, (_, i) => {
        const a = i / 40 * TAU, r = 1 + Math.sin(i * 1.7) * .06;
        return [x + Math.cos(a) * rx * r, y + Math.sin(a) * ry * r];
      });
      polygon(ctx, points, warm ? '#a6bd84' : '#e3edef');
      for (let i = 0; i < 26; i++) {
        const xx = x - rx * .85 + rand() * rx * 1.7, yy = y - ry * .75 + rand() * ry * 1.5;
        ellipse(ctx, xx, yy, 50 + rand() * 110, 20 + rand() * 36, warm ? (i % 2 ? '#b2c58f' : '#9db77e') : '#d7e7e9');
      }
      for (let i = 0; i < 210; i++) {
        const a = i * 2.399, r = Math.sqrt((i + 1) / 210);
        const xx = x + Math.cos(a) * rx * r * .87, yy = y + Math.sin(a) * ry * r * .82;
        if (warm) {
          line(ctx, [[xx, yy], [xx + 2, yy - 8]], '#789461', 1.5);
          ellipse(ctx, xx + 2, yy - 9, 3, 2.3, ['#f1d995', '#d9b4a4', '#e7e9c7'][i % 3]);
        } else if (i % 4 === 0) line(ctx, [[xx - 3, yy], [xx - 2, yy - 4], [xx, yy], [xx + 3, yy - 5]], '#b9ccc6', 1.5);
      }
      // An old split-rail fence and standing stones identify the meadow.
      for (let i = 0; i < 8; i++) {
        const xx = 2080 + i * 32, yy = 2180 + i * 9;
        line(ctx, [[xx, yy], [xx, yy - 23]], '#9b967e', 4);
        if (i < 7) line(ctx, [[xx, yy - 13], [xx + 32, yy - 4]], warm ? '#b3a278' : '#c8d4ce', 4);
      }
      for (const [xx, yy] of [[1580, 2300], [1535, 2260], [1560, 2190]]) {
        polygon(ctx, [[xx - 13, yy], [xx - 11, yy - 34], [xx + 1, yy - 44], [xx + 16, yy - 30], [xx + 14, yy + 2]], warm ? '#97a58e' : '#afc3cb');
        polygon(ctx, [[xx - 11, yy - 34], [xx + 1, yy - 44], [xx + 16, yy - 30], [xx, yy - 28]], warm ? '#c0c4a5' : '#edf4f2');
      }
    }

    paintMountain(ctx, warm) {
      const facets = [
        { points: [[1920, 1010], [2100, 615], [2340, 410], [2510, 760], [2290, 1110]], cold: '#c5d7e0', hot: '#8b9c8a' },
        { points: [[2340, 410], [2640, 350], [2870, 570], [2730, 900], [2510, 760]], cold: '#d3e3e8', hot: '#a8af95' },
        { points: [[2870, 570], [3130, 770], [2970, 1100], [2730, 900]], cold: '#afc7d4', hot: '#788f86' },
        { points: [[2290, 1110], [2510, 760], [2730, 900], [2970, 1100], [2620, 1240]], cold: '#b6ced9', hot: '#7f9485' },
        { points: [[2100, 615], [2340, 410], [2510, 760], [2290, 700]], cold: '#eff5f4', hot: '#bbc3a7' },
        { points: [[2340, 410], [2640, 350], [2530, 520], [2510, 760]], cold: '#e4eff0', hot: '#929f92' },
        { points: [[2640, 350], [2870, 570], [2730, 900], [2530, 520]], cold: '#eaf2f0', hot: '#b3bba1' }
      ];
      for (const facet of facets) polygon(ctx, facet.points, warm ? facet.hot : facet.cold);
      polygon(ctx, [[2300, 965], [2630, 978], [2670, 1150], [2445, 1230], [2290, 1110]], warm ? '#6f837f' : '#99b6c7');
      polygon(ctx, [[2300, 965], [2455, 995], [2445, 1230], [2290, 1110]], warm ? '#8d9b89' : '#bbd0db');
      for (const points of [[[2220, 630], [2330, 715], [2310, 840]], [[2760, 655], [2810, 795], [2730, 920]], [[2340, 1040], [2380, 1090], [2360, 1140]]]) {
        line(ctx, points, warm ? '#6e857a' : '#afc8d4', 4);
      }
      // A frozen cascade becomes a blue waterfall below the high plateau.
      ellipse(ctx, 2470, 1250, 96, 40, warm ? '#649dad' : '#b3d2df');
      ellipse(ctx, 2470, 1250, 74, 27, warm ? '#7fc0cc' : '#c5dfe7');
      polygon(ctx, [[2437, 995], [2490, 1000], [2484, 1100], [2510, 1218], [2452, 1250], [2429, 1134]], warm ? '#71b4ce' : '#c4e3ea');
      polygon(ctx, [[2451, 999], [2471, 1001], [2468, 1107], [2484, 1222], [2460, 1236], [2444, 1128]], warm ? '#c2e8ee' : '#e4f4f5');
      for (let i = 0; i < 6; i++) line(ctx, [[2440 + i * 9, 1038], [2434 + i * 10, 1110], [2455 + i * 8, 1210]], warm ? 'rgba(219,245,236,.6)' : '#f0f8f7', 2);
      for (let i = 0; i < 4; i++) {
        ctx.beginPath(); ctx.ellipse(2470, 1250, 25 + i * 17, 7 + i * 5, 0, 0, TAU);
        ctx.strokeStyle = warm ? '#c2ddd0' : '#dfedf0'; ctx.lineWidth = 2; ctx.stroke();
      }
    }

    paintRiver(ctx, warm) {
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      this.riverPath(ctx); ctx.strokeStyle = warm ? '#91b28f' : '#cbdee5'; ctx.lineWidth = 160; ctx.stroke();
      this.riverPath(ctx); ctx.strokeStyle = warm ? '#4d91aa' : '#a5c7d7'; ctx.lineWidth = 107; ctx.stroke();
      this.riverPath(ctx); ctx.strokeStyle = warm ? '#64b2c9' : '#bcd8e3'; ctx.lineWidth = 82; ctx.stroke();
      this.riverPath(ctx); ctx.strokeStyle = warm ? '#8acdd6' : '#cbe2e9'; ctx.lineWidth = 32; ctx.stroke();
      for (let i = 0; i < 19; i++) {
        const segment = i % (this.world.riverPoints.length - 1), t = (i * .37) % 1;
        const a = this.world.riverPoints[segment], b = this.world.riverPoints[segment + 1];
        const x = mix(a[0], b[0], t), y = mix(a[1], b[1], t);
        if (warm) {
          line(ctx, [[x - 20, y], [x - 6, y + 3], [x + 12, y]], '#ddf3f1', 2);
          line(ctx, [[x + 35, y - 16], [x + 44, y - 10]], '#bad3ba', 2);
        } else {
          line(ctx, [[x - 20, y - 23], [x + 6, y], [x - 8, y + 29]], '#edf6f6', 2);
          line(ctx, [[x + 6, y], [x + 28, y - 12]], '#e3f0f3', 1.7);
        }
      }
    }

    paintBridge(ctx, x, y, warm) {
      polygon(ctx, [[x - 93, y - 19], [x + 93, y - 19], [x + 93, y + 24], [x - 93, y + 24]], '#6f8990');
      polygon(ctx, [[x - 93, y - 26], [x + 93, y - 26], [x + 93, y + 12], [x - 93, y + 12]], warm ? '#ae9970' : '#b3b9a8');
      for (let i = 0; i < 12; i++) line(ctx, [[x - 88 + i * 16, y - 24], [x - 88 + i * 16, y + 10]], warm ? '#847c5d' : '#8e9f98', 2);
      for (const side of [-27, 12]) {
        line(ctx, [[x - 94, y + side - 16], [x + 94, y + side - 16]], warm ? '#907e5b' : '#dce6df', 5);
        for (const xx of [-92, -30, 30, 92]) line(ctx, [[x + xx, y + side], [x + xx, y + side - 24]], '#8b8970', 5);
      }
    }

    updateWarmTerrain() {
      const sources = this.engine.heatSources?.() || [];
      const key = sources.map(source => `${source.x},${source.y},${source.r}`).join('|');
      if (key === this.heatKey) return;
      this.heatKey = key;
      const ctx = this.warmLayer.getContext('2d');
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, this.warmLayer.width, this.warmLayer.height);
      if (!sources.length) return;
      ctx.drawImage(this.terrainWarm, 0, 0);
      ctx.globalCompositeOperation = 'destination-in';
      ctx.fillStyle = '#fff'; ctx.beginPath();
      for (const source of sources) {
        const x = source.x * this.cacheScale, y = source.y * this.cacheScale, r = source.r * this.cacheScale;
        ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, TAU);
      }
      ctx.filter = 'blur(5px)'; ctx.fill(); ctx.filter = 'none';
      ctx.globalCompositeOperation = 'source-over';
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
      this.updateWarmTerrain();
      ctx.drawImage(this.terrainCold, 0, 0, this.world.width, this.world.height);
      ctx.drawImage(this.warmLayer, 0, 0, this.world.width, this.world.height);
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
      if (this.overview) this.drawOverview(ctx, state);
      else this.drawMinimap(ctx, state);
    }

    worldTransform(ctx) {
      ctx.translate(this.width / 2 - this.camera.x * this.camera.scale, this.height * .54 - this.camera.y * this.camera.scale * GROUND_Y);
      ctx.scale(this.camera.scale, this.camera.scale * GROUND_Y);
    }

    drawWarmth(ctx, state, time) {
      const sources = this.engine.heatSources?.() || [];
      for (const source of sources) {
        const r = Math.min(source.r, 460);
        const glow = ctx.createRadialGradient(source.x, source.y, 8, source.x, source.y, r);
        glow.addColorStop(0, 'rgba(239,199,112,.16)'); glow.addColorStop(1, 'rgba(239,199,112,0)');
        ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(source.x, source.y, r, 0, TAU); ctx.fill();
      }
      // Animated water only appears inside the actual warm mask.
      for (let i = 0; i < 24; i++) {
        const segment = i % (this.world.riverPoints.length - 1);
        const a = this.world.riverPoints[segment], b = this.world.riverPoints[segment + 1];
        const amount = (i * .19 + time * .025) % 1;
        const x = mix(a[0], b[0], amount) + Math.sin(i * 2.3) * 17;
        const y = mix(a[1], b[1], amount);
        if (!this.engine.warmAt(x, y)) continue;
        line(ctx, [[x - 9, y], [x + 7, y + 1]], 'rgba(224,244,230,.6)', 2);
      }
      if (this.engine.warmAt(2470, 1120)) {
        for (let i = 0; i < 8; i++) {
          const y = 1020 + ((time * 80 + i * 29) % 195);
          const x = 2444 + i % 4 * 11 + (y - 1050) * .08;
          line(ctx, [[x, y], [x + 1, y + 15]], 'rgba(231,248,238,.66)', 2);
        }
      }
      ctx.textAlign = 'center'; ctx.font = '600 17px system-ui, sans-serif';
      for (const [key, x, y] of [['river', 630, 885], ['mountain', 2510, 530], ['plain', 1830, 2050]]) {
        ctx.fillStyle = this.engine.warmAt(x, y) ? '#697d61' : '#90a8b1';
        ctx.fillText(this.world.regionNames[key], x, y);
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
      const snowy = !this.engine.warmAt(node.x, node.y);
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
        if (snowy) {
          polygon(ctx, [[-w * .73, y - h * .17], [0, y - h], [w * .72, y - h * .18], [w * .32, y - h * .22], [w * .08, y - h * .11], [-w * .19, y - h * .24]], '#edf5f3');
          polygon(ctx, [[0, y - h], [w * .72, y - h * .18], [w * .14, y - h * .27]], '#d1e3e9');
        }
      }
      if (node.hit > 0) { line(ctx, [[-24, -36], [-39, -42]], '#f5d391', 3); line(ctx, [[28, -36], [39, -45]], '#f5d391', 2); }
      ctx.restore();
    }

    drawOre(ctx, node) {
      this.shadow(ctx, 25, 9);
      polygon(ctx, [[-29, -3], [-22, -25], [-5, -36], [18, -30], [30, -9], [18, 4], [-12, 7]], '#839fae', '#6d8a9c', 1.3);
      polygon(ctx, [[-22, -25], [-5, -36], [18, -30], [5, -11], [-10, -6]], '#c6dbe1');
      polygon(ctx, [[5, -11], [18, -30], [30, -9], [18, 4]], '#6b8d9f');
      if (!this.engine.warmAt(node.x, node.y)) polygon(ctx, [[-22, -25], [-5, -36], [18, -30], [13, -25], [-3, -29], [-14, -20]], '#eef5f3');
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
      if (!this.engine.warmAt(camp.x, camp.y)) polygon(ctx, [[-9, -61], [-19, -42], [1, -45], [11, -30], [19, -38], [20, -51]], '#e4eeea');
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
      const frozen = !worker && person.frozen;
      const moving = Boolean(person.moving) && !frozen;
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
      if ((person.bag?.wood || 0) > 0) {
        const logs = Math.min(3, Math.ceil(person.bag.wood / 4));
        for (let i = 0; i < logs; i++) {
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
      if (!worker || person.task === 'chop' || person.swing > 0) {
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
      if (worker) {
        const labels = { seek: '寻找林木', walk: '前往伐木', chop: '伐木', return: '运回', unload: '卸货' };
        const task = labels[person.task] || '待命';
        const carried = (person.bag?.wood || 0) + (person.bag?.ore || 0);
        const label = carried ? `${task} · ${carried}` : task;
        ctx.font = '10px system-ui, sans-serif'; ctx.textAlign = 'center';
        const width = ctx.measureText(label).width + 12;
        ctx.fillStyle = 'rgba(50,76,71,.7)'; ctx.beginPath(); ctx.roundRect(-width / 2, -80, width, 18, 5); ctx.fill();
        ctx.fillStyle = '#f2e3b5'; ctx.fillText(label, 0, -67);
      }
      if (frozen) this.drawFrozenPlayer(ctx, time);
    }

    drawFrozenPlayer(ctx, time) {
      const glow = ctx.createRadialGradient(0, -27, 6, 0, -27, 62);
      glow.addColorStop(0, 'rgba(126,204,239,.35)'); glow.addColorStop(1, 'rgba(126,204,239,0)');
      ctx.fillStyle = glow; ctx.fillRect(-65, -95, 130, 125);
      polygon(ctx, [[-23, 9], [-29, -28], [-15, -66], [1, -81], [24, -55], [30, -16], [20, 10], [0, 17]], 'rgba(155,219,242,.38)', '#d4f0f8', 2);
      polygon(ctx, [[-29, -28], [1, -81], [-1, -21], [-23, 9]], 'rgba(213,246,255,.19)');
      polygon(ctx, [[1, -81], [24, -55], [30, -16], [-1, -21]], 'rgba(117,195,230,.23)');
      line(ctx, [[1, -81], [-1, -21], [0, 17]], '#d7f5fc', 1.4);
      line(ctx, [[-29, -28], [-1, -21], [30, -16]], '#bfeaf6', 1.2);
      for (let i = 0; i < 4; i++) {
        const a = time * .6 + i * TAU / 4;
        const x = Math.cos(a) * 37, y = -25 + Math.sin(a) * 27;
        polygon(ctx, [[x, y - 5], [x + 3, y], [x, y + 5], [x - 3, y]], '#e5f7fa');
      }
      ctx.font = '600 11px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#e9f8fc';
      ctx.strokeStyle = '#577c96'; ctx.lineWidth = 3; ctx.strokeText('冻僵了', 0, -91); ctx.fillText('冻僵了', 0, -91);
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
        if (effect.type === 'transfer' && Number.isFinite(effect.targetX) && Number.isFinite(effect.targetY)) {
          const start = this.point(effect.x, effect.y), end = this.point(effect.targetX, effect.targetY);
          const progress = 1 - clamp(effect.life / (effect.maxLife || 1), 0, 1);
          const count = Math.min(9, Math.max(3, (effect.wood || 0) + (effect.ore || 0)));
          for (let i = 0; i < count; i++) {
            const t = clamp(progress * 1.3 - i * .04, 0, 1);
            const x = mix(start.x, end.x, t), y = mix(start.y - 24, end.y - 13, t) - Math.sin(t * Math.PI) * (28 + i * 3);
            const hasOre = (effect.ore || 0) > 0;
            const ore = hasOre && ((effect.wood || 0) === 0 || i % 3 === 0);
            polygon(ctx, [[x - 4, y - 2], [x, y - 5], [x + 5, y], [x + 2, y + 4], [x - 4, y + 3]], ore ? '#b8dce6' : '#d6b481', ore ? '#779eaf' : '#9b7b54', 1);
          }
          continue;
        }
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
        const cold = clamp((30 - state.player.temp) / 30, 0, 1);
        const edge = 35 + cold * 72;
        for (const [x0, y0, x1, y1, rect] of [
          [0, 0, edge, 0, [0, 0, edge, this.height]],
          [this.width, 0, this.width - edge, 0, [this.width - edge, 0, edge, this.height]],
          [0, 0, 0, edge, [0, 0, this.width, edge]],
          [0, this.height, 0, this.height - edge, [0, this.height - edge, this.width, edge]]
        ]) {
          const frost = ctx.createLinearGradient(x0, y0, x1, y1);
          frost.addColorStop(0, `rgba(204,239,251,${.12 + cold * .48})`); frost.addColorStop(1, 'rgba(204,239,251,0)');
          ctx.fillStyle = frost; ctx.fillRect(...rect);
        }
        for (let i = 0; i < 16; i++) {
          const x = i / 15 * this.width;
          const depth = (10 + (i * 19 % 33)) * cold;
          polygon(ctx, [[x - 12, 0], [x + 8, 0], [x + 3, depth]], 'rgba(224,249,255,.35)');
          polygon(ctx, [[x - 8, this.height], [x + 12, this.height], [x - 2, this.height - depth]], 'rgba(224,249,255,.3)');
        }
      }
    }

    canvasPoint(clientX, clientY) {
      const rect = this.canvas.getBoundingClientRect();
      return { x: (clientX - rect.left) * this.width / (rect.width || this.width),
        y: (clientY - rect.top) * this.height / (rect.height || this.height) };
    }

    overviewBounds() {
      const availableWidth = Math.max(100, this.width - (this.width < 640 ? 32 : 100));
      const availableHeight = Math.max(80, this.height - 295);
      const width = Math.min(availableWidth, availableHeight * this.world.width / this.world.height);
      const height = width * this.world.height / this.world.width;
      return { x: (this.width - width) / 2, y: 145 + (availableHeight - height) / 2, width, height };
    }

    minimapHit(clientX, clientY) {
      if (this.overview || !this.minimapRect) return false;
      const point = this.canvasPoint(clientX, clientY), rect = this.minimapRect;
      return point.x >= rect.x && point.y >= rect.y && point.x <= rect.x + rect.width && point.y <= rect.y + rect.height;
    }

    mapPoint(clientX, clientY) {
      if (!this.overview) return null;
      const point = this.canvasPoint(clientX, clientY), rect = this.overviewBounds();
      if (point.x < rect.x || point.y < rect.y || point.x > rect.x + rect.width || point.y > rect.y + rect.height) return null;
      return this.world.clampPoint({ x: (point.x - rect.x) / rect.width * this.world.width,
        y: (point.y - rect.y) / rect.height * this.world.height });
    }

    drawMapCore(ctx, rect, state, detailed) {
      const map = (x, y) => ({ x: rect.x + x / this.world.width * rect.width, y: rect.y + y / this.world.height * rect.height });
      ctx.save(); ctx.beginPath(); ctx.roundRect(rect.x, rect.y, rect.width, rect.height, detailed ? 12 : 9); ctx.clip();
      ctx.drawImage(this.terrainCold, rect.x, rect.y, rect.width, rect.height);
      ctx.drawImage(this.warmLayer, rect.x, rect.y, rect.width, rect.height);
      if (detailed) {
        for (const node of state.nodes || []) {
          if (!node.amount) continue;
          const p = map(node.x, node.y);
          if (node.type === 'tree') polygon(ctx, [[p.x, p.y - 3], [p.x + 2, p.y + 1], [p.x - 2, p.y + 1]], '#527b70');
          else ellipse(ctx, p.x, p.y, 1.8, 1.4, '#7e939b');
        }
      }
      for (const entity of [state.furnace, ...(state.towers || [])].filter(Boolean)) {
        const p = map(entity.x, entity.y);
        const active = entity.kind === 'furnace' ? entity.fuel > 0 && entity.hp > 0 : entity.built && entity.hp > 0;
        const radius = detailed ? 6 : 3.5;
        ellipse(ctx, p.x, p.y, radius + 2, radius + 2, 'rgba(42,66,72,.35)');
        polygon(ctx, [[p.x, p.y - radius], [p.x + radius * .7, p.y], [p.x, p.y + radius], [p.x - radius * .7, p.y]], active ? '#ffda92' : '#e1eceb', '#57767c', 1);
        if (detailed) {
          const name = entity.kind === 'furnace' ? '中央营地' : entity.name;
          const label = name + (entity.kind === 'tower' && !active ? ' · 未供暖' : '');
          ctx.font = `600 ${this.width < 640 ? 10 : 12}px system-ui, sans-serif`; ctx.textAlign = 'center';
          const textWidth = ctx.measureText(label).width;
          ctx.fillStyle = 'rgba(36,62,70,.8)'; ctx.beginPath(); ctx.roundRect(p.x - textWidth / 2 - 6, p.y + 10, textWidth + 12, 20, 5); ctx.fill();
          ctx.fillStyle = active ? '#ffe4ad' : '#e5efed'; ctx.fillText(label, p.x, p.y + 24);
        }
      }
      for (const worker of state.workers || []) {
        const p = map(worker.x, worker.y); ellipse(ctx, p.x, p.y, detailed ? 2.5 : 1.4, detailed ? 2.5 : 1.4, '#bd9053');
      }
      for (const enemy of state.enemies || []) {
        const p = map(enemy.x, enemy.y);
        let r = detailed ? 2.4 : 1.5;
        if (enemy.type === 'boss') r = 4;
        ellipse(ctx, p.x, p.y, r, r, '#a65450');
      }
      const p = map(state.player.x, state.player.y);
      ellipse(ctx, p.x, p.y, detailed ? 6 : 4, detailed ? 6 : 4, '#faf1d4');
      ellipse(ctx, p.x, p.y, detailed ? 3 : 2, detailed ? 3 : 2, state.player.frozen ? '#7cb7d0' : '#b76250');
      const facing = state.player.face || { x: 0, y: 1 };
      line(ctx, [[p.x, p.y], [p.x + facing.x * (detailed ? 10 : 5), p.y + facing.y * (detailed ? 10 : 5)]], '#faf1d4', 1.7);
      ctx.restore();
    }

    drawOverview(ctx, state) {
      this.minimapRect = null;
      const rect = this.overviewBounds();
      ctx.fillStyle = 'rgba(25,49,63,.82)'; ctx.fillRect(0, 0, this.width, this.height);
      ctx.save();
      ctx.fillStyle = '#e0e9e2'; ctx.beginPath(); ctx.roundRect(rect.x - 7, rect.y - 7, rect.width + 14, rect.height + 14, 17); ctx.fill();
      this.drawMapCore(ctx, rect, state, true);
      ctx.font = '600 12px system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.fillStyle = '#3b606a';
      ctx.fillText('雪原全图', rect.x + 13, rect.y + 23);
      ctx.textAlign = 'right'; ctx.fillText('N ↑', rect.x + rect.width - 13, rect.y + 23);
      ctx.font = '11px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#d9e7e5';
      ctx.fillText('暖区逐步解冻 · ◇ 供热塔 · 红点为入侵者', this.width / 2, rect.y + rect.height + 27);
      ctx.restore();
    }

    drawMinimap(ctx, state) {
      this.minimapRect = null;
      const compact = this.width < 640;
      if (compact && this.height < 550) return;
      let size = 132;
      let top = this.height - size - 112;
      if (compact) {
        size = 100;
        if (this.height < 640) size = 64;
        else if (this.height < 720) size = 84;
        top = this.height < 640 ? 266 : 294;
      }
      const left = this.width - size - 18;
      if (top < 150) return;
      this.minimapRect = { x: left - 6, y: top - 6, width: size + 12, height: size + 12 };
      ctx.save();
      ctx.fillStyle = 'rgba(30,54,65,.78)'; ctx.beginPath(); ctx.roundRect(left - 6, top - 6, size + 12, size + 12, 15); ctx.fill();
      ctx.strokeStyle = 'rgba(222,236,230,.3)'; ctx.lineWidth = 1; ctx.stroke();
      const mapHeight = size * this.world.height / this.world.width;
      this.drawMapCore(ctx, { x: left, y: top + (size - mapHeight) / 2, width: size, height: mapHeight }, state, false);
      ctx.font = '9px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#e2ece4';
      ctx.fillText('展开地图 ↗', left + size / 2, top + size + 1);
      ctx.restore();
    }

  }
  window.WinterRenderer = WinterRenderer;
})();
