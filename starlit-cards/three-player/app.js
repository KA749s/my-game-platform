/* 星火牌局 · 三人联机（匿名房间，PeerJS WebRTC），不依赖游戏账号。 */
(() => {
  'use strict';

  const Core = window.StarlitDuelCore;
  const $ = (id) => document.getElementById(id);
  const PEER_PREFIX = 'starlit-three-';
  const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const VERSION = 1;

  let role = null; // "host" / "guest"
  let peer = null;
  let hostConnection = null;
  let roomCode = '';
  let mySeat = -1;
  let myName = '';
  let screen = 'home';
  let match = null;
  let publicState = null;
  let selectedTarget = null;
  let lastSequence = 0;
  let people = [null, null, null];
  const guests = new Map(); // seat => DataConnection, host only
  let connectTimer = null;
  let starting = false;
  let matchNumber = 0;
  let lastMatchNumber = 0;

  function escapeRoom(raw) {
    return String(raw || '').trim().replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 6);
  }
  function secureRoomCode() {
    const bytes = new Uint8Array(6);
    window.crypto.getRandomValues(bytes);
    return Array.from(bytes, b => ALPHABET[b % ALPHABET.length]).join('');
  }
  function validCode(code) {
    return /^[A-HJ-NP-Z2-9]{6}$/.test(code);
  }
  function sanitizeName(name) {
    const cleaned = String(name == null ? '' : name).replace(/[\x00-\x1F<>]/g, '').trim();
    return cleaned.slice(0, 12) || '星火旅人';
  }
  function roomPeerId(code) {
    return PEER_PREFIX + code.toLowerCase();
  }
  function status(message, isError = false) {
    const area = $('global-status');
    $('status-placeholder').textContent = message;
    area.classList.toggle('error', !!isError);
    area.hidden = false;
  }
  function closeStatus() {
    $('global-status').hidden = true;
  }
  function view(mode) {
    screen = mode;
    $('landing').hidden = mode !== 'home';
    $('lobby').hidden = mode !== 'lobby';
    $('battle').hidden = mode !== 'battle';
    $('in-room-controls').hidden = mode === 'home';
    $('site-label').textContent = mode === 'home' ? '三人联机 · 无需登录' : '房间 ' + roomCode;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function button(label, css, onClick, disabled = false) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = css || 'btn';
    b.textContent = label;
    b.disabled = !!disabled;
    b.addEventListener('click', onClick);
    return b;
  }
  function element(tag, className, text) {
    const n = document.createElement(tag);
    if (className) n.className = className;
    if (text !== undefined) n.textContent = String(text);
    return n;
  }
  function clearConnectionTimer() {
    if (connectTimer) clearTimeout(connectTimer);
    connectTimer = null;
  }
  function tearDown() {
    clearConnectionTimer();
    const oldConnections = [...guests.values()];
    if (hostConnection) oldConnections.push(hostConnection);
    guests.clear();
    hostConnection = null;
    if (peer) {
      // Prevent close handlers from recursively leaving during voluntary cleanup.
      for (const c of oldConnections) {
        try { c.removeAllListeners('close'); c.removeAllListeners('error'); c.close(); } catch (_) {}
      }
      try { peer.removeAllListeners(); peer.destroy(); } catch (_) {}
    }
    peer = null;
    role = null;
    roomCode = '';
    mySeat = -1;
    match = null;
    publicState = null;
    selectedTarget = null;
    lastSequence = 0;
    starting = false;
    matchNumber = 0;
    lastMatchNumber = 0;
    people = [null, null, null];
  }
  function leave(message) {
    tearDown();
    view('home');
    if (message) status(message, true);
    else closeStatus();
  }
  function send(conn, data) {
    try {
      if (conn && conn.open) conn.send(data);
      return !!(conn && conn.open);
    } catch (_) {
      return false;
    }
  }
  function showPeerError(error) {
    const type = String(error?.type || '');
    if (type === 'unavailable-id') return '房间号刚被占用，请重新创建房间。';
    if (type === 'peer-unavailable') return '找不到这个房间，请确认房主仍然开着网页。';
    if (type === 'browser-incompatible') return '当前浏览器不支持 WebRTC，请使用新版 Chrome、Edge 或 Safari。';
    if (type === 'network' || type === 'socket-error' || type === 'server-error') return '连接信令服务器失败，请检查网络，或稍后重试。';
    return '联机失败，请检查网络或更换浏览器。';
  }
  function newPeer(id) {
    if (typeof window.Peer !== 'function') {
      status('联机组件未加载。请检查网络是否能访问 PeerJS，再刷新网页。', true);
      return null;
    }
    // Public PeerServer Cloud brokers peers; direct WebRTC carries game messages.
    return id ? new window.Peer(id, { debug: 0 }) : new window.Peer({ debug: 0 });
  }
  function markBusy(busy) {
    $('create-room').disabled = busy;
    $('join-room').disabled = busy;
    $('create-room').textContent = busy ? '正在连接…' : '创建三人房间';
  }
  function acceptName() {
    return sanitizeName($('nickname').value);
  }
  function startHosting() {
    closeStatus();
    if (peer) tearDown();
    role = 'host';
    mySeat = 0;
    myName = acceptName();
    roomCode = secureRoomCode();
    people[0] = { name: myName, connected: true };
    markBusy(true);
    peer = newPeer(roomPeerId(roomCode));
    if (!peer) { markBusy(false); tearDown(); return; }
    peer.on('open', () => {
      markBusy(false);
      view('lobby');
      renderLobby();
      status('房间已创建。分享房间号或邀请链接，等另外两人加入。');
    });
    peer.on('connection', (connection) => onGuestConnection(connection));
    peer.on('error', error => {
      if (!peer) return;
      markBusy(false);
      leave(showPeerError(error));
    });
    peer.on('disconnected', () => {
      if (screen !== 'home') status('信令服务器暂时断开；已建立的对战连接仍可能继续。');
    });
  }
  function startJoining() {
    closeStatus();
    const code = escapeRoom($('join-code').value);
    $('join-code').value = code;
    if (!validCode(code)) {
      status('请输入 6 位房间号（大写字母和数字）。', true);
      return;
    }
    if (peer) tearDown();
    role = 'guest';
    myName = acceptName();
    roomCode = code;
    markBusy(true);
    peer = newPeer();
    if (!peer) { markBusy(false); tearDown(); return; }
    peer.on('open', () => {
      hostConnection = peer.connect(roomPeerId(roomCode), {
        reliable: true, serialization: 'json',
        metadata: { version: VERSION, name: myName }
      });
      const c = hostConnection;
      c.on('open', () => {
        markBusy(false);
        view('lobby');
        renderLobby();
        status('已建立连接，正在等待房主确认加入…');
      });
      c.on('data', handleHostMessage);
      c.on('close', () => {
        if (role === 'guest' && hostConnection === c) leave('房主已离开或连接中断，房间已经结束。');
      });
      c.on('error', () => {
        if (role === 'guest') leave('无法连接到房主。请检查房间号或网络环境。');
      });
      clearConnectionTimer();
      connectTimer = setTimeout(() => {
        if (role === 'guest' && mySeat === -1) leave('连接超时。请确认房主还在房间，并保持网页打开。');
      }, 18000);
    });
    peer.on('error', error => {
      if (role !== 'guest') return;
      markBusy(false);
      leave(showPeerError(error));
    });
    peer.on('disconnected', () => {
      if (role === 'guest' && mySeat >= 0) status('信令暂时中断，已建立的对局连接可能继续。');
    });
  }
  function onGuestConnection(conn) {
    if (role !== 'host') { conn.close(); return; }
    let assignedSeat = -1;
    conn.on('open', () => {
      if (role !== 'host' || screen !== 'lobby') {
        send(conn, { type: 'rejected', message: '房间已经开始，暂时无法加入。' });
        setTimeout(() => conn.close(), 250);
        return;
      }
      if (conn.metadata?.version !== VERSION) {
        send(conn, { type: 'rejected', message: '玩家网页版本不一致，请双方刷新网页。' });
        setTimeout(() => conn.close(), 250);
        return;
      }
      const vacant = [1, 2].find(i => !people[i]);
      if (vacant === undefined) {
        send(conn, { type: 'rejected', message: '三人房间已满。' });
        setTimeout(() => conn.close(), 250);
        return;
      }
      assignedSeat = vacant;
      const name = sanitizeName(conn.metadata?.name);
      people[vacant] = { name, connected: true };
      guests.set(vacant, conn);
      send(conn, { type: 'welcome', seat: vacant, code: roomCode });
      broadcastLobby();
      status(name + ' 已加入房间。');
    });
    conn.on('data', data => {
      if (assignedSeat < 0 || guests.get(assignedSeat) !== conn || !data || typeof data !== 'object') return;
      if (data.type === 'action' && screen === 'battle' && match) {
        const action = data.action;
        applyAction(assignedSeat, action, conn);
      }
    });
    conn.on('close', () => {
      if (assignedSeat < 0 || guests.get(assignedSeat) !== conn) return;
      guests.delete(assignedSeat);
      if (screen === 'battle' && match) {
        const gone = Core.forfeit(match, assignedSeat);
        if (gone) broadcastMatch();
        status(people[assignedSeat].name + ' 已断开，按退赛处理。', true);
      } else {
        people[assignedSeat] = null;
        broadcastLobby();
      }
    });
    conn.on('error', () => {
      if (assignedSeat >= 0 && guests.get(assignedSeat) === conn) {
        status(people[assignedSeat].name + ' 连接出现问题。', true);
      }
    });
  }
  function lobbyPayload() {
    return {
      type: 'lobby', code: roomCode,
      players: people.map((p, i) => p ? { seat: i, name: p.name, connected: p.connected } : null)
    };
  }
  function broadcastLobby() {
    if (role !== 'host') return;
    const payload = lobbyPayload();
    guests.forEach(c => send(c, payload));
    renderLobby();
  }
  function handleHostMessage(data) {
    if (!data || typeof data !== 'object') return;
    if (data.type === 'rejected') {
      leave(String(data.message || '未能加入房间'));
      return;
    }
    if (data.type === 'welcome') {
      if (!Number.isInteger(data.seat) || (data.seat !== 1 && data.seat !== 2) || data.code !== roomCode) {
        leave('房间身份校验失败。');
        return;
      }
      mySeat = data.seat;
      clearConnectionTimer();
      status('成功加入房间！等待所有三位玩家到齐。');
      return;
    }
    if (mySeat < 0) return;
    if (data.type === 'lobby' && Array.isArray(data.players) && data.players.length === 3) {
      people = data.players;
      renderLobby();
    }
    if (data.type === 'state') {
      if (data.you !== mySeat || !Number.isInteger(data.seq) || !Number.isInteger(data.matchNo)) return;
      if (data.matchNo < lastMatchNumber) return;
      if (data.matchNo > lastMatchNumber) {
        lastMatchNumber = data.matchNo;
        lastSequence = 0;
      }
      if (data.seq <= lastSequence) return;
      lastSequence = data.seq;
      publicState = data;
      view('battle');
      renderBattle(data);
    }
    if (data.type === 'notice') {
      status(String(data.message || '操作未完成'), true);
    }
  }
  function lobbyCount() {
    return people.filter(p => p && p.connected).length;
  }
  function renderLobby() {
    $('lobby-code').textContent = roomCode || '——';
    $('room-share').textContent = location.origin + location.pathname + '?room=' + encodeURIComponent(roomCode);
    $('lobby-count').textContent = lobbyCount() + ' / 3 位玩家';
    const list = $('lobby-players');
    list.replaceChildren();
    for (let i = 0; i < 3; i++) {
      const p = people[i];
      const item = element('div', 'lobby-seat' + (p ? ' ready' : ' waiting'));
      item.append(element('span', 'seat-number', '0' + (i + 1)));
      const text = element('div', 'seat-details');
      text.append(element('strong', '', p ? p.name : '等待玩家加入…'));
      text.append(element('small', '', p ? (i === 0 ? '房主' : '已就绪') : '尚未连接'));
      item.append(text);
      item.append(element('span', 'seat-icon', p ? '✓' : '···'));
      list.append(item);
    }
    $('start-match').hidden = role !== 'host';
    $('start-match').disabled = role !== 'host' || lobbyCount() !== 3 || starting;
    $('wait-for-host').hidden = role === 'host';
    $('lobby-hint').textContent = lobbyCount() < 3
      ? '还差 ' + (3 - lobbyCount()) + ' 位玩家，凑齐三人才能开战。'
      : role === 'host' ? '三人已就位，可以开始对战！' : '三人已就位，等待房主点击开始。';
  }
  function beginMatch() {
    if (role !== 'host' || lobbyCount() !== 3 || match) return;
    starting = true;
    $('start-match').disabled = true;
    matchNumber++;
    match = Core.createMatch(people.map(p => p.name), () => {
      const u = new Uint32Array(1);
      crypto.getRandomValues(u);
      return u[0] / 4294967296;
    });
    view('battle');
    broadcastMatch();
  }
  function broadcastMatch() {
    if (!match || role !== 'host') return;
    const local = { ...Core.snapshot(match, 0), matchNo: matchNumber };
    publicState = local;
    renderBattle(local);
    for (const [seat, conn] of guests.entries()) {
      send(conn, { ...Core.snapshot(match, seat), matchNo: matchNumber });
    }
  }
  function applyAction(seat, action, conn) {
    if (role !== 'host' || !match) return;
    const outcome = Core.applyAction(match, seat, action);
    if (!outcome.ok) {
      if (seat === 0) status(outcome.reason, true);
      else send(conn, { type: 'notice', message: outcome.reason });
      return;
    }
    closeStatus();
    broadcastMatch();
  }
  function takeAction(action) {
    if (screen !== 'battle' || !publicState || publicState.phase !== 'playing') return;
    if (publicState.turn !== mySeat) return;
    if (role === 'host') applyAction(0, action);
    else if (role === 'guest') {
      if (!send(hostConnection, { type: 'action', action })) {
        status('发送失败，请检查与房主的连接。', true);
      }
    }
  }
  function renderBattle(state) {
    if (screen !== 'battle') return;
    $('battle-round').textContent = '第 ' + state.round + ' 轮';
    const me = state.players[mySeat];
    const who = state.players[state.turn];
    const canPlay = state.phase === 'playing' && state.turn === mySeat && me.alive;
    $('turn-heading').textContent = state.phase === 'finished'
      ? (state.winner === mySeat ? '🏆 你赢得了星火对决！' : state.winner === null ? '本局平局' : '本场胜者：' + state.players[state.winner].name)
      : canPlay ? '✨ 轮到你出牌！' : me.alive ? '等待 ' + who.name + ' 出牌…' : '你已出局 · 继续观战';
    $('turn-subtitle').textContent = state.phase === 'finished'
      ? '三人对局结束。房主可以邀请幸存玩家再开一局。'
      : canPlay ? '选择一张手牌；攻击牌要先选目标。' : '实时同步三位玩家的生命、护盾和出牌。';

    const livingTargets = state.players.filter(p => p.alive && p.seat !== mySeat).map(p => p.seat);
    if (!livingTargets.includes(selectedTarget)) selectedTarget = livingTargets[0] ?? null;

    const arena = $('player-arena');
    arena.replaceChildren();
    state.players.forEach(p => {
      const own = p.seat === mySeat;
      const isTarget = p.seat === selectedTarget && !own && p.alive;
      const card = element('article', 'fighter' + (own ? ' own' : '') + (isTarget ? ' chosen' : '') + (!p.alive ? ' eliminated' : '') + (state.turn === p.seat ? ' active' : ''));
      const top = element('div', 'fighter-top');
      top.append(element('span', 'avatar', ['✦', '☾', '✧'][p.seat]));
      const info = element('div', 'fighter-id');
      info.append(element('strong', '', p.name + (own ? '（你）' : '')));
      info.append(element('small', '', p.alive ? (state.turn === p.seat && state.phase === 'playing' ? '正在行动' : '等待行动') : '已出局'));
      top.append(info);
      card.append(top);
      const hp = element('div', 'hp-line');
      hp.append(element('span', '', '❤ ' + p.hp + ' / ' + Core.MAX_HP));
      hp.append(element('span', '', '🛡 ' + p.shield));
      card.append(hp);
      const track = element('div', 'health-track');
      const fill = element('div', 'health-fill');
      fill.style.width = Math.max(0, Math.min(100, (p.hp / Core.MAX_HP) * 100)) + '%';
      track.append(fill);
      card.append(track);
      card.append(element('div', 'fighter-meta', '🃏 手牌 ' + p.cards + ' · 牌库 ' + p.deck));
      if (!own && p.alive && state.phase === 'playing') {
        card.append(button(isTarget ? '✓ 当前攻击目标' : '设为攻击目标', 'target-button' + (isTarget ? ' chosen' : ''), () => {
          selectedTarget = p.seat;
          renderBattle(publicState);
        }, !canPlay));
      } else if (own) {
        card.append(element('div', 'self-tag', '自己'));
      }
      arena.append(card);
    });

    $('mana-display').textContent = '⚡ ' + state.mana + ' 能量';
    $('hand-count').textContent = String(state.hand.length);
    $('end-turn').disabled = !canPlay;
    $('hand-prompt').textContent = state.phase === 'finished' ? '本局结束' : canPlay ? '点击卡牌打出 · 攻击牌请选对手' : '当前不是你的回合';

    const hand = $('hand-cards');
    hand.replaceChildren();
    state.hand.forEach(c => {
      const rule = Core.CARDS[c.id];
      if (!rule) return;
      const card = element('button', 'playing-card ' + (rule.target ? 'attack-card' : 'support-card'));
      card.type = 'button';
      card.disabled = !canPlay || rule.cost > state.mana || (rule.target && selectedTarget === null);
      card.append(element('span', 'card-cost', '⚡ ' + rule.cost));
      card.append(element('span', 'card-symbol', rule.icon));
      card.append(element('strong', 'card-name', rule.name));
      card.append(element('span', 'card-description', rule.desc));
      card.addEventListener('click', () => {
        card.disabled = true;
        takeAction({ kind: 'play', uid: c.uid, target: rule.target ? selectedTarget : undefined });
      });
      hand.append(card);
    });
    if (!state.hand.length) hand.append(element('p', 'empty-hand', '手牌为空。你可以结束回合，等待下次补牌。'));
    const log = $('battle-log');
    log.replaceChildren();
    state.log.slice(-8).reverse().forEach(line => log.append(element('li', '', line)));

    $('rematch').hidden = role !== 'host' || state.phase !== 'finished';
    $('rematch').disabled = role !== 'host' || state.phase !== 'finished' || guests.size !== 2;
    $('rematch-hint').hidden = state.phase !== 'finished' || role === 'host' && guests.size === 2;
  }
  function rematch() {
    if (role !== 'host' || !match || match.phase !== 'finished' || guests.size !== 2) return;
    match = Core.createMatch(people.map(p => p.name), () => {
      const u = new Uint32Array(1); crypto.getRandomValues(u); return u[0] / 4294967296;
    });
    selectedTarget = null;
    lastSequence = 0;
    closeStatus();
    broadcastMatch();
  }
  async function copyInvite() {
    const invite = $('room-share').textContent;
    if (!invite.startsWith('http')) return;
    try {
      await navigator.clipboard.writeText(invite);
      status('邀请链接已复制，可以发给另外两位朋友。');
    } catch (_) {
      const input = $('room-share');
      input.focus();
      input.select?.();
      status('无法自动复制，请长按邀请链接后手动复制。');
    }
  }
  function startup() {
    $('create-room').addEventListener('click', startHosting);
    $('join-room').addEventListener('click', startJoining);
    $('join-code').addEventListener('input', e => { e.target.value = escapeRoom(e.target.value); });
    $('join-code').addEventListener('keydown', e => { if (e.key === 'Enter') startJoining(); });
    $('copy-invite').addEventListener('click', copyInvite);
    $('start-match').addEventListener('click', beginMatch);
    $('end-turn').addEventListener('click', () => takeAction({ kind: 'end' }));
    $('rematch').addEventListener('click', rematch);
    $('leave-room').addEventListener('click', () => {
      if (confirm('确定退出当前房间？房主退出后，整个房间会结束。')) leave();
    });
    $('dismiss-status').addEventListener('click', closeStatus);
    const query = new URLSearchParams(location.search);
    const room = escapeRoom(query.get('room'));
    if (validCode(room)) {
      $('join-code').value = room;
      $('join-message').textContent = '好友邀请你加入房间 ' + room + '。输入昵称后点击「加入房间」即可。';
    }
    view('home');
    if (!Core) status('游戏规则加载失败，请刷新网页。', true);
    else if (typeof window.Peer !== 'function') status('浏览器联机组件暂时无法加载，请检查网络后刷新。', true);
  }
  document.addEventListener('DOMContentLoaded', startup);
  window.addEventListener('beforeunload', () => { try { tearDown(); } catch (_) {} });
})();