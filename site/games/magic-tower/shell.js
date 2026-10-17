(function () {
  'use strict';
  const frame = document.getElementById('game-frame');
  const modal = document.getElementById('modal-root');
  const toast = document.getElementById('app-toast');
  let state = { playing: false };
  let ready = false;
  let toastTimer;
  let lastLog = '';
  let focusBeforeModal;
  const held = new Set();
  const chapters = [
    ['命运的入口', '穿过最初的迷宫，寻找通往高处的阶梯。'],
    ['暗影与迷宫', '更强的敌人在等待。每一把钥匙，都要用在值得的地方。'],
    ['高塔的秘密', '听一听旅人的话。答案，也许就藏在看似寻常的墙后。'],
    ['骑士的试炼', '勇气之外，尚需智慧。剑与盾，将见证你的成长。'],
    ['最后的远征', '塔顶已在眼前。是救赎，还是更深的阴谋？']
  ];

  function setText(id, value) {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
  }

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toast.classList.remove('show'); }, 3600);
  }

  function bridge() { return frame.contentWindow?.TowerBridge; }

  function call(action) {
    if (!ready || !bridge()) return showToast('地图正在准备，请稍候…');
    bridge().command(action);
    if (action !== 'sound') frame.contentWindow.focus();
  }

  function addLog(entry) {
    if (entry.text === lastLog) return;
    lastLog = entry.text;
    const log = document.getElementById('adventure-log');
    const row = document.createElement('div');
    row.className = 'log-entry';
    const dot = document.createElement('span');
    dot.className = 'log-dot';
    const text = document.createElement('p');
    text.textContent = entry.text.length > 130 ? entry.text.slice(0, 130) + '…' : entry.text;
    text.title = entry.text;
    row.append(dot, text);
    log.prepend(row);
    while (log.children.length > 3) log.lastElementChild.remove();
    if (entry.kind === 'event' && state.playing) showToast(entry.text);
  }

  function renderState(next) {
    state = next;
    ['hp', 'atk', 'def', 'money', 'yellowKey', 'blueKey', 'redKey'].forEach(function (key) {
      setText('stat-' + key, new Intl.NumberFormat('zh-CN').format(next[key] || 0));
    });
    const floor = Number(next.floor.replace('MT', '')) || 0;
    const chapter = Math.max(0, Math.min(4, Math.floor((floor - 1) / 10)));
    setText('floor-number', String(floor).padStart(2, '0'));
    setText('floor-title', floor === 0 ? '魔塔 · 塔外' : '魔塔 · 第 ' + floor + ' 层');
    setText('floor-current', floor);
    document.getElementById('floor-progress').style.width = Math.max(0, floor * 2) + '%';
    setText('chapter-number', String(chapter + 1).padStart(2, '0'));
    setText('chapter-title', chapters[chapter][0]);
    setText('chapter-description', chapters[chapter][1]);
    document.querySelector('[data-action="start"] span').textContent = next.playing ? '重新开始' : '开始远征';
    document.querySelector('.map-live').lastChild.textContent = next.playing ? '探索中' : '等待启程';
    const sound = document.querySelector('[data-action="sound"]');
    sound.setAttribute('aria-pressed', String(next.sound));
    sound.title = next.sound ? '声音已开启，点击静音' : '声音已关闭，点击开启';
    sound.style.opacity = next.sound ? '1' : '.45';
    document.querySelector('[data-action="book"]').title = next.book ? '查看怪物属性与预计伤害' : '获得怪物手册后可查看';
    document.querySelector('[data-action="fly"]').title = next.fly ? '在楼梯旁使用楼层传送' : '在塔中找到楼层传送器后可使用';
  }

  function closeModal() {
    modal.replaceChildren();
    if (focusBeforeModal) focusBeforeModal.focus();
  }

  function showModal(title, html, confirmAction) {
    releaseKeys();
    bridge()?.releaseMovement();
    focusBeforeModal = document.activeElement;
    modal.innerHTML = '<div class="modal-overlay"><section class="modal-card" role="dialog" aria-modal="true" aria-labelledby="dialog-title"><div class="modal-header"><h2 id="dialog-title"></h2><button class="modal-close" aria-label="关闭">×</button></div><div class="modal-body"></div><div class="modal-actions"><button class="dialog-close">返回冒险</button></div></section></div>';
    setText('dialog-title', title);
    modal.querySelector('.modal-body').innerHTML = html;
    modal.querySelector('.modal-close').onclick = closeModal;
    modal.querySelector('.dialog-close').onclick = closeModal;
    modal.querySelector('.modal-overlay').onclick = function (e) { if (e.target === this) closeModal(); };
    if (confirmAction) {
      const button = document.createElement('button');
      button.textContent = '开始新的远征';
      button.onclick = function () { closeModal(); call(confirmAction); };
      modal.querySelector('.modal-actions').append(button);
    }
    modal.querySelector('.modal-close').focus();
  }

  function help() {
    showModal('勇者的行前指南', '<p>魔塔是一场关于路线与资源的冒险。战斗数值固定，先增强攻防，再挑战强敌。</p><dl><dt>移动与探索</dt><dd>方向键 / WASD 移动；点击地图自动寻路。手机可使用方向键。</dd><dt>对话与菜单</dt><dd>Enter、空格或点击继续；Esc 关闭界面。</dd><dt>战斗与开门</dt><dd>走向怪物自动战斗，走向门消耗对应颜色钥匙。无法破防或生命不足时会阻止战斗。</dd><dt>随身工具</dt><dd>X / B 怪物手册，G / F 楼层传送，T 道具背包。需要先在塔中获得相应物品。</dd><dt>存档与续玩</dt><dd>P 打开存档，L 打开读档。探索时自动保存续玩位置；手动存档可保留不同路线。进度仅在当前浏览器保存。</dd></dl><p class="credits">原作：渡部直（N.W） / Caravan Software。关卡与事件基于三原塔翻新小组的 50 层复刻；引擎：ckcz123 / mota-js（BSD-3-Clause）。本版本使用你提供的像素素材。<br><a href="./game/SOURCES.txt" target="_blank" rel="noopener">来源与说明 ↗</a></p>');
  }

  function action(name) {
    if (name === 'help') return help();
    if (name === 'start' && state.playing) {
      return showModal('重新开始远征', '<p>将从第 1 层重新开始。手动存档会保留，自动续玩位置会随新冒险更新。</p><p>如果想保留当前路线，请先点击「保存」。</p>', 'start');
    }
    call(name);
  }

  document.querySelectorAll('[data-action]').forEach(function (button) {
    button.addEventListener('click', function () { action(button.dataset.action); });
  });

  function sendKey(code, phase) {
    if (!ready || !bridge()) return;
    if (phase === 'down') held.add(code);
    else held.delete(code);
    bridge().input(code, phase);
  }
  function releaseKeys() { Array.from(held).forEach(function (key) { sendKey(key, 'up'); }); }
  const keys = { ArrowUp: 38, ArrowDown: 40, ArrowLeft: 37, ArrowRight: 39, w: 87, a: 65, s: 83, d: 68, Enter: 13, ' ': 32, Escape: 27, x: 88, b: 66, g: 71, f: 70, t: 84 };
  window.addEventListener('keydown', function (e) {
    if (modal.childElementCount) {
      if (e.key === 'Escape') closeModal();
      if (e.key === 'Tab') {
        const controls = Array.from(modal.querySelectorAll('button,a[href]'));
        if (e.shiftKey && document.activeElement === controls[0]) { e.preventDefault(); controls.at(-1).focus(); }
        else if (!e.shiftKey && document.activeElement === controls.at(-1)) { e.preventDefault(); controls[0].focus(); }
      }
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey || /INPUT|TEXTAREA|BUTTON|A|SELECT/.test(e.target.tagName) || e.target.isContentEditable) return;
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (key === 'p' || key === 'l') {
      e.preventDefault(); if (!e.repeat) call(key === 'p' ? 'save' : 'load'); return;
    }
    if (keys[key]) { e.preventDefault(); if (!e.repeat) sendKey(keys[key], 'down'); }
  });
  window.addEventListener('keyup', function (e) {
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (keys[key] && held.has(keys[key])) { e.preventDefault(); sendKey(keys[key], 'up'); }
  });
  window.addEventListener('blur', releaseKeys);
  document.querySelectorAll('[data-direction]').forEach(function (button) {
    const code = { up: 38, down: 40, left: 37, right: 39 }[button.dataset.direction];
    button.addEventListener('pointerdown', function (e) { e.preventDefault(); button.setPointerCapture(e.pointerId); sendKey(code, 'down'); });
    button.addEventListener('pointerup', function () { sendKey(code, 'up'); });
    button.addEventListener('pointercancel', function () { sendKey(code, 'up'); });
    button.addEventListener('click', function (e) { if (e.detail === 0) { sendKey(code, 'down'); sendKey(code, 'up'); } });
  });

  window.addEventListener('message', function (event) {
    if (event.origin !== location.origin || event.source !== frame.contentWindow || event.data?.source !== 'magic-tower') return;
    const message = event.data;
    if (message.type === 'ready') { ready = true; setText('save-status', '本地存档 · 准备就绪'); }
    if (message.type === 'state') renderState(message.data);
    if (message.type === 'log') addLog(message.data);
    if (message.type === 'saved') setText('save-status', '进度已自动保存');
    if (message.type === 'save-error') setText('save-status', '自动保存失败，请检查浏览器存储');
    if (message.type === 'resume') document.querySelector('[data-action="continue"]').hidden = !message.data.available;
    if (message.type === 'error') { console.error('Game:', message.data.message); showToast('游戏运行遇到问题，请刷新后使用续玩存档恢复。'); }
  });
})();
