'use strict';

const games = {
  'paper-survivor': {
    title: '纸上幸存者',
    edition: 'PAPER SURVIVOR',
    controls: '方向键 / WASD 移动，角色会自动攻击。手机可拖动摇杆。Esc 或 P 暂停；升级时选择新的技能。经典模式挑战首领，无尽模式持续迎接敌潮。',
    save: '成绩与成就会保存在本机。返回游戏库会结束当前一局；再次进入时可以开始新的冒险。'
  },
  'magic-tower': {
    title: '魔塔 · 50 层',
    edition: 'MAGIC TOWER',
    controls: '方向键 / WASD 移动，碰到怪物自动战斗。Enter / 空格继续对话。X 查看怪物手册，G 使用楼层传送，T 打开背包，P 存档，L 读档。道具需要先在塔中获得。',
    save: '魔塔会在探索的安全时刻自动保存续玩位置。重要路线选择前可手动存档；再次进入后选择「继续远征」即可续玩。'
  },
  'last-ember': {
    title: '最后一炉火',
    edition: 'LAST EMBER',
    controls: '方向键 / WASD、点击地图或触屏摇杆移动。靠近树木和矿石自动采集，靠近敌人自动攻击，回到炉旁自动卸货。按 E 与建筑互动，M 查看全图；升级防寒服保温，体温归零会冻住。探索河谷、山巅和原野，升级熔炉至 3 级并修复三塔后迎接最后的风暴。',
    save: '探索进度自动保存在当前浏览器。再次进入后选择「继续上次的远行」即可回到雪原。Esc 可暂停，装备按钮可查看与购买升级。'
  }
};

const gameId = new URLSearchParams(location.search).get('game');
const game = Object.hasOwn(games, gameId) ? games[gameId] : null;
const loading = document.getElementById('loading');
const help = document.getElementById('help-dialog');
const fullscreen = document.getElementById('fullscreen');
let frame;

if (game) {
  document.title = game.title + ' · 玩一会儿';
  document.getElementById('game-title').textContent = game.title;
  document.getElementById('game-edition').textContent = game.edition;
  document.getElementById('game-controls').textContent = game.controls;
  document.getElementById('game-save').textContent = game.save;
  frame = document.createElement('iframe');
  frame.id = 'active-game';
  frame.title = game.title;
  frame.allow = 'autoplay; fullscreen';
  frame.src = './games/' + gameId + '/';
  frame.addEventListener('load', function () { loading.hidden = true; });
  document.getElementById('player').append(frame);
} else {
  loading.hidden = true;
  document.getElementById('missing').hidden = false;
  document.getElementById('help').hidden = true;
}

document.getElementById('help').addEventListener('click', function () {
  help.returnValue = '';
  help.showModal();
});
help.addEventListener('click', function (event) {
  if (event.target !== help) return;
  const bounds = help.getBoundingClientRect();
  if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) help.close();
});
help.addEventListener('close', function () {
  if (help.returnValue === 'resume') frame?.contentWindow.focus();
});

if (document.fullscreenEnabled && game) fullscreen.hidden = false;
fullscreen.addEventListener('click', async function () {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch {
    fullscreen.textContent = '全屏暂不可用';
  }
});
document.addEventListener('fullscreenchange', function () {
  fullscreen.textContent = document.fullscreenElement ? '退出全屏 ⛶' : '全屏 ⛶';
});
