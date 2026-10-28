/* 星火牌局 · 1 人 AI / 2 人 / 3 人卡牌对战规则（ES2019，Node 可测） */
(function (root, make) {
  const api = make();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.StarlitDuelCore = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';

  const MAX_HP = 36;
  const BASE_MANA = 3;
  const HAND_LIMIT = 8;
  const DECK_SIZE = 22;
  const MAX_COPIES = 8;
  const MIN_ATTACKS = 6;
  const CARDS = Object.freeze({
    slash: { name: '星火斩', icon: '⚔️', cost: 1, desc: '对指定对手造成 6 点伤害', target: true },
    meteor: { name: '陨星轰击', icon: '☄️', cost: 2, desc: '对指定对手造成 10 点伤害', target: true },
    guard: { name: '守护符文', icon: '🛡️', cost: 1, desc: '获得 8 点护盾', target: false },
    pierce: { name: '破甲刺', icon: '🗡️', cost: 1, desc: '无视护盾，造成 4 点伤害', target: true },
    heal: { name: '星露治疗', icon: '💚', cost: 1, desc: '恢复 6 点生命（不超过上限）', target: false },
    charge: { name: '灵能充盈', icon: '⚡', cost: 0, desc: '获得 1 点能量', target: false },
    study: { name: '观星术', icon: '🔮', cost: 1, desc: '抽取 2 张牌', target: false }
  });
  const DECK = [
    'slash','slash','slash','slash','slash',
    'meteor','meteor','meteor',
    'guard','guard','guard','guard',
    'pierce','pierce','pierce',
    'heal','heal','heal',
    'charge','charge','study','study'
  ];

  const ATTACK_IDS = ['slash', 'meteor', 'pierce'];
  function validateDeck(deck) {
    if (!Array.isArray(deck) || deck.length !== DECK_SIZE)
      return { valid: false, reason: '卡组必须恰好有 ' + DECK_SIZE + ' 张卡牌。' };
    const counts = Object.create(null);
    for (const id of deck) {
      if (typeof id !== 'string' || !Object.prototype.hasOwnProperty.call(CARDS, id))
        return { valid: false, reason: '卡组中存在未知卡牌。' };
      counts[id] = (counts[id] || 0) + 1;
      if (counts[id] > MAX_COPIES)
        return { valid: false, reason: '同一种卡牌最多带 ' + MAX_COPIES + ' 张。' };
    }
    const attacks = ATTACK_IDS.reduce((n, id) => n + (counts[id] || 0), 0);
    if (attacks < MIN_ATTACKS)
      return { valid: false, reason: '攻击卡至少要有 ' + MIN_ATTACKS + ' 张。' };
    return { valid: true, reason: '卡组符合规则', counts, attacks, total: deck.length };
  }
  function defaultDeck() { return [...DECK]; }

  function shuffle(arr, random) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
  function addLog(game, line) {
    game.log.push(String(line));
    if (game.log.length > 16) game.log.shift();
  }
  function draw(game, player, count) {
    for (let i = 0; i < count && player.hand.length < HAND_LIMIT; i++) {
      if (!player.deck.length && player.discard.length) {
        player.deck = shuffle(player.discard.splice(0), game.random);
      }
      if (!player.deck.length) break;
      player.hand.push(player.deck.pop());
    }
  }
  function createMatch(names, random, decks) {
    if (!Array.isArray(names) || (names.length !== 2 && names.length !== 3))
      throw new Error('对战人数必须是 2 或 3 人');
    const chosenDecks = decks === undefined ? names.map(() => defaultDeck()) : decks;
    if (!Array.isArray(chosenDecks) || chosenDecks.length !== names.length)
      throw new Error('每位玩家都必须有自己的卡组');
    chosenDecks.forEach((deck, index) => {
      const check = validateDeck(deck);
      if (!check.valid) throw new Error('玩家 ' + (index + 1) + ' 的卡组无效：' + check.reason);
    });
    const game = {
      players: [],
      turn: 0,
      round: 1,
      phase: 'playing',
      winner: null,
      log: [],
      sequence: 1,
      nextCardUid: 1,
      random: typeof random === 'function' ? random : Math.random
    };
    game.players = names.map((name, index) => {
      const deck = shuffle(chosenDecks[index].map(id => ({ uid: game.nextCardUid++, id })), game.random);
      return {
        seat: index, name: String(name || '旅人').slice(0, 12),
        hp: MAX_HP, shield: 0, mana: 0, alive: true,
        hand: [], deck, discard: []
      };
    });
    for (const p of game.players) draw(game, p, 5);
    game.players[0].mana = BASE_MANA;
    addLog(game, game.players.length + ' 人对战开始！由 ' + game.players[0].name + ' 先手。');
    return game;
  }
  function damage(target, amount, ignoreShield) {
    const block = ignoreShield ? 0 : Math.min(target.shield, amount);
    target.shield -= block;
    const loss = Math.min(target.hp, amount - block);
    target.hp -= loss;
    if (target.hp <= 0) target.alive = false;
    return loss;
  }
  function evaluateWin(game) {
    const active = game.players.filter(p => p.alive);
    if (active.length === 1) {
      game.phase = 'finished';
      game.winner = active[0].seat;
      addLog(game, '🏆 ' + active[0].name + ' 获得本局胜利！');
      return true;
    }
    if (active.length === 0) {
      game.phase = 'finished';
      game.winner = null;
      addLog(game, '本局平局。');
      return true;
    }
    return false;
  }
  function nextTurn(game) {
    const prior = game.turn;
    let chosen = prior;
    for (let n = 0; n < game.players.length; n++) {
      chosen = (chosen + 1) % game.players.length;
      if (game.players[chosen].alive) break;
    }
    game.turn = chosen;
    if (chosen <= prior) game.round++;
    const player = game.players[chosen];
    player.shield = 0;
    player.mana = BASE_MANA;
    draw(game, player, 2);
    addLog(game, '轮到 ' + player.name + ' 出牌。');
  }
  function applyAction(game, seat, action) {
    if (!game || game.phase !== 'playing') return { ok: false, reason: '本局尚未开始或已经结束' };
    if (!Number.isInteger(seat) || seat < 0 || seat >= game.players.length || !game.players[seat].alive)
      return { ok: false, reason: '玩家状态异常' };
    if (seat !== game.turn) return { ok: false, reason: '还没轮到你' };
    const player = game.players[seat];
    if (!action || typeof action !== 'object') return { ok: false, reason: '无效操作' };
    if (action.kind === 'end') {
      addLog(game, player.name + ' 结束回合。');
      nextTurn(game);
      game.sequence++;
      return { ok: true };
    }
    if (action.kind !== 'play' || !Number.isInteger(action.uid)) return { ok: false, reason: '无效卡牌' };
    const index = player.hand.findIndex(c => c.uid === action.uid);
    if (index < 0) return { ok: false, reason: '这张牌已经不在手中' };
    const card = player.hand[index];
    const rule = CARDS[card.id];
    if (!rule || player.mana < rule.cost) return { ok: false, reason: '能量不足' };
    let target;
    if (rule.target) {
      if (!Number.isInteger(action.target) || action.target === seat
          || action.target < 0 || action.target >= game.players.length
          || !game.players[action.target].alive)
        return { ok: false, reason: '请先选择存活的对手作为目标' };
      target = game.players[action.target];
    }
    player.mana -= rule.cost;
    player.hand.splice(index, 1);
    player.discard.push(card);
    const prefix = player.name + ' 打出「' + rule.name + '」';
    switch (card.id) {
      case 'slash': {
        const hit = damage(target, 6, false);
        addLog(game, prefix + '，对 ' + target.name + ' 造成 ' + hit + ' 点伤害。');
        break;
      }
      case 'meteor': {
        const hit = damage(target, 10, false);
        addLog(game, prefix + '，对 ' + target.name + ' 造成 ' + hit + ' 点伤害。');
        break;
      }
      case 'pierce': {
        const hit = damage(target, 4, true);
        addLog(game, prefix + '，穿透 ' + target.name + ' 的护盾造成 ' + hit + ' 点伤害。');
        break;
      }
      case 'guard':
        player.shield += 8;
        addLog(game, prefix + '，获得 8 点护盾。');
        break;
      case 'heal': {
        const recovered = Math.min(MAX_HP - player.hp, 6);
        player.hp += recovered;
        addLog(game, prefix + '，恢复 ' + recovered + ' 点生命。');
        break;
      }
      case 'charge':
        player.mana += 1;
        addLog(game, prefix + '，恢复 1 点能量。');
        break;
      case 'study':
        draw(game, player, 2);
        addLog(game, prefix + '，抽取 2 张牌。');
        break;
    }
    if (target && !target.alive) addLog(game, '💥 ' + target.name + ' 已出局。');
    evaluateWin(game);
    game.sequence++;
    return { ok: true };
  }
  function forfeit(game, seat) {
    if (!game || game.phase !== 'playing' || !Number.isInteger(seat) || seat < 0 || seat >= game.players.length)
      return false;
    const p = game.players[seat];
    if (!p.alive) return false;
    p.hp = 0; p.shield = 0; p.alive = false;
    addLog(game, '📴 ' + p.name + ' 已离线，判定退出本局。');
    const finished = evaluateWin(game);
    if (!finished && seat === game.turn) nextTurn(game);
    game.sequence++;
    return true;
  }
  function snapshot(game, seat) {
    if (!game || !Number.isInteger(seat) || seat < 0 || seat >= game.players.length) throw new Error('invalid seat');
    const mine = game.players[seat];
    return {
      type: 'state', seq: game.sequence,
      phase: game.phase, turn: game.turn, round: game.round, winner: game.winner,
      you: seat, mana: mine.mana,
      hand: mine.hand.map(c => ({ uid: c.uid, id: c.id })),
      players: game.players.map(p => ({
        seat: p.seat, name: p.name, hp: p.hp, shield: p.shield,
        alive: p.alive, cards: p.hand.length,
        deck: p.deck.length, discard: p.discard.length
      })),
      log: [...game.log]
    };
  }
  // Solo AI acts on the same authoritative rules and does not bypass normal card costs.
  function chooseAiAction(game, seat) {
    if (!game || game.phase !== 'playing' || game.turn !== seat
        || !Number.isInteger(seat) || seat < 0 || seat >= game.players.length)
      return { kind: 'end' };
    const me = game.players[seat];
    const foes = game.players.filter(p => p.alive && p.seat !== seat);
    if (!me.alive || !foes.length) return { kind: 'end' };
    const target = foes.slice().sort((a, b) => a.hp - b.hp)[0];
    let best = null;
    let bestScore = -Infinity;
    for (const card of me.hand) {
      const def = CARDS[card.id];
      if (!def || def.cost > me.mana) continue;
      let score = -100;
      switch (card.id) {
        case 'meteor': score = 10; break;
        case 'slash': score = 9; break;
        case 'pierce': score = target.shield > 0 ? 12 : 6; break;
        case 'guard': score = me.shield < 8 ? 5 : -40; break;
        case 'heal': score = me.hp <= MAX_HP - 6 ? 11 : me.hp < MAX_HP ? 3 : -40; break;
        case 'study': score = me.hand.length <= 4 ? 7 : -10; break;
        case 'charge': score = me.mana <= 2 ? 13 : -10; break;
      }
      if (def.target) {
        const damage = card.id === 'meteor' ? 10 : card.id === 'slash' ? 6 : 4;
        if (target.hp <= damage && (card.id === 'pierce' || target.shield < damage))
          score += 10;
      }
      if (score > bestScore) {
        bestScore = score;
        best = { kind: 'play', uid: card.uid, target: def.target ? target.seat : undefined };
      }
    }
    return best && bestScore > 0 ? best : { kind: 'end' };
  }

  return Object.freeze({
    CARDS, MAX_HP, BASE_MANA, DECK_SIZE, MAX_COPIES, MIN_ATTACKS,
    defaultDeck, validateDeck, createMatch, applyAction, forfeit, snapshot, chooseAiAction
  });
});