'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');
const core = require(path.join(__dirname, '../starlit-cards/three-player/game-core.js'));

const create = () => core.createMatch(['房主','二号','三号'], () => 0.5);
const play = (g, p, id, target) => {
  let c = g.players[p].hand.find(c => c.id === id);
  if (!c) {
    // Add legitimate existing card to hand by drawing from deck for a deterministic mechanic test.
    const index = g.players[p].deck.findIndex(c => c.id === id);
    if (index < 0) throw new Error('No '+id+' card available');
    c = g.players[p].deck.splice(index, 1)[0];
    g.players[p].hand.push(c);
  }
  const action={ kind: 'play', uid: c.uid };
  if (target !== undefined) action.target = target;
  return core.applyAction(g,p,action);
};

test('new match: exactly 3 distinct seats, 36 HP, 5 cards, only host turn has energy', () => {
  const g = create();
  assert.equal(g.players.length,3);
  for(const p of g.players) {
    assert.equal(p.hp,36);
    assert.equal(p.hand.length,5);
    assert.equal(p.deck.length,17);
    assert.equal(p.alive,true);
    assert.equal(p.shield,0);
  }
  assert.equal(g.players[0].mana,3);
  assert.equal(g.players[1].mana,0);
  assert.equal(g.players[2].mana,0);
  assert.equal(g.turn,0);
  assert.equal(g.phase,'playing');
});

test('reject out-of-turn, own/invalid target, forged uid, and cannot exceed mana', () => {
  const g = create();
  const uid = g.players[1].hand[0].uid;
  assert.equal(core.applyAction(g,1,{kind:'play',uid,target:0}).ok,false);
  assert.equal(core.applyAction(g,1,{kind:'end'}).ok,false);
  assert.equal(core.applyAction(g,0,{kind:'play',uid:999999,target:1}).ok,false);
  assert.equal(play(g,0,'slash',0).ok,false);
  assert.equal(play(g,0,'slash',3).ok,false);
  assert.equal(play(g,0,'slash',1).ok,true);
  assert.equal(g.players[1].hp,30);
  assert.equal(core.applyAction(g,0,{kind:'play',uid:999999,target:1}).ok,false);
  assert.equal(g.players[0].mana,2);
  g.players[0].mana=0;
  assert.equal(play(g,0,'slash',1).ok,false);
});

test('shield absorbs damage, piercing bypasses shield, and guard expires at own next turn', () => {
  const g = create();
  assert.equal(play(g,0,'guard').ok,true);
  assert.equal(g.players[0].shield,8);
  assert.equal(core.applyAction(g,0,{kind:'end'}).ok,true);
  assert.equal(play(g,1,'slash',0).ok,true);
  assert.equal(g.players[0].hp,36);
  assert.equal(g.players[0].shield,2);
  assert.equal(play(g,1,'pierce',0).ok,true);
  assert.equal(g.players[0].hp,32);
  assert.equal(g.players[0].shield,2);
  assert.equal(core.applyAction(g,1,{kind:'end'}).ok,true);
  assert.equal(core.applyAction(g,2,{kind:'end'}).ok,true);
  assert.equal(g.turn,0);
  assert.equal(g.players[0].shield,0);
  assert.equal(g.players[0].mana,3);
});

test('turn advances cyclically and draws two cards every return turn', () => {
  const g=create();
  assert.equal(core.applyAction(g,0,{kind:'end'}).ok,true);
  assert.equal(g.turn,1);
  assert.equal(g.players[1].hand.length,7);
  assert.equal(core.applyAction(g,1,{kind:'end'}).ok,true);
  assert.equal(g.turn,2);
  assert.equal(g.players[2].hand.length,7);
  assert.equal(core.applyAction(g,2,{kind:'end'}).ok,true);
  assert.equal(g.turn,0);
  assert.equal(g.round,2);
  assert.equal(g.players[0].hand.length,7);
});

test('only private hand is visible in each snapshot', () => {
  const g=create();
  const a=core.snapshot(g,0);
  const b=core.snapshot(g,1);
  assert.equal(a.hand.length,5);
  assert.equal(b.hand.length,5);
  assert.notDeepEqual(a.hand.map(x=>x.uid),b.hand.map(x=>x.uid));
  assert.equal(a.players[1].hand,undefined);
  assert.equal(a.players[2].deck.length,undefined);
  assert.equal(a.players[2].cards,5);
  assert.equal(a.you,0);
  assert.equal(b.you,1);
});

test('healing capped to 36, charge increases usable mana', () => {
  const g=create();
  assert.equal(play(g,0,'heal').ok,true);
  assert.equal(g.players[0].hp,36);
  assert.equal(play(g,0,'charge').ok,true);
  assert.equal(g.players[0].mana,3);
});

test('discard reshuffle prevents softlock after enough turns', () => {
  const g=create();
  const p=g.players[0];
  p.deck=[];p.discard=p.hand.splice(0);
  core.applyAction(g,0,{kind:'end'});
  core.applyAction(g,1,{kind:'end'});
  core.applyAction(g,2,{kind:'end'});
  assert.equal(g.players[0].hand.length,2);
  assert.equal(g.players[0].discard.length,0);
});

test('forfeit active seat automatically skips eliminated and awards last survivor', () => {
  const g=create();
  assert.equal(core.forfeit(g,0),true);
  assert.equal(g.players[0].alive,false);
  assert.equal(g.turn,1);
  assert.equal(core.applyAction(g,0,{kind:'end'}).ok,false);
  assert.equal(core.forfeit(g,2),true);
  assert.equal(g.phase,'finished');
  assert.equal(g.winner,1);
  assert.equal(core.applyAction(g,1,{kind:'end'}).ok,false);
  assert.equal(core.forfeit(g,2),false);
});

test('can finish by attack, and cannot target eliminated seats', () => {
  const g=create();
  g.players[1].hp=4;
  assert.equal(play(g,0,'slash',1).ok,true);
  assert.equal(g.players[1].alive,false);
  assert.equal(play(g,0,'slash',1).ok,false);
  g.players[2].hp=4;
  assert.equal(play(g,0,'slash',2).ok,true);
  assert.equal(g.phase,'finished');
  assert.equal(g.winner,0);
  assert.equal(core.applyAction(g,0,{kind:'end'}).ok,false);
});

test('only 2 or 3 total participants, custom decks validated', () => {
  const d=core.defaultDeck();
  assert.equal(d.length,22);
  assert.equal(core.validateDeck(d).valid,true);
  assert.equal(core.createMatch(['A','B'],()=>.1).players.length,2);
  assert.equal(core.createMatch(['A','B','C'],()=>.1).players.length,3);
  assert.throws(()=>core.createMatch(['A'],()=>.1));
  assert.throws(()=>core.createMatch([],()=>.1));
  assert.throws(()=>core.createMatch(['A','B','C','D'],()=>.1));
  assert.equal(core.validateDeck(Array(22).fill('slash')).valid,false);
  assert.equal(core.validateDeck(Array(22).fill('heal')).valid,false);
  assert.equal(core.validateDeck([...d.slice(1),'unknown']).valid,false);
  assert.equal(core.validateDeck(d.slice(1)).valid,false);
  const a=[...d];a[0]='meteor';
  const game=core.createMatch(['A','B'],()=>.4,[a,d]);
  assert.equal(game.players[0].deck.length+game.players[0].hand.length,22);
  assert.throws(()=>core.createMatch(['A','B'],()=>.4,[d,[]]));
});

test('two-person turns, elimination and win condition', () => {
  const game=core.createMatch(['玩家','好友'],()=>.5);
  assert.equal(core.applyAction(game,0,{kind:'end'}).ok,true);
  assert.equal(game.turn,1);
  assert.equal(core.applyAction(game,1,{kind:'end'}).ok,true);
  assert.equal(game.turn,0);
  assert.equal(core.forfeit(game,1),true);
  assert.equal(game.phase,'finished');
  assert.equal(game.winner,0);
});

test('AI chooses legal playable actions and ends when out of energy', () => {
  const game=core.createMatch(['玩家','机器人'],()=>.5);
  assert.equal(core.applyAction(game,0,{kind:'end'}).ok,true);
  let steps=0;
  while(game.phase==='playing'&&game.turn===1&&steps++<25) {
    const action=core.chooseAiAction(game,1);
    const out=core.applyAction(game,1,action);
    assert.equal(out.ok,true,JSON.stringify(action));
  }
  assert.ok(steps<25,'AI does not loop indefinitely');
  assert.ok(game.phase==='finished'||game.turn===0);
});

test('18 card types, custom deck additions and cost semantics',()=>{
 assert.ok(Object.keys(core.CARDS).length>=18);
 const d=[...core.defaultDeck()];
 d[0]='nova';d[1]='frost';d[2]='burn';
 assert.equal(core.validateDeck(d).valid,true);
 const game=core.createMatch(['A','B'],()=>.4,[d,core.defaultDeck()]);
 assert.equal(game.players.length,2);
});
test('turn timer expires through host-authoritative check',()=>{
 const game=create();
 const before=game.turn;
 const expiry=game.turnDeadlineAt;
 assert.equal(core.expireTurn(game,expiry-1),false);
 assert.equal(core.expireTurn(game,expiry),true);
 assert.notEqual(game.turn,before);
 assert.equal(core.expireTurn(game,expiry),false);
});
test('new targeting and area attacks apply correctly',()=>{
 const game=create();
 let p=game.players[0];
 const c=p.deck.find(c=>c.id==='sweep');
 if(!c) {p.deck.push({uid:99988,id:'sweep'});}
 const idx=p.deck.findIndex(c=>c.id==='sweep');p.hand.push(...p.deck.splice(idx,1));p.mana=3;
 const uid=p.hand.find(c=>c.id==='sweep').uid;
 assert.equal(core.applyAction(game,0,{kind:'play',uid}).ok,true);
 assert.equal(game.players[1].hp,31);
 assert.equal(game.players[2].hp,31);
});
