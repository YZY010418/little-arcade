import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../site');
const gamesOnly = process.argv.includes('--games-only');
const errors = [];
let checkedAssets = 0;

function check(condition, message) {
  if (!condition) errors.push(message);
}

function requireFile(relative) {
  const file = path.resolve(root, relative);
  check(fs.existsSync(file) && fs.statSync(file).isFile(), `Missing file: ${relative}`);
  return file;
}

function checkReference(from, value) {
  if (!value || /^(?:[a-z]+:|#|\/\/)/i.test(value)) return;
  check(!value.startsWith('/'), `Root-relative URL breaks project Pages: ${path.relative(root, from)} → ${value}`);
  if (value.startsWith('/')) return;
  const clean = decodeURIComponent(value.split(/[?#]/)[0]);
  if (!clean) return;
  let target = path.resolve(path.dirname(from), clean);
  check(target === root || target.startsWith(root + path.sep), `Asset escapes site: ${value}`);
  if (fs.existsSync(target) && fs.statSync(target).isDirectory()) target = path.join(target, 'index.html');
  check(fs.existsSync(target), `Broken local URL: ${path.relative(root, from)} → ${value}`);
  checkedAssets++;
}

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const name = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(name) : [name];
  });
}

const sourceRoot = gamesOnly ? path.join(root, 'games') : root;
for (const file of walk(sourceRoot)) {
  if (!/\.(html|css)$/.test(file)) continue;
  const source = fs.readFileSync(file, 'utf8');
  if (file.endsWith('.html')) {
    for (const tag of source.matchAll(/<(?:a|link|script|img|iframe|audio|video|source)\b[^>]*>/gi)) {
      for (const attr of tag[0].matchAll(/\s(?:src|href)\s*=\s*(['"])(.*?)\1/gi)) checkReference(file, attr[2]);
    }
  }
  for (const url of source.matchAll(/url\(\s*(['"]?)(.*?)\1\s*\)/gi)) checkReference(file, url[2]);
}

const paper = 'games/paper-survivor';
const tower = 'games/magic-tower';
for (const entry of [`${paper}/index.html`, `${paper}/game.js`, `${tower}/index.html`, `${tower}/game/index.html`]) requireFile(entry);
if (!gamesOnly) for (const entry of ['index.html', 'play.html', 'player.css', 'player.js']) requireFile(entry);

const engine = path.join(root, tower, 'game');
const dataSource = fs.readFileSync(path.join(engine, 'project/data.js'), 'utf8');
const data = JSON.parse(dataSource.slice(dataSource.indexOf('=') + 1));
check(data.main.floorIds.length === 51, 'Expected floors MT0 through MT50.');
const context = vm.createContext({ main: { floors: {} } });
vm.runInContext(fs.readFileSync(path.join(engine, '__all_floors__.js'), 'utf8'), context, { timeout: 1000 });
for (let i = 0; i <= 50; i++) {
  const id = `MT${i}`;
  check(data.main.floorIds[i] === id, `Incorrect floor order at ${i}`);
  const singleSource = fs.readFileSync(requireFile(`${tower}/game/project/floors/${id}.js`), 'utf8');
  const single = JSON.parse(singleSource.slice(singleSource.indexOf('=') + 1));
  const bundled = JSON.parse(JSON.stringify(context.main.floors[id]));
  assert.deepEqual(bundled, single, `Bundled floor differs from ${id}.js`);
  check(single.map.length === 13 && single.map.every(row => row.length === 13), `${id} must contain a complete 13 × 13 map.`);
}

for (const [folder, names, extension] of [
  ['images', data.main.images, ''], ['tilesets', data.main.tilesets, ''],
  ['bgms', data.main.bgms, ''], ['sounds', data.main.sounds, ''],
  ['animates', data.main.animates, '.animate'],
  ['materials', ['animates', 'enemys', 'items', 'npcs', 'terrains', 'enemy48', 'npc48', 'icons', 'ground', 'fog', 'cloud', 'sun', 'keyboard'], '.png'],
  ['autotiles', ['autotile', 'autotile1', 'autotile2', 'autotile3'], '.png']
]) {
  for (const name of names) requireFile(`${tower}/game/project/${folder}/${name}${extension}`);
}
for (const name of ['loader', 'control', 'utils', 'items', 'icons', 'maps', 'enemys', 'events', 'actions', 'data', 'ui', 'extensions', 'core']) requireFile(`${tower}/game/libs/${name}.js`);
for (const name of ['data', 'enemys', 'icons', 'maps', 'items', 'functions', 'events', 'plugins']) requireFile(`${tower}/game/project/${name}.js`);
const bundledAnimations = fs.readFileSync(requireFile(`${tower}/game/__all_animates__`), 'utf8').split('@@@~~~###~~~@@@');
data.main.animates.forEach((name, index) => {
  const individual = JSON.parse(fs.readFileSync(path.join(engine, 'project/animates', `${name}.animate`), 'utf8'));
  assert.deepEqual(JSON.parse(bundledAnimations[index]), individual, `Bundled animation differs from ${name}.animate`);
});
requireFile(`${tower}/game/SOURCES.txt`);
requireFile(`${tower}/game/LICENSE-engine.md`);

if (errors.length) {
  console.error(errors.map(error => `FAIL ${error}`).join('\n'));
  process.exitCode = 1;
} else {
  console.log(`PASS ${gamesOnly ? 'Game packages' : 'Site'}: ${checkedAssets} relative references, 51 matching complete floors, all declared engine assets and entry points.`);
  console.log('Static checks only; browser interaction, audio shutdown, and responsive layout require separate runtime verification.');
}
