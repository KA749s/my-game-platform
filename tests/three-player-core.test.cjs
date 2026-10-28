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

test('must have exactly three players', () => {
  assert.throws(()=>core.createMatch(['A','B'],()=>.1));
  assert.throws(()=>core.createMatch([],()=>.1));
});
