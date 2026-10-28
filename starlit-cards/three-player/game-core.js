/* 星火牌局：1-3 人对战 / 自定义卡组 / 房主裁决 / 45 秒回合 (Node/browser) */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.StarlitDuelCore=api;
})(typeof globalThis==='object'?globalThis:this,function(){
'use strict';
const MAX_HP=36,BASE_MANA=3,HAND_LIMIT=8,DECK_SIZE=22,MAX_COPIES=8,MIN_ATTACKS=6,TURN_MS=45000;
const CARDS=Object.freeze({
 slash:    {name:'星火斩',icon:'⚔️',cost:1,desc:'对目标造成 6 伤害',target:true,type:'attack'},
 meteor:   {name:'陨星轰击',icon:'☄️',cost:2,desc:'对目标造成 10 伤害',target:true,type:'attack'},
 guard:    {name:'守护符文',icon:'🛡️',cost:1,desc:'获得 8 护盾',target:false,type:'skill'},
 pierce:   {name:'破甲刺',icon:'🗡️',cost:1,desc:'无视护盾造成 4 伤害',target:true,type:'attack'},
 heal:     {name:'星露治疗',icon:'💚',cost:1,desc:'恢复 6 生命',target:false,type:'skill'},
 charge:   {name:'灵能充盈',icon:'⚡',cost:0,desc:'获得 1 能量',target:false,type:'skill'},
 study:    {name:'观星术',icon:'🔮',cost:1,desc:'抽 2 张牌',target:false,type:'skill'},
 flare:    {name:'双星连斩',icon:'🔥',cost:2,desc:'连续攻击两次，每次 5',target:true,type:'attack'},
 sweep:    {name:'群星风暴',icon:'🌪️',cost:2,desc:'对所有敌人造成 5 伤害',target:false,type:'attack'},
 vampire:  {name:'吸星之刃',icon:'🩸',cost:2,desc:'造成 6 伤害并恢复 4 生命',target:true,type:'attack'},
 fortress: {name:'群星壁垒',icon:'🏰',cost:2,desc:'获得 15 护盾',target:false,type:'skill'},
 blessing: {name:'月光祝福',icon:'🌙',cost:2,desc:'恢复 10 生命与 3 护盾',target:false,type:'skill'},
 spark:    {name:'星尘碎片',icon:'✨',cost:0,desc:'抽 1 张牌',target:false,type:'skill'},
 burn:     {name:'燃火印记',icon:'🧨',cost:1,desc:'造成 3 伤害并附加 3 层灼烧',target:true,type:'attack'},
 frost:    {name:'寒霜封印',icon:'❄️',cost:1,desc:'造成 3 伤害，下回合对手少 1 能量',target:true,type:'attack'},
 ray:      {name:'裂隙射线',icon:'💥',cost:2,desc:'无视护盾造成 8 伤害',target:true,type:'attack'},
 renew:    {name:'战地补给',icon:'🍀',cost:1,desc:'获得 4 护盾并抽 1 张',target:false,type:'skill'},
 nova:     {name:'终焉新星',icon:'🌟',cost:3,desc:'对目标造成 16 伤害',target:true,type:'attack'}
});
const DECK=['slash','slash','slash','slash','slash','meteor','meteor','meteor','guard','guard','guard','guard',
'pierce','pierce','pierce','heal','heal','heal','charge','charge','study','study'];
const ATTACK_IDS=Object.keys(CARDS).filter(id=>CARDS[id].type==='attack');
function defaultDeck(){return DECK.slice();}
function validateDeck(ids){
 if(!Array.isArray(ids)||ids.length!==DECK_SIZE)return {valid:false,reason:'必须恰好有 '+DECK_SIZE+' 张卡牌'};
 const counts=Object.create(null);
 for(const id of ids){
  if(typeof id!=='string'||!Object.prototype.hasOwnProperty.call(CARDS,id))return {valid:false,reason:'包含未知卡牌'};
  counts[id]=(counts[id]||0)+1;
  if(counts[id]>MAX_COPIES)return {valid:false,reason:'同名卡牌最多 '+MAX_COPIES+' 张'};
 }
 const attackCount=ATTACK_IDS.reduce((sum,id)=>sum+(counts[id]||0),0);
 if(attackCount<MIN_ATTACKS)return {valid:false,reason:'至少要有 '+MIN_ATTACKS+' 张攻击卡牌'};
 return {valid:true,counts,total:ids.length,attacks:attackCount};
}
function shuffle(arr,random){
 for(let i=arr.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[arr[i],arr[j]]=[arr[j],arr[i]];}
 return arr;
}
function log(game,text){game.log.push(String(text));if(game.log.length>18)game.log.shift();}
function draw(game,p,count){
 for(let i=0;i<count&&p.hand.length<HAND_LIMIT;i++){
  if(!p.deck.length&&p.discard.length)p.deck=shuffle(p.discard.splice(0),game.random);
  if(!p.deck.length)break;
  p.hand.push(p.deck.pop());
 }
}
function createMatch(names,random,decks){
 if(!Array.isArray(names)||(names.length!==2&&names.length!==3))throw Error('对战总人数必须是 2 或 3');
 const selected=decks===undefined?names.map(()=>defaultDeck()):decks;
 if(!Array.isArray(selected)||selected.length!==names.length)throw Error('每位玩家都必须设置卡组');
 selected.forEach((deck,i)=>{const v=validateDeck(deck);if(!v.valid)throw Error('第 '+(i+1)+' 位玩家卡组不合法：'+v.reason);});
 const game={players:[],turn:0,round:1,phase:'playing',winner:null,log:[],sequence:1,nextCardUid:1,
  random:typeof random==='function'?random:Math.random,turnDeadlineAt:Date.now()+TURN_MS,lastEffect:null};
 game.players=names.map((name,seat)=>({
  seat,name:String(name||'旅人').slice(0,12),hp:MAX_HP,shield:0,mana:0,alive:true,burn:0,slow:0,
  hand:[],deck:shuffle(selected[seat].map(id=>({uid:game.nextCardUid++,id})),game.random),discard:[]
 }));
 for(const p of game.players)draw(game,p,5);
 game.players[0].mana=BASE_MANA;
 log(game,'⚔️ 对战开始，'+game.players[0].name+' 先手（每回合 45 秒）。');
 return game;
}
function hit(p,amount,ignoreShield){
 const shield=ignoreShield?0:Math.min(p.shield,amount);
 p.shield-=shield;
 const loss=Math.min(p.hp,Math.max(0,amount-shield));
 p.hp-=loss;
 if(p.hp<=0){p.hp=0;p.alive=false;}
 return {seat:p.seat,delta:-loss,shield:-shield};
}
function healed(p,value){const amount=Math.min(MAX_HP-p.hp,value);p.hp+=amount;return {seat:p.seat,delta:amount,shield:0};}
function shielded(p,value){p.shield+=value;return {seat:p.seat,delta:0,shield:value};}
function setEffect(game,card,by,results,kind){
 game.lastEffect={id:game.sequence,card,by,results,kind};
}
function winCheck(game){
 const alive=game.players.filter(p=>p.alive);
 if(alive.length<=1){
  game.phase='finished';game.winner=alive.length?alive[0].seat:null;
  log(game,alive.length?'🏆 '+alive[0].name+' 获胜！':'本场平局');
  return true;
 }
 return false;
}
function advance(game,now=Date.now()){
 const prior=game.turn;
 for(let n=0;n<game.players.length;n++){
  const next=(game.turn+1)%game.players.length;
  game.turn=next;
  if(!game.players[next].alive)continue;
  if(game.turn<=prior)game.round++;
  const p=game.players[next];
  p.shield=0;
  p.mana=Math.max(1,BASE_MANA-(p.slow?1:0));
  p.slow=0;
  draw(game,p,2);
  if(p.burn){
   const amount=p.burn;p.burn=Math.max(0,p.burn-1);
   const result=hit(p,amount,true);
   log(game,'🔥 '+p.name+' 受到 '+(-result.delta)+' 点灼烧伤害');
   setEffect(game,'burn',-1,[result],'damage');
   if(winCheck(game))return;
   if(!p.alive)continue;
  }else{
   setEffect(game,'turn',p.seat,[],'turn');
  }
  game.turnDeadlineAt=now+TURN_MS;
  log(game,'轮到 '+p.name+' 出牌。');
  return;
 }
 winCheck(game);
}
function expireTurn(game,now=Date.now()){
 if(!game||game.phase!=='playing'||now<game.turnDeadlineAt)return false;
 const p=game.players[game.turn];
 log(game,'⏱️ '+p.name+' 超时，自动结束回合。');
 game.sequence++;advance(game,now);
 return true;
}
function applyAction(game,seat,action){
 if(!game||game.phase!=='playing')return {ok:false,reason:'对局已结束'};
 if(expireTurn(game))return {ok:false,timedOut:true,reason:'回合超时，已自动换人'};
 if(!Number.isInteger(seat)||seat<0||seat>=game.players.length||!game.players[seat].alive)return {ok:false,reason:'玩家不可操作'};
 if(seat!==game.turn)return {ok:false,reason:'还没轮到你'};
 const p=game.players[seat];
 if(!action||typeof action!=='object')return {ok:false,reason:'无效操作'};
 if(action.kind==='end'){
  log(game,p.name+' 结束回合。');game.sequence++;advance(game);
  return {ok:true};
 }
 if(action.kind!=='play'||!Number.isInteger(action.uid))return {ok:false,reason:'未知卡牌操作'};
 const index=p.hand.findIndex(c=>c.uid===action.uid);
 if(index<0)return {ok:false,reason:'这张卡牌不在手里'};
 const c=p.hand[index],def=CARDS[c.id];
 if(!def||p.mana<def.cost)return {ok:false,reason:'能量不足'};
 let opponent=null;
 if(def.target){
  const t=action.target;
  if(!Number.isInteger(t)||t<0||t>=game.players.length||t===seat||!game.players[t].alive)
   return {ok:false,reason:'请选择尚未出局的对手'};
  opponent=game.players[t];
 }
 p.mana-=def.cost;p.hand.splice(index,1);p.discard.push(c);
 const results=[];
 const strike=(t,value,ignore=false)=>results.push(hit(t,value,ignore));
 const myHeal=value=>results.push(healed(p,value));
 const myShield=value=>results.push(shielded(p,value));
 switch(c.id){
  case 'slash':strike(opponent,6);break;
  case 'meteor':strike(opponent,10);break;
  case 'pierce':strike(opponent,4,true);break;
  case 'guard':myShield(8);break;
  case 'heal':myHeal(6);break;
  case 'charge':p.mana+=1;results.push({seat,delta:0,shield:0});break;
  case 'study':draw(game,p,2);results.push({seat,delta:0,shield:0});break;
  case 'flare':strike(opponent,5);if(opponent.alive)strike(opponent,5);break;
  case 'sweep':for(const other of game.players)if(other.alive&&other.seat!==seat)strike(other,5);break;
  case 'vampire':strike(opponent,6);myHeal(4);break;
  case 'fortress':myShield(15);break;
  case 'blessing':myHeal(10);myShield(3);break;
  case 'spark':draw(game,p,1);results.push({seat,delta:0,shield:0});break;
  case 'burn':strike(opponent,3);if(opponent.alive)opponent.burn+=3;break;
  case 'frost':strike(opponent,3);if(opponent.alive)opponent.slow=1;break;
  case 'ray':strike(opponent,8,true);break;
  case 'renew':myShield(4);draw(game,p,1);break;
  case 'nova':strike(opponent,16);break;
 }
 game.sequence++;
 setEffect(game,c.id,seat,results,def.type==='attack'?'damage':c.id==='heal'||c.id==='blessing'?'heal':'shield');
 log(game,p.name+' 打出「'+def.name+'」'+(opponent?'，目标：'+opponent.name:'')+'。');
 for(const other of game.players)if(!other.alive&&other.hp===0&&results.some(r=>r.seat===other.seat))log(game,'💥 '+other.name+' 已出局。');
 winCheck(game);
 return {ok:true};
}
function forfeit(game,seat){
 if(!game||game.phase!=='playing'||!Number.isInteger(seat)||seat<0||seat>=game.players.length)return false;
 const p=game.players[seat];if(!p.alive)return false;
 p.hp=0;p.shield=0;p.alive=false;
 log(game,'📴 '+p.name+' 离线，判定退赛。');
 game.sequence++;
 setEffect(game,'leave',seat,[{seat,delta:0,shield:0}],'leave');
 if(!winCheck(game)&&seat===game.turn)advance(game);
 return true;
}
function snapshot(game,seat){
 if(!game||!Number.isInteger(seat)||seat<0||seat>=game.players.length)throw Error('invalid seat');
 const mine=game.players[seat];
 return {type:'state',seq:game.sequence,phase:game.phase,turn:game.turn,round:game.round,winner:game.winner,
  you:seat,mana:mine.mana,remainingMs:game.phase==='playing'?Math.max(0,game.turnDeadlineAt-Date.now()):0,
  hand:mine.hand.map(c=>({uid:c.uid,id:c.id})),
  players:game.players.map(p=>({seat:p.seat,name:p.name,hp:p.hp,shield:p.shield,burn:p.burn,slow:p.slow,alive:p.alive,
   cards:p.hand.length,deck:p.deck.length,discard:p.discard.length})),
  lastEffect:game.lastEffect,log:game.log.slice(-12)};
}
function chooseAiAction(game,seat){
 if(!game||game.phase!=='playing'||game.turn!==seat||!Number.isInteger(seat)||seat<0||seat>=game.players.length)return {kind:'end'};
 const me=game.players[seat],foes=game.players.filter(p=>p.alive&&p.seat!==seat).sort((a,b)=>a.hp-b.hp);
 if(!me.alive||!foes.length)return {kind:'end'};
 const enemy=foes[0];let best=null,score=-999;
 for(const card of me.hand){
  const def=CARDS[card.id];if(!def||def.cost>me.mana)continue;
  const rankings={slash:8,meteor:11,guard:me.shield<5?6:-9,pierce:enemy.shield>0?13:7,heal:me.hp<MAX_HP-5?12:-9,
   charge:me.mana<=2?15:-9,study:me.hand.length<5?8:-9,flare:12,sweep:foes.length>1?15:8,
   vampire:me.hp<MAX_HP-3?14:10,fortress:me.shield<8?10:-9,blessing:me.hp<MAX_HP-9?13:-9,
   spark:me.hand.length<7?6:-9,burn:enemy.burn<3?11:6,frost:enemy.slow?6:10,ray:enemy.shield>0?15:10,
   renew:me.shield<5?7:3,nova:16};
  let value=rankings[card.id]??0;
  if(def.target&&enemy.hp<=({slash:6,meteor:10,pierce:4,flare:10,sweep:5,vampire:6,burn:3,frost:3,ray:8,nova:16}[card.id]||0))
    value+=12;
  if(value>score){score=value;best={kind:'play',uid:card.uid,target:def.target?enemy.seat:undefined};}
 }
 return best&&score>0?best:{kind:'end'};
}
return Object.freeze({CARDS,MAX_HP,BASE_MANA,DECK_SIZE,MAX_COPIES,MIN_ATTACKS,HAND_LIMIT,TURN_MS,
 defaultDeck,validateDeck,createMatch,applyAction,expireTurn,forfeit,snapshot,chooseAiAction});
});