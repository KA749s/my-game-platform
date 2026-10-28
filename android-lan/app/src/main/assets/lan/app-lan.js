/* Offline 1-3 participant Android LAN game; native TCP host is authoritative. */
(() => {
'use strict';
const Core=window.StarlitDuelCore,Native=window.LocalLan;
const KEY='starlit_lan_deck_v1';
let clockTimer=null,deadline=0,lastFx=0,soundOn=true,audioCtx=null,mode=1,role='solo',seat=0,people=[],seats={},decks={},game=null,viewState=null,matchNo=0,lastNo=0,deck=Core.defaultDeck(),target=null,aiTimer=null;
function $(id){return document.getElementById(id)}
function msg(text){$('global-status').hidden=false;$('status-placeholder').textContent=String(text)}
function clearMsg(){$('global-status').hidden=true}
function safeName(t){return String(t||'星火旅人').replace(/[<>]/g,'').trim().slice(0,12)||'星火旅人'}
function show(name){for(const id of ['landing','lobby','battle'])$(id).hidden=id!==name;$('in-room-controls').hidden=name==='landing';document.body.classList.toggle('in-battle',name==='battle');window.scrollTo(0,0)}
function tone(freq,duration=0.1,type='sine',volume=.08){if(!soundOn)return;try{audioCtx=audioCtx||new(window.AudioContext||window.webkitAudioContext)();const osc=audioCtx.createOscillator(),gain=audioCtx.createGain();osc.type=type;osc.frequency.setValueAtTime(freq,audioCtx.currentTime);gain.gain.setValueAtTime(volume,audioCtx.currentTime);gain.gain.exponentialRampToValueAtTime(.001,audioCtx.currentTime+duration);osc.connect(gain);gain.connect(audioCtx.destination);osc.start();osc.stop(audioCtx.currentTime+duration)}catch(_){}}
function playFx(fx){if(!fx||fx.id===lastFx)return;lastFx=fx.id;const d=fx.results||[];const bad=d.some(x=>x.delta<0);tone(bad?125:fx.kind==='heal'?650:480,bad?.18:.13,bad?'sawtooth':'sine');if(bad)setTimeout(()=>tone(75,.1,'triangle',.045),65);for(const change of d){const card=document.querySelector('[data-seat="'+change.seat+'"]');if(card){card.classList.remove('lan-hit','lan-heal','lan-block');void card.offsetWidth;card.classList.add(change.delta<0?'lan-hit':change.delta>0?'lan-heal':'lan-block');const popup=el('span','damage-pop',change.delta?String(change.delta):change.shield?'🛡 +'+change.shield:'✦');card.append(popup);setTimeout(()=>{popup.remove();card.classList.remove('lan-hit','lan-heal','lan-block')},850)}}}
function clock(){if(!deadline)return;const seconds=Math.max(0,Math.ceil((deadline-Date.now())/1000));$('turn-clock').textContent=seconds+'s';$('turn-clock').classList.toggle('urgent',seconds<=10);if(seconds===0&&(role==='host'||role==='solo')&&game?.phase==='playing'){if(Core.expireTurn(game)){broadcast()}}}
function setClock(ms){deadline=Date.now()+Math.max(0,ms||0);clock()}
function stopClock(){if(clockTimer)clearInterval(clockTimer);clockTimer=null;deadline=0}
function startClock(){if(!clockTimer)clockTimer=setInterval(clock,220)}

function el(tag,cls,txt){const n=document.createElement(tag);n.className=cls||'';if(txt!=null)n.textContent=String(txt);return n}
function btn(text,onclick,disabled=false){const b=el('button','btn btn-outline',text);b.type='button';b.disabled=disabled;b.onclick=onclick;return b}
function parseDeck(){try{const d=JSON.parse(localStorage.getItem(KEY));return Core.validateDeck(d).valid?d:Core.defaultDeck()}catch(_){return Core.defaultDeck()}}
function saveDeck(){try{localStorage.setItem(KEY,JSON.stringify(deck))}catch(_){}}
function renderDeck(){
 const list=$('deck-cards');list.replaceChildren();const counts={};
 deck.forEach(id=>counts[id]=(counts[id]||0)+1);
 for(const [id,c] of Object.entries(Core.CARDS)){
  const line=el('div','deck-row');line.append(el('span','',c.icon+' '+c.name+' · '+c.desc));
  const ctrl=el('div','deck-actions');
  ctrl.append(btn('−',()=>{const i=deck.indexOf(id);if(i>=0){deck.splice(i,1);saveDeck();renderDeck()}},!(counts[id]>0)));
  ctrl.append(el('strong','',counts[id]||0));
  ctrl.append(btn('+',()=>{if(deck.length<Core.DECK_SIZE&&(counts[id]||0)<Core.MAX_COPIES){deck.push(id);saveDeck();renderDeck()}},deck.length>=Core.DECK_SIZE||(counts[id]||0)>=Core.MAX_COPIES));
  line.append(ctrl);list.append(line);
 }
 const ok=Core.validateDeck(deck);$('deck-summary').textContent=deck.length+'/22 张 · '+(ok.valid?'可以出战':ok.reason);
}
function validDeck(){const ok=Core.validateDeck(deck);if(ok.valid)return true;msg(ok.reason);$('deck-editor').hidden=false;renderDeck();return false}
function showMode(n){
 mode=n;
 document.querySelectorAll('[data-mode]').forEach(b=>b.classList.toggle('selected',Number(b.dataset.mode)===n));
 $('mode-description').textContent=n===1?'单人挑战 AI · 不需要 Wi-Fi':n===2?'双人同 Wi-Fi 卡牌单挑':'三人同 Wi-Fi 自由混战';
}
function send(to,data){Native.send(to,JSON.stringify(data))}
function host() {
 if(!validDeck())return;
 if(mode===1){
  Native.close();role='solo';seat=0;people=[{name:safeName($('nickname').value)},{name:'星火AI'}];
  decks={0:deck.slice(),1:Core.defaultDeck()};begin();return;
 }
 role='host';seat=0;Native.create(mode);
 people=[{name:safeName($('nickname').value)}];seats={};decks={0:deck.slice()};matchNo=0;
 show('lobby');lobby();msg('正在创建局域网房间…');
}
function join() {
 if(!validDeck())return;
 const ip=$('join-code').value.trim();
 role='guest';seat=-1;people=[];decks={};seats={};
 Native.join(ip);show('lobby');lobby();msg('正在连接房主 '+ip+'…');
}
function lobby(){
 $('lobby-code').textContent=role==='host'?Native.address():'等待房主';
 $('room-share').textContent=role==='host'?Native.address():'等待房主';
 $('lobby-count').textContent=people.filter(Boolean).length+' / '+(role==='guest'?'?':mode);
 $('lobby-players').replaceChildren();
 for(let i=0;i<(role==='guest'?(people.length||3):mode);i++){
  const p=people[i];$('lobby-players').append(el('div','lobby-seat'+(p?' ready':''),'座位 '+(i+1)+' · '+(p?p.name:'等待玩家加入…')));
 }
 $('start-match').hidden=role!=='host';
 $('start-match').disabled=role!=='host'||people.filter(Boolean).length!==mode;
 $('wait-for-host').hidden=role==='host';
 $('lobby-hint').textContent=people.filter(Boolean).length===mode?'人数齐了，可以开始':'请保持本应用打开并连接同一个 Wi-Fi';
}
function announce(){
 if(role!=='host')return;
 const names=Array.from({length:mode},(_,i)=>people[i]?.name||'等待中');
 for(let i=1;i<mode;i++)send(i,{type:'lobby',names,size:mode});
 lobby();
}
function begin(){
 if(role==='host'&&people.filter(Boolean).length!==mode)return;
 if(aiTimer)clearTimeout(aiTimer);aiTimer=null;
 const size=role==='solo'?2:mode;
 game=Core.createMatch(Array.from({length:size},(_,i)=>people[i].name),Math.random,Array.from({length:size},(_,i)=>decks[i]));
 matchNo++;lastNo=0;
 show('battle');broadcast();
}
function broadcast(){
 if(!game||!(role==='host'||role==='solo'))return;
 if(game.phase==='playing'&&Core.expireTurn(game)){/* overdue turn advanced by host */}
 for(let i=0;i<game.players.length;i++){
  const d={...Core.snapshot(game,i),matchNo};
  if(i===0){viewState=d;renderBattle(d);}
  else if(role==='host')send(i,d);
 }
 if(role==='solo'&&game.phase==='playing'&&game.turn===1){
  if(aiTimer)clearTimeout(aiTimer);
  aiTimer=setTimeout(()=>{
   if(game?.phase==='playing'&&game.turn===1)action(1,Core.chooseAiAction(game,1));
  },650);
 }
}
function action(who,a){
 if(!game)return;
 const result=Core.applyAction(game,who,a);
 if(result.timedOut){broadcast();return;}
 if(!result.ok){if(who===0)msg(result.reason);else send(who,{type:'notice',text:result.reason});return}
 clearMsg();broadcast();
}
function take(a){
 if(!viewState||viewState.phase!=='playing'||viewState.turn!==seat)return;
 if(role==='guest')send(0,{type:'action',action:a});
 else action(0,a);
}
function renderBattle(s){
 show('battle');
 $('battle-round').textContent='第 '+s.round+' 轮';
 setClock(s.remainingMs);startClock();
 const playing=s.phase==='playing'&&s.turn===seat;
 $('turn-heading').textContent=s.phase==='finished'?(s.winner===seat?'🏆 你赢了！':'获胜者：'+(s.players[s.winner]?.name||'平局')):(playing?'✨ 轮到你出牌':(s.players[seat]?.alive?'等待 '+s.players[s.turn].name+' 出牌':'你已出局，继续观战'));
 $('turn-subtitle').textContent=playing?'先选攻击目标，再点手牌':'房主负责判定战况，实时同步';
 const targets=s.players.filter(p=>p.alive&&p.seat!==seat);if(!targets.some(p=>p.seat===target))target=targets[0]?.seat??null;
 const arena=$('player-arena');arena.replaceChildren();
 s.players.forEach(p=>{
  const card=el('article','fighter'+(p.seat===seat?' own':'')+(p.seat===target?' chosen':'')+(!p.alive?' eliminated':''));
  card.dataset.seat=p.seat;
  card.append(el('div','fighter-top',p.name+(p.seat===seat?'（你）':'')));
  card.append(el('div','hp-line','❤ '+p.hp+'/36 · 🛡 '+p.shield));
  const bar=el('div','health-track'),fill=el('div','health-fill');fill.style.width=(p.hp/36*100)+'%';bar.append(fill);card.append(bar);
  card.append(el('div','fighter-meta','手牌 '+p.cards+' · 牌库 '+p.deck));
  if(p.seat!==seat&&p.alive)card.append(btn(p.seat===target?'✓ 当前目标':'选择攻击目标',()=>{target=p.seat;renderBattle(viewState)},!playing));
  arena.append(card);
 });
 $('mana-display').textContent='⚡ '+s.mana+' 能量';
 $('hand-count').textContent=s.hand.length;
 $('hand-prompt').textContent=playing?'你可以打牌，也可以结束回合':'等待当前玩家操作';
 const hand=$('hand-cards');hand.replaceChildren();
 s.hand.forEach(c=>{
  const r=Core.CARDS[c.id];if(!r)return;
  const b=el('button','playing-card '+(r.target?'attack-card':'support-card'));
  b.append(el('span','card-cost','⚡ '+r.cost),el('span','card-symbol',r.icon),el('strong','card-name',r.name),el('span','card-description',r.desc));
  b.disabled=!playing||r.cost>s.mana||(r.target&&target==null);
  b.onclick=()=>{b.disabled=true;take({kind:'play',uid:c.uid,target:r.target?target:undefined})};
  hand.append(b);
 });
 $('end-turn').disabled=!playing;
 $('battle-log').replaceChildren(...s.log.slice(-9).reverse().map(l=>el('li','',l)));
 $('rematch').hidden=role==='guest'||s.phase!=='finished';
 $('rematch').disabled=role==='host'&&people.filter(Boolean).length!==mode;
 $('rematch-hint').hidden=s.phase!=='finished';
 playFx(s.lastEffect);
}
window.onNativeLan=function(json){
 let ev;try{ev=JSON.parse(json)}catch(_){return}
 const type=ev.kind,data=ev.payload,from=ev.seat;
 if(type==='error'){msg(data);return}
 if(type==='listening'){msg('房间已创建！房主 IP：'+data);lobby();return}
 if(type==='connected'){msg('已连接房主，正在等待席位…');return}
 if(type==='joined'&&role==='host'){
  msg('好友已加入座位 '+(from+1));
  announce();return;
 }
 if(type==='left'){
  if(role==='guest'){msg('房主已离线，请返回主页重新加入。');return}
  if(role==='host'){
   people[from]=null;decks[from]=null;
   if(game&&game.phase==='playing'){Core.forfeit(game,from);broadcast();}
   else announce();
  }
  return;
 }
 if(type!=='message')return;
 let packet;try{packet=JSON.parse(data)}catch(_){return}
 if(role==='host'&&from>0){
  if(packet.type==='hello'){
   const checked=Core.validateDeck(packet.deck);
   if(!checked.valid){send(from,{type:'notice',text:'卡组无效：'+checked.reason});return}
   people[from]={name:safeName(packet.name)};decks[from]=packet.deck.slice();
   announce();return;
  }
  if(packet.type==='action'&&game)action(from,packet.action);
 }else if(role==='guest'){
  if(packet.kind==='welcome'){seat=packet.seat;send(0,{type:'hello',name:safeName($('nickname').value),deck:deck.slice()});msg('已加入座位 '+(seat+1));return}
  if(packet.type==='lobby'){
   mode=packet.size===2?2:3;
   people=packet.names.map(n=>n==='等待中'?null:{name:n});lobby();return;
  }
  if(packet.type==='notice'){msg(packet.text);return}
  if(packet.type==='state'){
   if(packet.you!==seat||packet.matchNo<lastNo)return;
   if(packet.matchNo>lastNo){lastNo=packet.matchNo;viewState=null}
   if(viewState&&packet.seq<=viewState.seq)return;
   viewState=packet;renderBattle(packet);
  }
 }
};
function exit(){
 if(aiTimer)clearTimeout(aiTimer);stopClock();Native.close();
 game=null;viewState=null;people=[];role='solo';seat=0;target=null;show('landing');clearMsg();
}
window.confirmExitLan=()=>{if(!confirm('确定离开当前房间并返回主菜单？'))return;exit()};
window.forceExitLan=()=>exit();
function init(){
 deck=parseDeck();
 document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>showMode(Number(b.dataset.mode)));
 showMode(1);
 $('deck-toggle').onclick=()=>{$('deck-editor').hidden=!$('deck-editor').hidden;renderDeck()};
 $('deck-reset').onclick=()=>{deck=Core.defaultDeck();saveDeck();renderDeck()};
 $('create-room').onclick=host;$('join-room').onclick=join;
 $('start-match').onclick=begin;
 $('end-turn').onclick=()=>take({kind:'end'});
 $('leave-room').onclick=window.confirmExitLan;
 $('battle-exit').onclick=window.confirmExitLan;
 $('sound-toggle').onclick=()=>{soundOn=!soundOn;$('sound-toggle').textContent=soundOn?'🔊':'🔇';if(soundOn)tone(600)};
 $('rematch').onclick=()=>{game=null;begin()};
 $('dismiss-status').onclick=clearMsg;
 $('copy-invite').onclick=()=>{const ip=Native.address();if(navigator.clipboard?.writeText)navigator.clipboard.writeText(ip).then(()=>msg('已复制房主 IP'));else msg('房主 IP：'+ip)};
 $('site-label').textContent='离线局域网 · 免登录';
 $('join-message').textContent='双人/三人需同一 Wi-Fi；房主建房后，朋友输入房主 IP。端口 38643。';
 $('join-code').placeholder='房主 IP，如 192.168.1.2';$('join-code').maxLength=15;
 show('landing');
}
document.addEventListener('DOMContentLoaded',init);
})();