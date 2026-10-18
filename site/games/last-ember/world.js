/* Shared geography keeps simulation, rendering, input and saves on one map. */
(function (root) {
  'use strict';
  const world = {
    width: 3400,
    height: 2800,
    center: { x: 1700, y: 1400 },
    bounds: { rx: 1400, ry: 1130 },
    FURNACE_RADII: [285, 425, 590],
    towerRadius: 850,
    towers: [
      { id: 'pine', name: '河谷供热塔', x: 800, y: 1050, biome: 'river' },
      { id: 'ridge', name: '山巅供热塔', x: 2560, y: 690, biome: 'mountain' },
      { id: 'lake', name: '原野供热塔', x: 1850, y: 2290, biome: 'plain' }
    ],
    riverPoints: [[680, 440], [790, 760], [750, 1100], [840, 1470], [730, 1840], [940, 2240]],
    mountain: { x: 2530, y: 720, rx: 600, ry: 390 },
    plain: { x: 1850, y: 2230, rx: 900, ry: 450 },
    regionNames: { hearth: '中央营地', river: '融冰河谷', mountain: '霜岩山巅', plain: '南风原野' }
  };
  function riverDistance(x, y) {
    let nearest = Infinity;
    for (let i = 1; i < world.riverPoints.length; i++) {
      const [ax, ay] = world.riverPoints[i - 1];
      const [bx, by] = world.riverPoints[i];
      const lengthSquared = (bx - ax) ** 2 + (by - ay) ** 2;
      const amount = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / lengthSquared));
      nearest = Math.min(nearest, Math.hypot(x - ax - (bx - ax) * amount, y - ay - (by - ay) * amount));
    }
    return nearest;
  }
  world.regionAt = function (x, y) {
    const mountain = world.mountain;
    if (Math.hypot((x - mountain.x) / mountain.rx, (y - mountain.y) / mountain.ry) < 1.1) return 'mountain';
    if (riverDistance(x, y) < 300) return 'river';
    const plain = world.plain;
    if (Math.hypot((x - plain.x) / plain.rx, (y - plain.y) / plain.ry) < 1.15) return 'plain';
    return 'hearth';
  };
  world.coldMultiplier = function (x, y) { return world.regionAt(x, y) === 'mountain' ? 1.3 : 1; };
  world.clampPoint = function (point) {
    const { center, bounds } = world;
    const radius = Math.hypot((point.x - center.x) / bounds.rx, (point.y - center.y) / bounds.ry);
    if (radius <= 1) return { x: point.x, y: point.y };
    return { x: center.x + (point.x - center.x) / radius, y: center.y + (point.y - center.y) / radius };
  };
  world.riverDistance = riverDistance;
  root.WinterWorld = world;
  if (typeof module !== 'undefined' && module.exports) module.exports = world;
})(typeof globalThis !== 'undefined' ? globalThis : this);
