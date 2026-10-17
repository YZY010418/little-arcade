/* Browser presentation adapter. The original floor scripts own all game rules. */
(function () {
  'use strict';
  let ready = false;
  let lastState = '';
  let lastSaved = '';
  let saving = false;
  let lastFloor = '';
  const CONTINUE_KEY = 'expeditionContinue';

  function notify(type, data) {
    if (parent !== window) parent.postMessage({ source: 'magic-tower', type, data }, location.origin);
  }

  function cleanText(text) {
    return String(text || '').replace(/\\[trficdgz]\[[^\]]*\]/g, '').replace(/[\t\r]/g, '').replace(/\\[a-z]/gi, '').trim();
  }

  function log(text, kind) {
    const message = cleanText(text);
    if (message) notify('log', { text: message, kind: kind || 'event' });
  }

  function resizeBoard() {
    const size = Math.min(window.innerWidth, window.innerHeight);
    core.domStyle.scale = size / core.__PIXELS__;
    core.domStyle.isVertical = false;
    core.domStyle.availableScale = [core.domStyle.scale];
    Object.assign(core.dom.gameGroup.style, {
      width: size + 'px', height: size + 'px', left: '0px', top: '0px'
    });
    core.control._resize_canvas({ CANVAS_WIDTH: core.__PIXELS__, statusBarHeightInVertical: 0, border: '0px none' });
    Object.assign(core.dom.gameDraw.style, { left: '0px', top: '0px', right: 'auto' });
    core.dom.startPanel.style.fontSize = 16 * Math.min(1.4, core.domStyle.scale) + 'px';
    if (!core.status.automaticRoute) core.status.automaticRoute = {};
    core.control.setViewport(32, 32);
    core.updateStatusBar();
  }

  function publishState() {
    if (!ready) return;
    const h = core.status.hero || core.firstData.hero;
    const playing = !!core.isPlaying();
    const constants = h.items?.constants || {};
    const tools = h.items?.tools || {};
    const state = {
      playing, floor: core.status.floorId || 'MT1', hp: h.hp, atk: h.atk, def: h.def,
      money: h.money, steps: h.steps || 0, yellowKey: tools.yellowKey || 0,
      blueKey: tools.blueKey || 0, redKey: tools.redKey || 0,
      book: !!constants.book, fly: !!h.flags?.fly,
      busy: !!core.status.lockControl, sound: !!core.musicStatus.bgmStatus,
      weapon: core.material.items[h.flags?.nowWeapon]?.name || '无',
      shield: core.material.items[h.flags?.nowShield]?.name || '无',
      gameOver: !!core.status.gameOver
    };
    const serialized = JSON.stringify(state);
    if (serialized !== lastState) {
      lastState = serialized;
      notify('state', state);
    }
    if (playing && state.floor !== lastFloor) {
      lastFloor = state.floor;
      log(core.floors[state.floor]?.title || '进入魔塔', 'floor');
    }
  }

  function saveContinue() {
    if (!ready || !core.isPlaying() || core.status.lockControl || core.isMoving() || core.status.gameOver || saving) return;
    const route = core.status.route || [];
    const signature = JSON.stringify([core.status.floorId, core.status.hero, route.length]);
    if (signature === lastSaved) return;
    saving = true;
    core.setLocalForage(CONTINUE_KEY, core.saveData(), function () {
      saving = false;
      lastSaved = signature;
      notify('saved', { time: Date.now() });
      notify('resume', { available: true });
    }, function () {
      saving = false;
      notify('save-error', {});
    });
  }

  function continueGame() {
    core.getLocalForage(CONTINUE_KEY, null, function (data) {
      if (!data) return log('还没有续玩存档，点击「开始远征」启程。');
      core.dom.startPanel.style.display = 'none';
      core.loadData(data, function () {
        resizeBoard();
        publishState();
        log('已回到上次离开的地方。', 'save');
      });
    });
  }

  function input(code, phase) {
    if (!ready || (!core.isPlaying() && !core.status.lockControl)) return;
    const mapped = ({ 87: 38, 65: 37, 83: 40, 68: 39, 66: 88, 70: 71 })[code] || code;
    const event = { keyCode: mapped, altKey: false, ctrlKey: false, preventDefault() {}, stopPropagation() {} };
    if (phase === 'down') core.onkeyDown(event);
    else core.onkeyUp(event);
  }

  function command(action) {
    if (!ready) return;
    if (action === 'start') {
      lastSaved = '';
      lastFloor = '';
      core.events.startGame('');
      return;
    }
    if (action === 'continue') return continueGame();
    if (action === 'sound') {
      core.triggerBgm();
      core.musicStatus.soundStatus = core.musicStatus.bgmStatus;
      core.setLocalStorage('bgmStatus', core.musicStatus.bgmStatus);
      core.setLocalStorage('soundStatus', core.musicStatus.soundStatus);
      publishState();
      return;
    }
    if (action === 'load' && !core.isPlaying()) {
      core.load(true);
      return;
    }
    if (!core.isPlaying()) return log('点击「开始远征」，踏入魔塔。');
    const actions = {
      book: function () { core.openBook(true); },
      fly: function () { core.useFly(true); },
      toolbox: function () { core.openToolbox(true); },
      save: function () { core.save(true); },
      load: function () { core.load(true); },
      settings: function () { core.openSettings(true); }
    };
    if (actions[action]) actions[action]();
    publishState();
  }

  window.initTowerBridge = function () {
    // Keep the original battle/event engine, with a board-only viewport.
    core.control.resize = resizeBoard;
    core.data.flags.leftHandPrefer = true;
    core.flags.leftHandPrefer = true;
    core.events._startGame_upload = function () {};
    core.events._gameOver_confirmUpload = function (ending) {
      core.drawText(ending ? '远征结束。你的冒险记录已保留在此浏览器中。' : '远征暂告一段落。可以读取存档，再次挑战。', core.restart);
    };
    // This standalone edition stores progress on this device only.
    core.control.syncSave = core.control.syncLoad = function () {
      core.drawText('此版本使用浏览器本地存档。请使用存档和读档面板管理进度。');
    };
    core.ui._drawSyncSave = function () {
      core.drawText('本地存档保存在当前浏览器中。可在存档面板保存多个路线分支。清除浏览器数据会删除进度。');
    };
    // Keep the original menu positions while replacing server-only destinations.
    core.ui._drawGameInfo = function () {
      core.status.event.id = 'gameInfo';
      core.ui.drawChoices(null, ['数据统计', '来源说明', '合集说明', '操作帮助', '关于游戏', '存档说明', '返回主菜单']);
    };
    core.actions._clickGameInfo_openProject = function () {
      core.drawText('关卡与剧情基于三原塔翻新小组的 50 层魔塔复刻；引擎为 ckcz123 / mota-js（BSD-3-Clause）。完整来源可在页面上方「玩法指南」中查看。');
    };
    core.actions._clickGameInfo_openComments = function () {
      core.drawText('这是游戏合集中的本地存档版本。使用页面顶部的「返回合集」切换游戏；返回后可从「继续上次冒险」恢复最近的自动存档。');
    };
    core.actions._clickGameInfo_download = function () {
      core.drawText('存档保存在当前浏览器中，不跨设备同步。探索时约每 1.2 秒在安全停步处保存续玩位置；离开前等待「进度已自动保存」，也可按 P 手动保存路线。');
    };
    const originalTip = core.ui.drawTip;
    core.ui.drawTip = function (text, id, frame) {
      log(core.replaceText(text));
      return originalTip.call(this, text, id, frame);
    };
    const originalTextBox = core.ui.drawTextBox;
    core.ui.drawTextBox = function (text, config) {
      log(core.replaceText(text), 'story');
      return originalTextBox.call(this, text, config);
    };

    // A real first-floor map provides the title screen backdrop.
    const coverCanvas = document.createElement('canvas');
    coverCanvas.width = coverCanvas.height = core.__PIXELS__;
    const coverContext = coverCanvas.getContext('2d');
    for (let y = 1; y <= 11; y++) {
      for (let x = 1; x <= 11; x++) {
        const tile = core.maps.blocksInfo[core.floors.MT1.map[y][x]];
        coverContext.drawImage(core.material.images.terrains, 0, core.material.icons.terrains.ground * 32, 32, 32, (x - 1) * 32, (y - 1) * 32, 32, 32);
        if (!tile) continue;
        const atlas = core.material.images[tile.cls];
        const index = core.material.icons[tile.cls]?.[tile.id];
        if (atlas && index !== undefined) coverContext.drawImage(atlas, 0, index * 32, 32, 32, (x - 1) * 32, (y - 1) * 32, 32, 32);
      }
    }
    const intro = document.createElement('div');
    intro.id = 'expedition-intro';
    intro.innerHTML = '<div class="intro-map"></div><div class="intro-shade"></div><div class="intro-copy"><span class="intro-kicker">A CLASSIC ADVENTURE</span><img src="../asset/PLAYER1.png" alt="勇士"><h1>五十层的远征</h1><p>一把剑，一座塔，一个等待揭晓的秘密。<br>每一步选择，都将改变你的命运。</p><button id="begin-expedition">开始远征 <span>→</span></button><button id="resume-expedition">继续上次冒险</button><small>方向键 / WASD 移动 · 点击地图自动寻路</small></div>';
    intro.querySelector('.intro-map').style.backgroundImage = 'url(' + coverCanvas.toDataURL() + ')';
    main.dom.startPanel.append(intro);
    intro.querySelector('#begin-expedition').onclick = function () { command('start'); };
    intro.querySelector('#resume-expedition').onclick = continueGame;
    core.getLocalForage(CONTINUE_KEY, null, function (data) {
      intro.querySelector('#resume-expedition').hidden = !data;
      notify('resume', { available: !!data });
    });
    document.body.addEventListener('keydown', function (e) {
      if (e.ctrlKey || e.metaKey || /INPUT|TEXTAREA/.test(e.target.tagName)) return;
      if ([80,76].includes(e.keyCode)) { e.preventDefault(); e.stopImmediatePropagation(); return; }
      if ([87,65,83,68,66,70].includes(e.keyCode)) {
        e.preventDefault(); e.stopImmediatePropagation(); input(e.keyCode, 'down');
      }
    }, true);
    document.body.addEventListener('keyup', function (e) {
      if (e.ctrlKey || e.metaKey || /INPUT|TEXTAREA/.test(e.target.tagName)) return;
      if ([80,76].includes(e.keyCode)) { e.preventDefault(); e.stopImmediatePropagation(); command(e.keyCode === 80 ? 'save' : 'load'); return; }
      if ([87,65,83,68,66,70].includes(e.keyCode)) {
        e.preventDefault(); e.stopImmediatePropagation(); input(e.keyCode, 'up');
      }
    }, true);
    function releaseMovement() {
      core.status.holdingKeys = [];
      core.status.ctrlDown = false;
      clearInterval(core.status._pressTimer);
      core.status._pressTimer = null;
    }
    window.addEventListener('blur', releaseMovement);
    document.addEventListener('visibilitychange', function () { if (document.hidden) releaseMovement(); });
    window.TowerBridge = { command, input, releaseMovement };
    ready = true;
    resizeBoard();
    notify('ready', { floors: core.floorIds.length });
    publishState();
    setInterval(publishState, 200);
    setInterval(saveContinue, 1200);
    document.addEventListener('visibilitychange', saveContinue);
  };

  window.addEventListener('error', function (event) {
    notify('error', { message: event.message });
  });
})();
