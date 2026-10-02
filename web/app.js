import { cardValue, progressiveCardValue, fixedCardValues } from './card-values.mjs';
import { mapPieces, inspectPiece, unitInfoHTML } from './unit-info.mjs';
import { createFigurePlacement } from './figure-placement.mjs';
import { maxAttackDice, armyExperience, experienceBadges } from './experience.mjs';
import { buildingPanel } from './building-panel.mjs';
import { rulesTabsHTML, bindRulesTabs } from './rules.mjs';
import { buildingInfo, buildingDescription, mapBuilding, buildingArtworkTroops } from './buildings.mjs';
import { startScreenMarkup, bindStartScreen } from './start-screen.mjs';
import { createMobileHUD } from './mobile-hud.mjs';
import { maxDefenseDice, selectedDice, botController, attackRollRevealed, waitForDice } from './combat-ui.mjs';
import { frameBatch, armyLayer, viewportLayer, clampCamera, cameraViewBox, markerScale, setAttributeChanged, setTextChanged } from './rendering.mjs';
import { initAtlas, continentColors } from './atlas.mjs';
import { initTerrain, terrainDetail, terrainViewportItems, updateSettlementBanners } from './terrain.mjs';
import { roomCodeFromHash, loadRoom, restoredView } from './resume.mjs';
import { createAutoCombat, automaticDefenseDice } from './auto-combat.mjs';
import { createSoundPlayer, bindSoundLifecycle } from './sound-effects.mjs';
import { symbols, battleCasualties, playerBanner, battleScene, artilleryShots, artilleryEffects, cannonFlightMs } from './figures.mjs';
import { renderStatisticsChart, clearStatisticsChart } from './statistics.mjs';
import { playerStatisticsHTML } from './player-statistics.mjs';
import { countryBanner } from './country-banners.mjs';
import { createBattleIntro, renderAttackRoute } from './battle-intro.mjs';
import { controlledContinents, continentSelection } from './continents.mjs';

// Frame restores can deliver the module while the HTML parser is rebuilding.
if(document.readyState==='loading')await new Promise(resolve=>document.addEventListener('DOMContentLoaded',resolve,{once:true}));

const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const escapeHTML = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const colors = ['#b84e40','#477ca0','#b59036','#6c8753','#896b91','#ad7350','#414e4b'];
const kindNames = {infantry:'Infanterie',cavalry:'Kavallerie',artillery:'Artillerie',wild:'Joker'};
const icon = (kind, cls='') => `<svg class="${cls}" viewBox="0 0 25 30" aria-hidden="true" fill="currentColor">${symbols[kind] || symbols.infantry}</svg>`;
let board, terrainData, boardCatalog={}, boardInitialized=false, state = null, selected = 0, target = 0, diceChoice = 3, defenseChoice = 3, amount = 1;
let connectionEpoch=0;
let autoDefenseDraft=null,autoDefenseSaving=false;
let stream, roomCode = '', busy = false, animating = false, queued = [], lastBattle = 0, lastAttackRoll = 0;
let placing=false, placementQueue=[];
let cameraMotion=0, battleFocus='', battleFocusAnimation=null;
let attackIntro=null,combatRoute=null;
let combatCompact=readCombatCompact();
function readCombatCompact(){try{return localStorage.getItem('dom-combat-compact')==='on';}catch{return false;}}
let chosenCards = [], camera = {zoom:1,x:0,y:0}, drag = null, pointers = new Map(), dragMoved = false;
let inspectedUnit=null;
const figurePlacement=createFigurePlacement({getGame:()=>state,send:(...args)=>act(...args),render:()=>renderUnits()});
let mapCamera, mapHint, armies, mapDetails, markerRoot, pixelsPerUnit = 1, lastMarkerScale, pieceDrag=null;
const territoryNodes = new Map();
const bannerCountries = new Map();
const continentFocus = continentSelection(updateContinentHighlight);
const cameraFrame = frameBatch(commitCamera);
let cameraIdle;
let soundEnabled = localStorage.getItem('dom-sound') !== 'off';
let toastTimer;
let viewport={width:800,height:500},refreshMapLayout=()=>{};
const mobileHUD=createMobileHUD();
const fullscreenMap=()=>mobileHUD.active||document.body.classList.contains('start-screen');
function syncMobileHUD(){
  const wasStart=document.body.classList.contains('start-screen');
  mobileHUD.update({game:state,selected,target,countries:board?.countries||[]});
  const start=!state||state.phase==='lobby';
  document.body.classList.toggle('start-screen',start);
  document.body.classList.toggle('lobby-screen',state?.phase==='lobby');
  if(start!==wasStart)requestAnimationFrame(()=>{cameraMotion++;refreshMapLayout();camera=overviewCamera();applyCamera();});
}
function minimumZoom(){const i=viewport.insets||{};return Math.min((viewport.width-(i.left||0)-(i.right||0))/800,(viewport.height-(i.top||0)-(i.bottom||0))/500);}
function overviewCamera(){return fullscreenMap()?fitMapBounds(0,0,800,500,1):{zoom:1,x:0,y:0};}
function cameraBounds(){
  if(!fullscreenMap())return {x:40,y:40,width:720,height:400};
  const frame=$('#world').getBoundingClientRect(),scale=frame.width/viewport.width;
  if(document.body.classList.contains('start-screen')){
    const panel=$('#sidebar').getBoundingClientRect(),wide=matchMedia('(min-width:760px), (orientation:landscape) and (max-height:600px)').matches;
    return wide?{x:24/scale,y:104/scale,width:Math.max(100,(panel.left-frame.left-48)/scale),height:Math.max(80,(frame.height-140)/scale)}:{x:16/scale,y:86/scale,width:Math.max(100,(frame.width-32)/scale),height:Math.max(60,(panel.top-frame.top-104)/scale)};
  }
  const landscape=frame.width>=760||frame.width>frame.height&&frame.height<600;
  return landscape?{x:35/scale,y:105/scale,width:Math.max(100,(frame.width-415)/scale),height:Math.max(80,(frame.height-170)/scale)}:{x:30/scale,y:125/scale,width:Math.max(100,(frame.width-75)/scale),height:Math.max(80,(frame.height-365)/scale)};
}
function fitMapBounds(x,y,width,height,max=3){const area=cameraBounds(),zoom=Math.min(max,area.width/Math.max(width,1),area.height/Math.max(height,1));return clampCamera({zoom,x:area.x+area.width/2-(x+width/2)*zoom,y:area.y+area.height/2-(y+height/2)*zoom},board.maxZoom||6,viewport);}
let diceContexts=['',''];
let serverConfig={}, draftPlayers=[], lobbyPlayerDraft={kind:'human',name:''};
const soundPlayer = createSoundPlayer({enabled:soundEnabled,onStatus:updateSound});
function sound(name) { soundPlayer.play(name); }

function toast(message) { const el=$('#toast'); el.textContent=message;el.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.hidden=true,4800); }
const country = id => board.countries[id-1];
const own = id => state && id>0 && state.territories[id-1].owner===state.me;
const isHost = () => state && (state.controller ?? state.me)===0;
const meActing = () => state && !state.paused && state.actor===state.me;
const phaseNames = {lobby:'Wartezimmer',claim:'Gebiete wählen',capital:'Hauptstadt wählen',setup:'Armeen aufstellen',reinforce:'Verstärkung',attack:'Angriff',defend:'Verteidigung',occupy:'Gebiet erobert',fortify:'Truppen bewegen',finished:'Partie beendet.'};
const displayColor = i => state?.players[i]?.neutral ? colors[6] : (i<6?colors[i]:`hsl(${(i*137.508)%360} 43% 40%)`);
const autoCombat = createAutoCombat({
  getState:()=>state,country,canAct:()=>!busy&&!animating&&!state?.paused,act,
  onChange:()=>{ $('#stop-auto-overlay').hidden=!autoCombat.active;if(state)renderSidebar(); },
  onStop:toast,
});
function stopAutoCombat(){
  autoCombat.stop();
  toast('Automatik gestoppt. Ein bereits geworfener Angriff wird noch ausgewertet.');
}
$('#stop-auto-overlay').onclick=stopAutoCombat;
async function api(path, body, signal) {
  const r=await fetch(path,{method:body?'POST':'GET',credentials:'same-origin',cache:'no-store',signal,headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});
  let data;try{data=await r.json();}catch{const e=new Error(r.redirected?'Bitte erneut über Cloudflare anmelden.':'Der Server antwortet nicht. Bitte Verbindung prüfen.');e.authRequired=r.redirected;throw e;}
  if(!r.ok){const e=new Error(data.error || 'Anfrage fehlgeschlagen.');e.status=r.status;e.authRequired=data.authRequired;throw e;}return data;
}
async function act(type,extra={}) {
  if(busy||(animating&&!['autodefense','pause'].includes(type))||(state?.paused&&!['pause','autodefense'].includes(type)))return false;busy=true;const epoch=connectionEpoch;
  try { const next=await api(`/api/rooms/${roomCode}/actions`,{type,revision:state.revision,actingAs:state.me,...extra});if(epoch!==connectionEpoch)return false;receive(next);return true; }
  catch(e){if(e.status===410){if(epoch===connectionEpoch)roomClosed(roomCode);return false;}toast(e.message);try{const next=await api(`/api/rooms/${roomCode}`);if(epoch===connectionEpoch)receive(next);}catch{}return false;}
  finally{busy=false;}
}
function advancePhase() {
  if(busy||animating||!state||state.paused||!meActing())return;
  if(state.phase!=='fortify'||state.conquered)return act('next');
  const {code,revision,me}=state,epoch=connectionEpoch;
  openModal('Zug ohne Eroberung beenden?', '<p>Du hast in diesem Zug kein Land erobert. Deshalb erhältst du <strong>keine Gebietskarte</strong>. Möchtest du den Zug trotzdem beenden?</p><div class="modal-actions turn-confirm-actions"><button class="primary" id="cancel-end-turn">Abbrechen</button><button class="secondary" id="confirm-end-turn">Trotzdem beenden</button></div>');
  $('#cancel-end-turn').onclick=()=>$('#modal').close();
  $('#confirm-end-turn').onclick=async e=>{
    if(busy||animating)return;
    // A delayed confirmation must never end another turn or a newer game state.
    if(epoch!==connectionEpoch||!state||state.code!==code||state.revision!==revision||state.me!==me||state.phase!=='fortify'||state.paused||!meActing()){
      $('#modal').close();toast('Der Spielstand hat sich geändert. Bitte prüfe deinen Zug erneut.');return;
    }
    e.currentTarget.disabled=true;$('#modal').close();await act('next');
  };
  $('#cancel-end-turn').focus();
}
function connect(next) {
  saveView();
  resetLiveView();battleFocus='';selected=0;target=0;amount=1;diceChoice=3;defenseChoice=3;diceContexts=['',''];
  $('#reconnect').hidden=false;
  if((board.id||'classic')!==(next.map||'classic')){state=null;selected=0;target=0;setBoard(next.map||'classic');}
  roomCode=next.code;localStorage.setItem('dom-room',roomCode);history.replaceState(null,'',`/#${roomCode}`);
  lastBattle=next.battle?.id||0;lastAttackRoll=next.pending?.id||0;state=null;restoreView(next);receive(next);stream?.close();
  stream=new EventSource(`/api/rooms/${roomCode}/events`);
  stream.onmessage=e=>receive(JSON.parse(e.data));
  stream.onopen=()=>{const el=$('#connection');el.hidden=false;el.textContent='Verbunden';el.classList.remove('offline');};
  stream.addEventListener('replaced',()=>{autoCombat.stop();stream.close();const el=$('#connection');el.hidden=false;el.textContent='In anderem Tab aktiv';el.classList.add('offline');toast('Diese Partie ist in zwei neueren Tabs geöffnet. Klicke auf Neu verbinden, um hier weiterzuspielen.');});
  stream.addEventListener('removed',removedFromGame);
  stream.addEventListener('closed',()=>roomClosed(next.code));
  stream.addEventListener('auth-expired',()=>{autoCombat.stop();stream.close();$('#connection').textContent='Anmeldung abgelaufen';$('#connection').classList.add('offline');toast('Deine Anmeldung ist abgelaufen. Klicke auf Neu verbinden.');});
  stream.onerror=()=>{autoCombat.stop('Automatik gestoppt: Die Verbindung wurde unterbrochen.');const el=$('#connection');el.hidden=false;el.textContent='Verbinde erneut …';el.classList.add('offline');};
}
function saveView(){
  if(!state)return;
  try{sessionStorage.setItem('dom-view',JSON.stringify({code:state.code,me:state.me,map:state.map||'classic',revision:state.revision,camera,selected,target,amount,diceChoice,defenseChoice,battleFocus}));}catch{}
}
function restoreView(next){
  let saved;try{saved=JSON.parse(sessionStorage.getItem('dom-view'));}catch{return;}
  const view=restoredView(saved,next,board,viewport);if(!view)return;
  camera=view.camera;applyCamera();
  if(view.selected!==undefined){selected=view.selected;target=view.target;amount=view.amount;diceChoice=view.diceChoice;defenseChoice=view.defenseChoice;}
  battleFocus=view.battleFocus||'';
}
addEventListener('pagehide',()=>{saveView();autoCombat.stop();});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')saveView();});
function fetchRoom(code){
  return loadRoom(async()=>{
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
    try{return await api(`/api/rooms/${code}`,undefined,controller.signal);}finally{clearTimeout(timer);}
  });
}
async function resumeFromLink(code){
  $('#room-label').textContent=`PARTIE ${code}`;
  $('#board-title').textContent='Deine Partie wird fortgesetzt.';
  $('#sidebar').innerHTML='<div class="panel loading" role="status">Dein Spielerplatz und Spielstand werden geladen …</div>';
  try{connect(await fetchRoom(code));}
  catch(e){
    if(e.status===410){roomClosed(code);return;}
    if(e.status===401&&!e.authRequired){renderHome();toast('Öffne die Partie mit derselben Cloudflare-E-Mail oder im bisherigen Browser.');return;}
    $('#sidebar').innerHTML=`<div class="panel"><span class="eyebrow">PARTIE ${code}</span><h2>${e.authRequired?'Bitte erneut anmelden.':'Partie noch nicht verbunden.'}</h2><p>${escapeHTML(e.message)}</p><button class="primary" id="retry-room">${e.authRequired?'Anmelden und fortsetzen':'Erneut verbinden'}</button><a class="text-link" href="/">Zur Startseite</a></div>`;
    $('#retry-room').onclick=()=>e.authRequired?location.reload():resumeFromLink(code);
  }
}
function resetLiveView(){
  inspectedUnit=null;autoDefenseDraft=null;autoDefenseSaving=false;
  autoCombat.stop();
  connectionEpoch++;cameraMotion++;battleFocusAnimation=null;queued=[];animating=false;placementQueue=[];
  battleIntro.cancel();
  cancelPieceDrag();hideBattlefield();$('#combat-scene').innerHTML='';$('#combat-scene').hidden=true;$('#combat-scene').dataset.key='';
}
function removedFromGame(){
  stream?.close();resetLiveView();state=null;selected=0;target=0;
  if(localStorage.getItem('dom-room')===roomCode)localStorage.removeItem('dom-room');
  roomCode='';history.replaceState(null,'',location.pathname);$('#modal').close();
  $('#connection').hidden=true;$('#reconnect').hidden=true;render();
  openModal('Aus der Partie entfernt.', '<p>Der Gastgeber hat dich aus dieser Partie entfernt. Du kannst eine neue Partie erstellen oder einer anderen beitreten.</p>');
}
async function reconnect(code=roomCode){
  if(!code)return;
  autoCombat.stop();
  const button=$('#reconnect');button.disabled=true;
  try{connect(await fetchRoom(code));toast('Wieder verbunden.');}
  catch(e){if(e.status===410){roomClosed(code);return;}if(e.authRequired||e instanceof TypeError){location.reload();return;}if(e.status===403&&code===roomCode){removedFromGame();return;}toast(e.message);}
  finally{button.disabled=false;}
}
$('#reconnect').onclick=()=>reconnect();
function roomClosed(code,notify=true){
  if(!code)return;
  if(localStorage.getItem('dom-room')===code)localStorage.removeItem('dom-room');
  try{if(JSON.parse(sessionStorage.getItem('dom-view'))?.code===code)sessionStorage.removeItem('dom-view');}catch{}
  const current=roomCode===code||roomCodeFromHash(location.hash)===code;
  if(current){
    stream?.close();resetLiveView();state=null;selected=0;target=0;roomCode='';battleFocus='';
    history.replaceState(null,'',location.pathname);$('#modal').close();
    $('#connection').hidden=true;$('#reconnect').hidden=true;render();
    if(notify)openModal('Partie beendet.', '<p>Der Gastgeber hat diese Partie beendet und aus der Übersicht entfernt. Du kannst eine neue Partie erstellen oder einer anderen beitreten.</p>');
  }else loadMyRooms();
}
function confirmCloseRoom(code){
  openModal(`Partie ${code} entfernen?`, '<p>Damit beendest du die Partie für alle Mitspieler und entfernst sie aus „Deine Partien“. Auch die Bots hören auf zu spielen.</p><div class="modal-actions"><button class="primary red" id="confirm-close-room">Beenden und entfernen</button><button class="secondary" id="cancel-close-room">Abbrechen</button></div>');
  $('#cancel-close-room').onclick=()=>$('#modal').close();
  $('#confirm-close-room').onclick=async e=>{
    const button=e.currentTarget;button.disabled=true;
    try{
      await api(`/api/rooms/${code}/close`,{});
      roomClosed(code,false);$('#modal').close();toast('Partie beendet und entfernt.');
    }catch(error){
      if(error.status===410||error.status===404){roomClosed(code,false);$('#modal').close();toast('Diese Partie ist bereits entfernt.');}
      else toast(error.message);
    }finally{button.disabled=false;}
  };
}
async function loadMyRooms(){
  const el=$('#saved-games');if(!el||!serverConfig.email)return;
  try{
    const rooms=await api('/api/rooms');if(!el.isConnected)return;
    el.innerHTML=`<span class="eyebrow">DEINE PARTIEN</span><p class="account-email">Angemeldet als <strong>${escapeHTML(serverConfig.email)}</strong></p>${rooms.length?rooms.map(r=>`<div class="saved-room-row"><button class="saved-room" data-resume="${r.code}"><span><strong>${r.code} · ${escapeHTML(r.name)}</strong><small>${escapeHTML(boardCatalog[r.map]?.name||'Klassische Welt')} · ${phaseNames[r.phase]||''}${r.round?' · Runde '+r.round:''}</small></span><span>Fortsetzen →</span></button>${r.canClose?`<button class="saved-room-close" data-close-room="${r.code}" aria-label="Partie ${r.code} beenden und entfernen">${['lobby','finished'].includes(r.phase)?'Löschen':'Beenden'}</button>`:''}</div>`).join(''):'<p class="fine">Deine Partien erscheinen hier automatisch. Für eine ältere Partie öffne sie einmal im bisherigen Browser.</p>'}`;
    $$('[data-resume]',el).forEach(b=>b.onclick=()=>reconnect(b.dataset.resume));
    $$('[data-close-room]',el).forEach(b=>b.onclick=()=>confirmCloseRoom(b.dataset.closeRoom));
  }catch(e){if(el.isConnected)el.innerHTML=`<p class="fine">${escapeHTML(e.message)}</p><button id="reload-games" class="secondary">Erneut laden</button>`;$('#reload-games')?.addEventListener('click',loadMyRooms);}
}
function managePlayers(){
  if(!state||!isHost())return;
  openModal('Spieler verwalten',`<p>Benenne Bots und Menschen an diesem Gerät. ${state.phase==='lobby'?'Entfernte Mitspieler können dieser Partie nicht erneut beitreten.':'Wenn du einen Mitspieler entfernst, übernimmt der Strategie-Bot seine Armee.'}</p><div class="manage-list">${state.players.map((p,i)=>!i||p.neutral?'':`<div class="manage-row"><span>${escapeHTML(p.name)}${p.bot?' · KI':p.local?' · dieses Gerät':''}</span><div class="manage-actions">${p.bot||p.local?`<button class="secondary" data-rename-bot="${i}" aria-label="${escapeHTML(p.name)} umbenennen">Name ändern</button>`:''}${!p.bot||state.phase==='lobby'?`<button class="secondary" data-kick="${i}">Entfernen</button>`:''}</div></div>`).join('')||'<p>Noch keine Mitspieler.</p>'}</div><div class="room-close-section"><button class="secondary danger-text" id="close-current-room">Partie beenden und entfernen</button></div>`);
  $('#close-current-room').onclick=()=>confirmCloseRoom(state.code);
  $$('[data-rename-bot]').forEach(button=>button.onclick=()=>renameBot(+button.dataset.renameBot));
  $$('[data-kick]').forEach(button=>button.onclick=()=>{
    const player=+button.dataset.kick,p=state.players[player],type=p.bot?'removebot':'kick';
    openModal(`${p.name} entfernen?`,`<p>${state.phase==='lobby'?'Der Platz wird frei.':'Der Strategie-Bot übernimmt die Armee und spielt weiter.'} ${!p.bot&&!p.local?'Der Zugriff dieses Mitspielers auf die Partie wird gesperrt.':''}</p><div class="modal-actions"><button id="confirm-kick" class="primary">Jetzt entfernen</button><button id="cancel-kick" class="secondary">Abbrechen</button></div>`);
    $('#cancel-kick').onclick=managePlayers;
    $('#confirm-kick').onclick=async()=>{const b=$('#confirm-kick');if(!state||!isHost()||state.players[player]?.name!==p.name||state.players[player]?.bot!==p.bot){toast('Die Spielerliste hat sich geändert.');managePlayers();return;}b.disabled=true;if(await act(type,{player})){$('#modal').close();toast(`${p.name} wurde entfernt.`);}else{b.disabled=false;}};
  });
}
function renameBot(player){
  const p=state?.players[player];if(!isHost()||!(p?.bot||p?.local)||p.neutral)return;
  openModal('Spieler benennen',`<form id="rename-bot-form"><label for="bot-name">Name des Spielers</label><input id="bot-name" maxlength="24" autocomplete="off" value="${escapeHTML(p.name)}" required><div class="modal-actions"><button class="primary" type="submit">Namen speichern</button><button class="secondary" type="button" id="cancel-rename">Abbrechen</button></div></form>`);
  $('#bot-name').focus();$('#bot-name').select();$('#cancel-rename').onclick=()=>$('#modal').close();
  $('#rename-bot-form').onsubmit=async e=>{
    e.preventDefault();
    if(!isHost()||state.players[player]?.name!==p.name||state.players[player]?.bot!==p.bot){toast('Die Spielerliste hat sich geändert.');managePlayers();return;}
    await withForm(e.currentTarget,async()=>{if(await act(p.local?'renamelocal':'renamebot',{player,name:$('#bot-name').value.trim()})){$('#modal').close();toast('Spielername gespeichert.');}});
  };
}
function switchLocalPlayer(next){
  if(!state || state.me===next.me)return;
  chosenCards=[];placementQueue=[];autoDefenseDraft=null;selected=0;target=0;amount=1;diceContexts=['',''];
  $('#modal').close();autoCombat.stop();
  if(next.hotseat&&next.actor===next.me)toast(`${next.players[next.me].name} ist dran${next.phase==='defend'?' · Verteidigung':''}.`);
}
function receive(next) {
  if(next.revision<=(state?.revision||0))return;
  if(next.paused){
    // Pause messages bypass the animation queue. Already applied server rolls
    // remain applied, but every old animation continuation is invalidated.
    connectionEpoch++;cameraMotion++;battleFocusAnimation=null;queued=[];animating=false;placementQueue=[];
    battleIntro.cancel();
    cancelPieceDrag();soundPlayer.stop();
    if(!state?.paused){selected=0;target=0;}
    switchLocalPlayer(next);state=next;autoDefenseDraft=null;
    lastBattle=Math.max(lastBattle,next.battle?.id||0);
    lastAttackRoll=Math.max(lastAttackRoll,next.pending?.id||0);
    hideBattlefield();render();return;
  }
  if(animating){
    const latest=queued.at(-1);
    if(latest&&next.revision<=latest.revision)return;
    // Coalesce refreshes of the same step, but keep moves and phase changes
    // before later battles. Their troop counts must reach the next countdown.
    if(latest&&latest.phase===next.phase&&latest.battle?.id===next.battle?.id&&latest.pending?.id===next.pending?.id)queued[queued.length-1]=next;
    else queued.push(next);
    return;
  }
  if(state && next.battle && next.battle.id>lastBattle) {animateBattle(next);return;}
  cancelPieceDrag();
  const old=state;switchLocalPlayer(next);state=next;autoDefenseDraft=null;
  if((old&&old.turn!==next.turn)||['reinforce','fortify','finished'].includes(next.phase))battleFocus='';lastBattle=Math.max(lastBattle,next.battle?.id||0);
  const keepPlacementSelection=old?.phase==='setup'&&next.phase==='setup'&&next.territories[selected-1]?.owner===next.me;
  if(old && !keepPlacementSelection && (old.turn!==next.turn || old.phase!==next.phase && !['attack','occupy','defend'].includes(next.phase))) {selected=0;target=0;amount=1;}
  if(old?.phase==='fortify'&&next.phase==='attack'){selected=0;target=0;amount=1;}
  if(old?.phase==='occupy'&&next.phase==='attack'){selected=old.pending.to;target=0;}
  if(old && old.me===next.me && next.hand?.length>old.hand?.length && next.turn===next.me)sound('card');
  if(next.pending && ['defend','occupy'].includes(next.phase)) {selected=next.pending.from;target=next.pending.to;}
  if(next.phase==='occupy')amount=Math.max(next.pending.minimum,!old||old.phase==='occupy'?amount:0);
  const reveal=next.phase==='defend'&&next.pending?.attack?.length&&next.pending.id>lastAttackRoll;
  if(reveal)animating=true;
  render();
  const overview=old && (old.turn!==next.turn || next.phase==='reinforce' && next.resume!=='attack' && old.phase!=='reinforce')
    ? animateCamera(overviewCamera(),matchMedia('(prefers-reduced-motion: reduce)').matches) : null;
  if(reveal){animateAttackRoll(next,overview);return;}
  // Frame the declared attack before the defender chooses dice, also after reconnecting.
  if(next.pending && ['defend','occupy'].includes(next.phase)) {
    const epoch=connectionEpoch;
    Promise.resolve(overview).then(()=>{if(epoch===connectionEpoch&&state===next)focusBattle(country(next.pending.from),country(next.pending.to),matchMedia('(prefers-reduced-motion: reduce)').matches);});
  }
}
function render() {$('#choose-map').textContent=state?'Neue Partie · Karte wählen ↗':'Spielkarte wählen ↗';$('#choose-map').href=state?'/?choose-map=1':'#map-choice';renderPlayers();renderStatistics();renderMap();renderSidebar();renderHand();$('#room-label').innerHTML=state?`PARTIE <b>${state.code}</b> · ${state.rules==='classic'?'Klassisch':state.rules==='domination'?'Aufbau & Eroberung':'Bisherige Regeln'} &nbsp; · &nbsp; ${state.goal==='capital'?'Hauptstadt · ':state.goal==='mission'?'Mission · ':''}${state.mode==='fixed'?'Feste Kartenboni':'Steigende Kartenboni'}`:`${board.countries.length} Gebiete. Eine Welt.`;$('#round-label').textContent=state&&state.phase!=='lobby'?`RUNDE ${String(state.round).padStart(2,'0')} · ${state.paused?'PAUSIERT':phaseNames[state.phase].toUpperCase()}`:'DAS SPIELBRETT';$('#board-title').textContent=state?.paused?'Partie pausiert.':state?.phase==='finished'?`${state.players[state.winner].name} gewinnt.`:state?.phase==='lobby'?'Der Tisch ist bereit.':state?state.turn===state.me?'Dein nächster Zug.':`${state.players[state.actor].name} ist am Zug.`:'Die Welt liegt vor dir.';syncMobileHUD();refreshBuildingPanel();}
function renderStatistics(){
  const panel=$('#game-statistics');
  panel.hidden=state?.phase!=='finished';
  if(panel.hidden){clearStatisticsChart(panel);return;}
  renderStatisticsChart(panel,state);
}
function botPlayerDetail(p) {
  const info=botController(p);
  return '';
}
function renderPlayers() {
  renderAutoDefenseSettings();renderPauseControls();
  $('#players').innerHTML=state?state.players.map((p,i)=>`<div class="player ${p.neutral?'neutral-player':''} ${state.turn===i&&state.phase!=='lobby'?'active':''} ${!p.territories&&!['lobby','claim'].includes(state.phase)?'eliminated':''}" style="--player:${displayColor(i)}"><div class="player-name"><i class="player-color"></i>${escapeHTML(p.name)}${p.neutral?'<span class="you-tag neutral-tag">Neutral</span>':i===state.me?`<span class="you-tag">${state.hotseat?'Am Gerät':'Du'}</span>`:p.local||state.hotseat&&i===state.controller?`<span class="you-tag">${state.hotseat?'Am Gerät':'Beim Gastgeber'}</span>`:p.bot?`<span class="bot-tag">${botController(p).label}</span>`:''}</div><div class="player-stats"><span><strong>${p.territories}</strong> Gebiete</span><span><strong>${p.troops}</strong> Truppen</span>${!p.neutral?`<span>▱ ${p.cards}</span>`:''}</div>${playerContinents(i)}${botPlayerDetail(p)}</div>`).join('')+(isHost()&&state.phase!=='finished'?'<button id="manage-players" class="manage-players">Spieler verwalten</button>':''):'';
  $('#manage-players')?.addEventListener('click',managePlayers);
  for(const card of $$('.player',$('#players'))){
    const player=[...card.parentElement.querySelectorAll('.player')].indexOf(card);
    card.setAttribute('role','button');card.tabIndex=0;card.dataset.playerStatistics=player;
    card.setAttribute('aria-haspopup','dialog');card.setAttribute('aria-label',`${state.players[player].name}: Statistik und Verstärkungen ansehen`);
    card.insertAdjacentHTML('beforeend','<span class="player-statistics-link">Statistik &amp; Verstärkungen ↗</span>');
    card.addEventListener('click',()=>showPlayerStatistics(player));
    card.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();showPlayerStatistics(player);}});
  }
  refreshPlayerStatistics();
}
function showPlayerStatistics(player){
  if(!state?.players[player])return;
  openModal(`${state.players[player].name} · Statistik`,playerStatisticsHTML(state,board,player));
}
function refreshPlayerStatistics(){
  if(!$('#modal')?.open)return;
  const section=$('#modal .player-inspection');
  if(!section)return;
  const player=Number(section.dataset.statisticsPlayer);
  if(!state?.players[player]||state.code!==section.dataset.statisticsRoom){$('#modal').close();return;}
  const expanded=new Set($$('details[open]',section).map(node=>node.dataset.incomeRound));
  const focused=document.activeElement?.closest('[data-income-round]')?.dataset.incomeRound;
  const scroll=$('#modal').scrollTop;
  $('#modal-title').textContent=`${state.players[player].name} · Statistik`;
  $('#modal-content').innerHTML=playerStatisticsHTML(state,board,player,{expanded});
  if(focused)$(`#modal [data-income-round="${focused}"] summary`)?.focus({preventScroll:true});
  $('#modal').scrollTop=scroll;
}
function playerContinents(owner) {
  if(state.players[owner].neutral||state.phase==='lobby')return '';
  const owned=controlledContinents(board,state,owner);
  return `<div class="player-continents" aria-label="Vollständig eroberte Kontinente">${owned.length?owned.map(c=>`<span class="continent-badge" style="--continent:${continentColors[c.id-1]}" title="${escapeHTML(c.name)} vollständig erobert: +${c.bonus} Verstärkungen pro Runde">${escapeHTML(c.name)} <b>+${c.bonus}</b></span>`).join(''):'<span class="no-continents">Noch kein Kontinent</span>'}</div>`;
}
function initContinents() {
  $('#continent-borders').innerHTML=board.continents.map(c=>`<g data-continent-region="${c.id}"><path class="continent-border-halo" d="${c.outline}"/><path class="continent-border" d="${c.outline}"/></g>`).join('');
  $('#continent-labels').innerHTML=board.continents.map(c=>{
    const [x,y]=c.labelPosition;
    const lines=c.name==='Österreich-Ungarn'?['Österreich-','Ungarn']:c.name.includes(' ')?c.name.split(' '):[c.name];
    return `<g data-continent-label="${c.id}">${c.labelAnchor?`<path class="continent-leader" d="M${x} ${y}L${c.labelAnchor.join(' ')}"/>`:''}<g transform="translate(${x} ${y})"><text class="continent-name">${lines.map((line,i)=>`<tspan x="0" dy="${i?14:lines.length>1?-5:0}">${escapeHTML(line)}</tspan>`).join('')}</text></g></g>`;
  }).join('');
  $('#continents').innerHTML='<p class="continent-key-hint">Kontinente · darüberfahren zum Hervorheben · antippen zum Anzeigen</p>'+board.continents.map((c,i)=>`<button type="button" class="continent" data-continent="${c.id}" style="--continent:${continentColors[i]}" aria-pressed="false" aria-controls="world" aria-label="${escapeHTML(c.name)}, Bonus +${c.bonus}, auf der Karte hervorheben">${escapeHTML(c.name)}<b>+${c.bonus}</b></button>`).join('');
  for(const button of $$('[data-continent]',$('#continents'))){
    const id=+button.dataset.continent;
    button.addEventListener('pointerenter',e=>{if(e.pointerType!=='touch')continentFocus.hover(id);});
    button.addEventListener('pointerleave',()=>continentFocus.hover(0));
    button.addEventListener('focus',()=>continentFocus.focus(id));
    button.addEventListener('blur',()=>continentFocus.focus(0));
    button.addEventListener('click',()=>{continentFocus.toggle(id);if(button.getAttribute('aria-pressed')==='true'&&!animating){
      const [x,y,w,h]=board.continents.find(c=>c.id===id).bounds;
      cameraMotion++;camera=fitMapBounds(x-8,y-8,w+16,h+16);applyCamera();
      if(!fullscreenMap())$('#map-frame').scrollIntoView({block:'nearest',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
    }});
    button.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();continentFocus.clear();}});
  }
  continentFocus.clear();
}
function updateContinentHighlight(active,pinned) {
  const continent=board?.continents.find(c=>c.id===active);
  $('#continent-highlight').innerHTML=continent?`<path class="continent-highlight-fill" d="${continent.outline}"/><path class="continent-highlight-line" d="${continent.outline}"/>`:'';
  for(const button of $$('[data-continent]',$('#continents'))){button.classList.toggle('previewed',+button.dataset.continent===active);button.setAttribute('aria-pressed',String(+button.dataset.continent===pinned));}
  for(const label of $$('[data-continent-label]'))label.classList.toggle('highlighted',+label.dataset.continentLabel===active);
}
function setBoard(id){
  cameraMotion++;battleFocus='';
  board=boardCatalog[id];camera={zoom:1,x:0,y:0};selected=0;target=0;chosenCards=[];
  initBoard();if(fullscreenMap())camera=overviewCamera();applyCamera();
}
function seaRoutesMarkup(map) {
  return map.routes.map(([a,b])=>{
    const c=map.countries.find(c=>c.id===a),d=map.countries.find(c=>c.id===b),wrap=map.wrapRoute??[1,38];
    const path=map.routePaths?.[`${a}-${b}`]||(a===wrap[0]&&b===wrap[1]
      ?`M${c.x} ${c.y} Q22 59 -10 69 M${d.x} ${d.y} Q${map.width-30} 55 ${map.width+10} 69`
      :`M${c.x} ${c.y} Q${(c.x+d.x)/2+8} ${(c.y+d.y)/2-8} ${d.x} ${d.y}`);
    return `<path class="sea-route-halo" d="${escapeHTML(path)}"/><path class="sea-route" d="${escapeHTML(path)}"/>`;
  }).join('');
}
function initBoard() {
  initAtlas($('#world'),board);
  initTerrain($('#world'),terrainData[board.id],board);
  $('#world').classList.toggle('historical-map',!!board.artwork?.startsWith('historical-'));
  $('#world').classList.toggle('mini-world',board.id==='simple-world');
  if(!boardInitialized)$('defs', $('#world')).insertAdjacentHTML('beforeend',Object.entries(symbols).map(([kind,shape])=>`<g id="piece-${kind}">${shape}</g>`).join(''));
  $('#countries').innerHTML=board.countries.map(c=>`<g><path id="land-${c.id}" class="country" d="${c.path}" role="button" tabindex="0" aria-label="${escapeHTML(c.name)}" data-id="${c.id}"><title>${escapeHTML(c.name)}</title></path></g>`).join('');
  $('#markers').innerHTML=board.countries.map(c=>`<g class="marker ${c.small?'small-country':''}" id="marker-${c.id}" data-id="${c.id}" transform="translate(${c.x},${c.y})"><title class="marker-title"></title><g class="marker-ui"><g class="map-building" data-building-id="${c.id}" role="button" tabindex="-1" transform="translate(0 -27) scale(1.6)"></g><path class="capital-castle" d="M-19 7V-9h4v-5h4v7h4v-13h4v-4h6v4h4v13h4v-7h4v5h4V7Z"/><circle r="10"/><rect class="native-counter" x="-10" y="-10" width="20" height="20" rx="2"/><text y="3.5" class="troop-count"></text><text y="19" class="owner-name"></text><text class="land-name" y="-20">${(c.labelLines||[c.label||c.name]).map((line,i)=>`<tspan x="0" dy="${i?12:0}">${escapeHTML(line)}</tspan>`).join('')}</text></g></g>`).join('');
  mapCamera=$('#map-camera');mapHint=$('#map-hint');markerRoot=$('#markers');
  territoryNodes.clear();$('#units').innerHTML='';
  for(const c of board.countries){const marker=$(`#marker-${c.id}`);territoryNodes.set(c.id,{land:$(`#land-${c.id}`),marker,circle:$('circle',marker),count:$('.troop-count',marker),ownerName:$('.owner-name',marker),markerTitle:$('.marker-title',marker)});}
  armies=armyLayer($('#units'),board.countries,armyMarkup);
  armies.setVisible(false);
  // Keep the complete land and counter layers in the SVG render tree. Toggling
  // their display during navigation invalidates the base map's paint tiles;
  // the SVG viewport already clips them. Cull only expensive decorative detail.
  mapDetails=viewportLayer([...terrainViewportItems($('#world')),...armies.viewportItems()]);
  $('#sea-routes').innerHTML=seaRoutesMarkup(board);
  initContinents();
  if(!boardInitialized){$('#world').addEventListener('click',e=>{if(dragMoved||e.detail>1)return;activateMapTarget(e.target);});
  $('#world').addEventListener('keydown',e=>{if(['Enter',' '].includes(e.key)){e.preventDefault();activateMapTarget(e.target);}});
  initZoom();boardInitialized=true;}
  $('#world').setAttribute('aria-label',`Spielbrett mit ${board.countries.length} wählbaren Gebieten`);
  $('.board-edition').innerHTML=`${escapeHTML(board.name||'Klassische Welt').toUpperCase()} <b>${board.countries.length}</b>`;
  $('#focus-territory').innerHTML='<option value="">Gebiet finden …</option>'+board.continents.map(cont=>`<optgroup label="${escapeHTML(cont.name)}">${board.countries.filter(c=>c.continent===cont.id).map(c=>`<option value="${c.id}">${escapeHTML(c.name)}${c.aliases?.length?' · '+escapeHTML(c.aliases.join(', ')):''}</option>`).join('')}</optgroup>`).join('');
  $('#focus-territory').onchange=e=>{const id=+e.target.value;if(!id)return;cameraMotion++;const c=country(id),z=Math.min(board.maxZoom||6,Math.max(3,4/(c.armyScale||1)));const area=cameraBounds();camera={zoom:z,x:area.x+area.width/2-c.x*z,y:area.y+area.height/2-c.y*z};applyCamera();if(state?.phase==='fortify'&&meActing()){selectTerritory(id);return;}selected=id;target=0;renderMap();if(state)renderSidebar();};
  renderMap();
}
function isCapital(id,game=state){return game?.goal==='capital'&&game.players.some(p=>p.capital===id);}
function eligible(id) {
  if(!state||!meActing())return false;
  const t=state.territories[id-1];
  if(state.phase==='claim')return t.owner<0;
  if(state.phase==='setup')return t.owner===state.me;
  if(['reinforce','capital'].includes(state.phase))return t.owner===state.me;
  if(state.phase==='attack'&&selected&&own(selected))return t.owner!==state.me&&country(selected).neighbors.includes(id);
  if(state.phase==='fortify'&&!state.moved){
    if(!canMoveFrom(selected))return canMoveFrom(id);
    return own(id)&&id!==selected&&connected(selected,id);
  }
  return false;
}
function renderMap() {
  $('#world').classList.toggle('fortifying',state?.phase==='fortify'&&meActing()&&!state.moved);
  $('#ownership-key').hidden=!state?.players.some(p=>p.neutral&&p.territories>0);
  $('#native-key-label').textContent=state?.setup==='frontier'?'Einheimische':'Neutrale Armee';
  board.countries.forEach(c=>{
    const t=state?.territories[c.id-1],{land,marker,circle,count,ownerName,markerTitle}=territoryNodes.get(c.id);
    const native=Boolean(t&&state.players[t.owner]?.neutral);
    const occupied=Boolean(t&&t.owner>=0);
    land.classList.toggle('owned',occupied);
    setAttributeChanged(land,'style',occupied?`--owner-color:${displayColor(t.owner)}`:'');
    land.classList.toggle('native',native);marker.classList.toggle('native',native);
    setAttributeChanged(land,'fill',native?'url(#native-hatch)':continentColors[c.continent-1]);
    setTextChanged(markerTitle,native?`${c.name}: ${state.players[t.owner].name} · kein Spieler · ${t.troops} Einheiten`:c.name);
    land.classList.toggle('selected',c.id===selected);land.classList.toggle('target',c.id===target);land.classList.toggle('eligible',eligible(c.id));
    marker.classList.toggle('selected',c.id===selected||c.id===target);
    marker.classList.toggle('capital',isCapital(c.id)&&state.rules!=='domination');
    const building=$('.map-building',marker),buildingKey=occupied&&state.rules==='domination'?JSON.stringify([t.buildingLevel,t.construction?.level,t.construction?.remaining,t.troops,armyExperience(t).bonus,isCapital(c.id)]):'';
    if(building.dataset.key!==buildingKey){building.innerHTML=buildingKey?mapBuilding(t,isCapital(c.id)):'';building.dataset.key=buildingKey;}
    building.toggleAttribute('hidden',!buildingKey);
    marker.classList.toggle('with-building',Boolean(buildingKey));
    setAttributeChanged(building,'tabindex',buildingKey?'0':'-1');
    setAttributeChanged(building,'aria-label',buildingKey?`${c.name}: ${buildingDescription(t,isCapital(c.id))} · Gebäude öffnen`:'');
    if(buildingKey)setTextChanged(markerTitle,`${c.name}: ${buildingDescription(t,isCapital(c.id))}`);
    setAttributeChanged(land,'aria-label',`${c.name}${t&&t.owner>=0?`, ${state.players[t.owner].name}${native?' (kein Spieler)':''}, ${t.troops} Einheiten`: ', unbesetzt'}`);
    setAttributeChanged(circle,'fill',t&&t.owner>=0?displayColor(t.owner):'#5a6252');
    setAttributeChanged(circle,'r',t&&t.owner>=0?'10':'2.3');
    setTextChanged(count,t&&t.owner>=0?t.troops:'');
    setTextChanged(ownerName,occupied?state.players[t.owner]?.name||'':'');
  });
  renderUnits();
  updateSettlementBanners($('#world'),board,state,displayColor);
  updateZoomDetails();
}
function pieceTransform(c,p){const scale=c.armyScale||1;return `translate(${(p.x-c.x)/scale} ${(p.y-c.y)/scale})`;}
function insideLand(id,p){return territoryNodes.get(id).land.isPointInFill(new DOMPoint(p.x,p.y));}
function piecePosition(t,c,i,count){
  const pending=figurePlacement.position(c.id,i);if(pending)return pending;
  if(t.positions?.[i]&&insideLand(c.id,t.positions[i]))return t.positions[i];
  const scale=c.armyScale||1,p={x:c.x+(i%3-(Math.min(3,count-Math.floor(i/3)*3)-1)/2)*10*scale,y:c.y+(Math.floor(i/3)*12+20)*scale};
  // Fit the foot of each miniature onto even the smallest islands.
  for(let j=0;j<16&&!insideLand(c.id,p);j++){p.x=(p.x+c.x)/2;p.y=(p.y+c.y)/2;}
  return p;
}
function armyMarkup(t,c) {
  const members=mapPieces(t.troops),pieces=members.map(p=>p.value),n=t.troops-pieces.reduce((sum,value)=>sum+value,0);
  const movable=t.owner===state?.me && !['lobby','finished'].includes(state.phase);
  const banner=state.players[t.owner]?.neutral?countryBanner(c):bannerCountries.get(t.owner)===c.id?state.players[t.owner]?.name:'';
  const experience=state.rules==='domination'?t.experience||[]:null;
  const figures=pieces.map((v,i)=>{const p=piecePosition(t,c,i,pieces.length);return `<g data-id="${c.id}" data-piece="${i}" data-x="${p.x}" data-y="${p.y}" class="army-figure ${movable?'movable':''}" transform="${pieceTransform(c,p)}" ${movable||state.rules==='domination'?'tabindex="0" role="button"':''} aria-label="${escapeHTML(c.name)}: Figur mit ${v} ${v===1?'Einheit':'Einheiten'} · Informationen${movable?' und verschieben':''}"><g class="army-miniature"><circle class="piece-hit" cx="0" cy="-4" r="6"/><g transform="translate(-5 -11) scale(.4)" class="army-piece" fill="${displayColor(t.owner)}"><use href="#piece-${v===10?'artillery':v===5?'cavalry':'infantry'}" stroke="#f9f1d6" stroke-width=".7"/>${i===0&&banner?playerBanner(banner,v===10?'artillery':v===5?'cavalry':'infantry'):''}</g><g class="map-unit-experience" transform="scale(.38)">${experienceBadges(members[i],experience)}</g></g></g>`;}).join('');
  return figures+(n?`<text x="17" y="30" fill="#152e32" font-size="5" font-weight="600">+${n}</text><g class="map-unit-experience" transform="translate(19 43) scale(.38)">${experienceBadges({units:Array.from({length:n},(_,i)=>t.troops-n+i)},experience)}</g>`:'');
}
const pieceFrame=frameBatch(()=>{if(pieceDrag)pieceDrag.node.setAttribute('transform',pieceTransform(country(pieceDrag.id),pieceDrag.last));});
function cancelPieceDrag(restore=true){pieceFrame.cancel();if(pieceDrag&&restore)pieceDrag.node.setAttribute('transform',pieceDrag.original);pieceDrag=null;$('#world')?.classList.remove('arranging');}
function renderUnits() {
  bannerCountries.clear();
  state?.territories.forEach((territory,i)=>{
    if(territory.owner<0||territory.troops<1||state.players[territory.owner]?.neutral)return;
    const previous=bannerCountries.get(territory.owner);
    if(!previous||territory.troops>state.territories[previous-1].troops)bannerCountries.set(territory.owner,i+1);
  });
  armies.update(state?.territories,displayColor,(territory,c)=>JSON.stringify([figurePlacement.signature(c.id),state.players[territory.owner]?.neutral?countryBanner(c):bannerCountries.get(territory.owner)===c.id?state.players[territory.owner].name:'']));
}
function updateZoomDetails(){
  updateAttackRoute();
  mapDetails?.update(camera,pixelsPerUnit,viewport,mapCamera.classList.contains('camera-moving'));
  markerRoot.style.setProperty('--building-scale',Math.min(1.6,camera.zoom*pixelsPerUnit));
  const detail=camera.zoom>=1.8;
  armies.setVisible(detail&&Boolean(state));
  markerRoot.classList.toggle('detail',detail);
  markerRoot.classList.toggle('close-detail',camera.zoom>=4);
  $('#units').classList.toggle('show-experience',camera.zoom>=4&&state?.rules==='domination');
  setAttributeChanged($('#world'),'data-detail',terrainDetail(camera.zoom));
  const scale=markerScale(camera.zoom,pixelsPerUnit);
  if(scale!==lastMarkerScale){
    $('#units').style.setProperty('--army-zoom-limit',3*scale);
    $('#continent-labels').style.setProperty('--continent-label-scale',scale);
    markerRoot.style.setProperty('--marker-scale',scale);lastMarkerScale=scale;
  }
  setTextChanged(mapHint,!!board.artwork?.startsWith('historical-')?(camera.zoom>=8?'Siedlungen · Infanterie 1 / Reiter 5 / Geschütz 10':camera.zoom>=4?'Wälder & Gebirge · Näher zoomen für Siedlungen':detail?'Flüsse & Gebirge · Näher zoomen für Wälder':mobileHUD.active?'2 Finger: Karte & Zoom · 1 Finger: Figuren':'2 Finger: Karte · 1 Finger: eigene Figuren'):detail?'Infanterie 1 · Kavallerie 5 · Artillerie 10':mobileHUD.active?'2 Finger: Karte & Zoom · 1 Finger: Figuren':'2 Finger: Karte · 1 Finger: eigene Figuren');
}
function connected(from,to) {if(state.rules==='classic')return own(from)&&own(to)&&country(from).neighbors.includes(to);const seen=new Set([from]),queue=[from];while(queue.length){const id=queue.shift();if(id===to)return true;for(const nb of country(id).neighbors)if(!seen.has(nb)&&own(nb)){seen.add(nb);queue.push(nb);}}return false;}
function canMoveFrom(id){return own(id)&&state.territories[id-1].troops>1&&country(id).neighbors.some(own);}
function inspectFigure(id,piece){
  inspectedUnit=inspectPiece(state,id,piece);
  if(!inspectedUnit){selectTerritory(id);return;}
  selected=id;target=0;renderMap();renderSidebar();
  if(mobileHUD.active)mobileHUD.open('orders',false);
}
function activateMapTarget(node){
  const figure=node?.closest('.army-figure');
  if(figure&&state?.rules==='domination'){inspectFigure(Number(figure.dataset.id),Number(figure.dataset.piece));return true;}
  const building=node?.closest('[data-building-id]');
  if(building){openBuilding(Number(building.dataset.buildingId));return true;}
  const id=Number(node?.closest('[data-id]')?.dataset.id);
  if(id){selectTerritory(id);return true;}
  return false;
}
function selectTerritory(id) {
  inspectedUnit=null;
  if(state?.paused&&id){selected=id;target=0;renderMap();renderSidebar();return;}
  if(autoCombat.active){toast('Stoppe zuerst die Automatik, um ein anderes Land zu wählen.');return;}
  if(!id||animating)return;if(busy){if(placing&&id===selected)placePiece(1);return;}sound('select');
  if(!state||state.phase==='lobby'){selected=id;renderMap();return;}
  if(state.phase==='claim'){if(meActing()&&state.territories[id-1]?.owner<0)act('claim',{territory:id});return;}
  if(state.phase==='setup'&&meActing()&&canPlaceHere(id,1)){selected=id;placePiece(1);return;}
  if(id===selected&&canPlaceHere(id,1)){placePiece(1);return;}
  if(['defend','occupy'].includes(state.phase)){toast('Beende zuerst die aktuelle Kampfaktion.');return;}
  if(state.phase==='fortify'&&meActing()){
    if(state.moved||!own(id))return;
    if(canMoveFrom(selected)){
      if(id===selected||!connected(selected,id))return;
      target=id;amount=1;
    }
    else if(canMoveFrom(id)){selected=id;target=0;amount=1;}
    else return;
    renderMap();renderSidebar();return;
  }
  if(['attack','fortify'].includes(state.phase)&&selected&&id!==selected&&eligible(id)){target=id;amount=1;}
  else {selected=id;target=0;amount=1;}
  renderMap();renderSidebar();
}
function placementReserve(){
  if(!state||!meActing())return 0;
  if(state.phase==='reinforce')return state.mustTrade?0:state.pool;
  if(state.phase==='setup')return state.players[placementOwner()].reserve;
  return 0;
}
function placementOwner(){return state.me;}
function canPlaceHere(id,n){return Boolean(state&&!state.paused&&['setup','reinforce'].includes(state.phase)&&state.territories[id-1]?.owner===placementOwner()&&placementReserve()>=n&&(state.phase!=='setup'||state.setup==='frontier'||n===1));}
async function placePiece(n){
  if(!canPlaceHere(selected,n))return;
  if(placing){if(placementQueue.length<32)placementQueue.push(n);return;}
  if(busy)return;
  placing=true;const id=selected,phase=state.phase;
  try{
    do{
      if(state.phase!==phase||selected!==id||!canPlaceHere(id,n))break;
      sound('place');if(!await act('place',{territory:id,amount:n}))break;
      n=placementQueue.shift();
    }while(n!==undefined);
  }finally{placing=false;placementQueue=[];}
}
function placementButtons(){return `<div class="placement-pieces" role="group" aria-label="Figur platzieren">${[['infantry','Infanterie',1],['cavalry','Pferd',5],['artillery','Kanone',10]].map(([kind,name,n])=>`<button class="placement-piece" data-place-piece="${n}" aria-label="${name} platzieren: ${n} ${n===1?'Einheit':'Einheiten'}" ${canPlaceHere(selected,n)?'':`disabled title="${!selected?'Wähle zuerst ein eigenes Gebiet':state.phase==='setup'&&state.setup!=='frontier'&&n>1?'Klassisch verteilt Starteinheiten einzeln':`${n} Einheiten in der Reserve benötigt`}"`}>${icon(kind)}<strong>${name}</strong><span>${n} ${n===1?'Einheit':'Einheiten'}</span></button>`).join('')}</div>`;}
function mapPicker(){
  return `<fieldset id="map-choice" class="map-picker"><legend>Spielkarte wählen</legend>${[
    ['europe1871','Europa um 1871','71 Gebiete','Deutsches Reich, Österreich-Ungarn und der Balkan. Nur Europa.'],
    ['world120','Welt um 1700','120 Gebiete','Bayern, Schweiz, Moskowien & Singapura. Mit Landschaftsdetails.'],
    ['classic','Klassische Welt','42 Gebiete','42 große Spielregionen. Kartendaten aus dem Domination-Projekt.'],
    ['simple-world','Mini-Welt','20 Gebiete','Sechs Kontinente, klare Seewege. Australien mit nur einem Zugang.'],
  ].map(([id,name,count,description])=>{
    const b=boardCatalog[id];
    return `<label class="map-option"><input type="radio" name="map" value="${id}" ${id===(board.id||'classic')?'checked':''} aria-label="${name} · ${count}"><svg class="map-thumbnail" viewBox="0 0 800 500" aria-hidden="true">${seaRoutesMarkup(b)}${b.countries.map(c=>`<path d="${c.path}" fill="${continentColors[c.continent-1]}" stroke="#fff7dd" stroke-width="1"/>`).join('')}</svg><span class="map-option-copy"><strong>${name}</strong><span>${count}</span><small>${description}</small></span></label>`;
  }).join('')}</fieldset>`;
}
function renderHome() {
  const code=roomCodeFromHash(location.hash);
  $('#sidebar').innerHTML=startScreenMarkup({mapPicker:mapPicker(),description:board.description||'Eine vereinfachte Weltkarte mit 42 Spielgebieten.',name:localStorage.getItem('dom-name')||'',email:serverConfig.email,lastRoom:localStorage.getItem('dom-room'),code});
  bindStartScreen($('#sidebar'),{code,mapName:()=>board.name||'Klassische Welt',onCreate:async form=>{
    const name=$('#player-name').value.trim();localStorage.setItem('dom-name',name);
    await withForm(form,async()=>connect(await api('/api/rooms',{name,rules:$('#game-rules').value,mode:$('#card-mode').value,goal:$('#game-goal').value,map:$('input[name=map]:checked').value,players:draftPlayers})));
  }});
  $('#map-choice').onchange=e=>{if(e.target.name!=='map')return;setBoard(e.target.value);$('#room-label').textContent=`${board.countries.length} Gebiete. Eine Welt.`;$('#map-description').textContent=board.description||'Eine vereinfachte Weltkarte mit 42 Spielgebieten.';};
  $('#add-draft-human').onclick=()=>{if(draftPlayers.length<5){draftPlayers.push({kind:'human',name:''});renderPlayerDraft();}};
  $('#add-draft-bot').onclick=()=>{if(draftPlayers.length<5){draftPlayers.push({kind:'local',name:''});renderPlayerDraft();}};renderPlayerDraft();
  $('#join-form').onsubmit=async e=>{e.preventDefault();const name=$('#join-name').value.trim();localStorage.setItem('dom-name',name);await withForm(e.currentTarget,async()=>connect(await api(`/api/rooms/${$('#join-code').value.trim().toUpperCase()}/join`,{name})));};
  $('#resume-game')?.addEventListener('click',()=>reconnect(localStorage.getItem('dom-room')));
  loadMyRooms();
}
async function withForm(form,fn) {const b=$('button[type=submit]',form)||$('button',form);b.disabled=true;try{await fn();}catch(e){toast(e.message);}finally{b.disabled=false;}}
function botTypeOptions(value='local'){return `<option value="local" ${value==='local'?'selected':''}>Lokaler Strategie-Bot</option><option value="berserker" ${value==='berserker'?'selected':''}>Ragnar · Berserker (Angriff ab 3 Einheiten)</option><option value="annoying" ${value==='annoying'?'selected':''}>Klaus Störtebeker · Störenfried (Angriff ab 4 Einheiten)</option>`;}
const playerTypeOptions=value=>`<option value="human" ${value==='human'?'selected':''}>Mensch · dieses Gerät</option>${botTypeOptions(value)}`;
const defaultBotName=kind=>kind==='human'?'Name des Mitspielers':kind==='berserker'?'Ragnar':kind==='annoying'?'Klaus Störtebeker':'Strategie-Bot';
function renderPlayerDraft(){
  $('#draft-bots').innerHTML=draftPlayers.map((b,i)=>`<div class="bot-row bot-draft"><label for="draft-bot-name-${i}">Spieler ${i+2} · Name<input id="draft-bot-name-${i}" data-bot-name="${i}" maxlength="24" autocomplete="off" placeholder="${defaultBotName(b.kind)}" value="${escapeHTML(b.name)}" ${b.kind==='human'?'required':''}></label><select data-bot-type="${i}" aria-label="Spielertyp für Spieler ${i+2}">${playerTypeOptions(b.kind)}</select><button type="button" data-remove-draft="${i}" class="remove-bot" aria-label="Spieler ${i+2} entfernen">×</button></div>`).join('');
  $('#add-draft-bot').disabled=$('#add-draft-human').disabled=draftPlayers.length>=5;
  $$('[data-bot-name]').forEach(el=>el.oninput=()=>{draftPlayers[+el.dataset.botName].name=el.value;});
  $$('[data-bot-type]').forEach(el=>el.onchange=()=>{draftPlayers[+el.dataset.botType].kind=el.value;const input=$(`#draft-bot-name-${el.dataset.botType}`);input.placeholder=defaultBotName(el.value);input.required=el.value==='human';});
  $$('[data-remove-draft]').forEach(el=>el.onclick=()=>{draftPlayers.splice(+el.dataset.removeDraft,1);renderPlayerDraft();});
}
function lobbyPlayer(p,i){
  const name=isHost()&&(p.bot||p.local)?`<button class="lobby-bot-name" data-rename-bot="${i}" aria-label="${escapeHTML(p.name)} umbenennen">${escapeHTML(p.name)} <span aria-hidden="true">✎</span></button>`:`<span class="lobby-player-name">${escapeHTML(p.name)}</span>`;
  return `<li><i class="player-color" style="--player:${colors[i]}"></i>${name}<span class="you-tag">${i===0?'Gastgeber':p.bot?'KI':p.local?'Dieses Gerät':i===state.me?'Du':''}</span>${i>0&&isHost()?`<button class="remove-bot" data-remove-bot="${i}" aria-label="${escapeHTML(p.name)} entfernen">×</button>`:''}</li>`;
}
function lobbyPlayerControls(){
  return `<div class="lobby-bots"><label for="lobby-bot-name">Name des neuen Spielers</label><input id="lobby-bot-name" maxlength="24" autocomplete="off" placeholder="${defaultBotName(lobbyPlayerDraft.kind)}" value="${escapeHTML(lobbyPlayerDraft.name)}"><div class="bot-row"><select id="lobby-bot-type" aria-label="Art des neuen Spielers">${playerTypeOptions(lobbyPlayerDraft.kind)}</select><button class="add-bot" id="add-lobby-bot">+ Spieler</button></div></div>`;
}
function phaseSteps() {const i=['reinforce','attack','fortify'].indexOf(state.phase==='defend'||state.phase==='occupy'?'attack':state.phase);return `<div class="phase-steps">${['Verstärken','Angreifen','Bewegen'].map((s,k)=>`<span class="phase-step ${i===k?'current':''}"><b>${k+1}</b>${s}</span>`).join('')}</div>`;}
function mountainNotice(id) {if(state.rules==='classic')return '';if(state.rules==='domination')return buildingInfo(state,id,isCapital(id));if(isCapital(id))return '<p class="terrain-bonus capital-notice"><span aria-hidden="true">♜</span> Hauptstadtfestung<small>1 Einheit: 2 Würfel · 2 Einheiten: 3 · ab 3: 4<br>Fällt deine Hauptstadt, scheidest du aus.</small></p>';return country(id)?.mountainous?'<p class="terrain-bonus"><span aria-hidden="true">▲</span> Extra Verteidigungswürfel wegen bergigem Gebiet<small>Bis zu 3 Würfel · höchstens einer pro Einheit</small></p>':'';}
function selectedInfo() {if(!selected)return '';const c=country(selected),t=state.territories[selected-1];return `<div class="selected-territory"><strong>${c.name}</strong><small>${t.owner>=0?`${escapeHTML(state.players[t.owner].name)}${state.players[t.owner].neutral?' · kein Spieler':''} · ${t.troops} Einheiten`:'Freies Gebiet'}</small>${mountainNotice(selected)}</div>`;}
function stepper(min,max) {amount=Math.max(min,Math.min(max,amount));return `<div class="stepper"><button id="less" aria-label="Eine Einheit weniger" ${amount<=min?'disabled':''}>−</button><input id="amount" type="number" min="${min}" max="${max}" value="${amount}" aria-label="Anzahl Einheiten"><button id="more" aria-label="Eine Einheit mehr" ${amount>=max?'disabled':''}>+</button></div>`;}
function movementAmount(min,max){
  const control=stepper(min,max);
  return `${control}<div class="placement-pieces movement-pieces" role="group" aria-label="Truppenanzahl in Schritten erhöhen">${[['infantry','Einheit',1],['cavalry','Pferd',5],['artillery','Kanone',10]].map(([kind,name,n])=>`<button class="placement-piece" data-move-add="${n}" aria-label="${n} ${n===1?'Einheit':'Einheiten'} mehr auswählen" ${amount+n>max?'disabled':''}>${icon(kind)}<strong>${name}</strong><span>+${n} ${n===1?'Einheit':'Einheiten'}</span></button>`).join('')}</div>`;
}
function pair(from,to) {const a=country(from),b=country(to);return `<div class="attack-pair"><div>${a.name}<strong>${state.territories[from-1].troops}</strong>Einheiten</div><span>→</span><div>${b.name}<strong>${state.territories[to-1].troops}</strong>Einheiten</div></div>`;}
function smallDie(n=5){const pips={1:[[12,12]],2:[[7,7],[17,17]],3:[[7,7],[12,12],[17,17]],4:[[7,7],[17,7],[7,17],[17,17]],5:[[7,7],[17,7],[12,12],[7,17],[17,17]],6:[[7,6],[17,6],[7,12],[17,12],[7,18],[17,18]]}[n];return `<svg class="small-die" viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="2" width="20" height="20" rx="4" fill="none" stroke="currentColor" stroke-width="1.5"/>${pips.map(([x,y])=>`<circle cx="${x}" cy="${y}" r="1.6" fill="currentColor"/>`).join('')}</svg>`;}
function attackRollPreview(){const dice=state.pending?.attack;if(state.phase!=='defend'||!dice?.length)return '';if(!attackRollRevealed(state,lastAttackRoll))return '<div class="attack-roll" role="status"><span class="eyebrow">ANGRIFFSWURF</span><p>Die Würfel rollen …</p></div>';return `<div class="attack-roll"><span class="eyebrow">ANGRIFFSWURF</span><div class="attack-roll-dice" role="img" aria-label="Angriffswürfel: ${dice.join(', ')}">${dice.map(n=>`<span class="rolled-die">${smallDie(n)}</span>`).join('')}</div></div>`;}
function choices(max,isDefense=false) {const slot=isDefense?1:0,context=`${state.code}:${state.revision}:${isDefense?'defend':selected+':'+target}:${max}`;if(isDefense)defenseChoice=selectedDice(diceContexts[slot],context,max,defenseChoice);else diceChoice=selectedDice(diceContexts[slot],context,max,diceChoice);diceContexts[slot]=context;return `<div class="dice-choice" aria-label="Anzahl Würfel">${Array.from({length:max},(_,i)=>`<button data-dice="${i+1}" class="${(isDefense?defenseChoice:diceChoice)===i+1?'chosen':''}" aria-label="${i+1} Würfel" aria-pressed="${(isDefense?defenseChoice:diceChoice)===i+1}" ${animating?'disabled':''}>${(i<6?smallDie(i+1):`<span class="dice-number">${i+1}</span>`)}</button>`).join('')}</div>`;}
function renderSidebar() {
  if(!state){renderHome();syncMobileHUD();return;}
  if(state.paused){
    $('#sidebar').innerHTML=`<div class="panel paused-panel"><span class="eyebrow">PARTIE PAUSIERT</span><h2>Zeit für einen Überblick.</h2><p>${escapeHTML(state.players[state.pausedBy]?.name||'Ein Mitspieler')} hat die Partie pausiert. Alle Spielzüge und Bots stehen still. Du kannst die Karte ansehen, zoomen und Länder auswählen.</p>${selectedInfo()}<button class="primary" id="resume-game">▶ Partie fortsetzen</button></div>`;
    $$('[data-open-building]',$('#sidebar')).forEach(button=>button.onclick=()=>openBuilding(+button.dataset.openBuilding));renderCombat();$('#resume-game').onclick=togglePause;syncMobileHUD();return;
  }
  if(state.phase==='lobby'){
    $('#sidebar').innerHTML=`<div class="panel"><span class="eyebrow">DEIN SPIELTISCH</span><h2>Alle an Bord?</h2><p>Menschen an diesem Gerät spielen hier abwechselnd. Für eigene Geräte teile den Link oder Raumcode.</p><div class="room-code">${state.code}</div><button class="secondary" id="copy-link">Einladungslink kopieren ↗</button><ul class="lobby-list">${state.players.map(lobbyPlayer).join('')}</ul>${isHost()?`${state.players.length<6?lobbyPlayerControls():''}<button class="primary" id="start-game" ${state.players.length<(state.goal==='mission'?3:2)?'disabled':''}>Mit ${state.players.length} Spielern starten</button>`:'<div class="waiting">Der Gastgeber startet die Partie.</div>'}<p class="fine">${state.mode==='fixed'?'Feste Kartenboni nach Symbolkombination.':'Steigende Kartenboni für alle Spieler gemeinsam.'} ${state.setup==='frontier'?`${board.id==='simple-world'?2:5} Länder wählen, danach ${board.id==='simple-world'?8:15} zusätzliche Einheiten verteilen. Einheimische: 1–3 Einheiten. Nachbarn mit mindestens 2 Einheiten mehr beschleunigen ihr Wachstum.`:state.players.length===2?'Zu zweit spielt eine neutrale Armee mit.':''}</p></div><div class="panel"><span class="eyebrow">DEIN ZIEL</span><h3>${state.goal==='capital'?'Die Hauptstädte.':state.goal==='mission'?'Deine geheime Mission.':'Die ganze Welt.'}</h3><p>${state.goal==='capital'?'Wähle nach deinen Startländern eine Hauptstadt. Verteidige ihre Burg: Fällt sie, scheidest du aus. Der Eroberer erhält deine Hauptstadt und Karten; deine übrigen Länder werden samt Armeen einheimisch. Start: Palisade mit drei Würfelplätzen, einer pro Verteidiger. Weitere Stufen kosten Einheiten und Bauzeit. ':''}${state.goal==='mission'?'Ab drei Spielern erhält jeder einen geheimen Auftrag. Wer ihn zuerst erfüllt, gewinnt. Länderziele und Regionen passen zur gewählten Karte.':`Besiege die anderen Spieler auf ${board.countries.length} Gebieten.`} ${state.setup==='frontier'?'Starke Einheimische können schwache Nachbarn angreifen und bei einer Eroberung zum Computergegner werden.':state.goal==='mission'?'Die Startländer werden zufällig verteilt.':'Im Duell genügt es, deinen Mitspieler zu besiegen.'}</p></div>`;
    const lobbyScroll=document.createElement('div');lobbyScroll.className='lobby-scroll';
    lobbyScroll.append(...$('#sidebar').children);$('#sidebar').append(lobbyScroll);
    if($('#start-game')){const footer=document.createElement('footer');footer.className='start-footer';footer.append($('#start-game'));$('#sidebar').append(footer);}
    $('#copy-link').onclick=copyLink;$('#start-game')?.addEventListener('click',()=>act('start'));
    $('#lobby-bot-name')?.addEventListener('input',e=>{lobbyPlayerDraft.name=e.target.value;});
    $('#lobby-bot-type')?.addEventListener('change',e=>{lobbyPlayerDraft.kind=e.target.value;$('#lobby-bot-name').placeholder=defaultBotName(e.target.value);});
    $('#add-lobby-bot')?.addEventListener('click',async()=>{if(await act(lobbyPlayerDraft.kind==='human'?'addlocal':'addbot',{bot:lobbyPlayerDraft.kind,name:lobbyPlayerDraft.name})){lobbyPlayerDraft.name='';renderSidebar();}});
    $$('[data-rename-bot]').forEach(el=>el.onclick=()=>renameBot(+el.dataset.renameBot));
    $$('[data-remove-bot]').forEach(el=>el.onclick=managePlayers);syncMobileHUD();return;
  }
  let content='',primary='',secondary='',min=1,max=1;
  const isMe=meActing(),myTurn=state.turn===state.me;
  const attackRolling=state.phase==='defend'&&!attackRollRevealed(state,lastAttackRoll);
  if(state.phase==='finished'){content=`<span class="eyebrow">SIEG AUF GANZER LINIE</span><h2>${escapeHTML(state.players[state.winner].name)} gewinnt.</h2><p>${state.winningMission?`Mission erfüllt: ${escapeHTML(state.winningMission.description)}`:'Die letzte gegnerische Armee ist besiegt. Die Welt hat einen neuen Herrscher.'}</p><a class="primary" href="/" style="text-decoration:none">Neue Partie</a>${isHost()?'<button class="secondary danger-text" id="close-finished-room">Partie aus der Liste entfernen</button>':''}`;}
  else if(!isMe){
    content=`<span class="eyebrow">${state.paused?'PAUSIERT':phaseNames[state.phase].toUpperCase()}</span><h2>${escapeHTML(state.players[state.actor].name)} ist am Zug.</h2><p>${attackRolling?'Der Angriff würfelt. Danach ist die Verteidigung dran.':state.phase==='defend'?state.rules==='classic'?'Die Verteidigung wählt ihre Würfel. Danach würfeln beide Seiten.':'Der Angriff hat gewürfelt. Die Verteidigung wählt jetzt ihre Würfel.':'Du siehst alle Spielzüge live auf dem Brett. Plane in der Zwischenzeit deinen nächsten Zug.'}</p>${state.pending?pair(state.pending.from,state.pending.to):selectedInfo()}${attackRollPreview()}${state.pending?mountainNotice(state.pending.to):''}<div class="waiting">${attackRolling?'Warte auf das Würfelergebnis':state.players[state.actor].bot?'KI plant den nächsten Spielzug':state.phase==='defend'?'Warte auf Verteidigung':'Warte auf den nächsten Spielzug'}</div>`;
  } else switch(state.phase){
    case 'capital':content=`<span class="eyebrow">DEIN LETZTER RÜCKHALT</span><h2>Wähle deine Hauptstadt.</h2><p>Wähle eines deiner Länder. Deine Hauptstadt beginnt mit einer Hütte samt Palisadenzaun und drei Würfelplätzen. Weitere Stufen musst du bauen. Wird deine Hauptstadt erobert, verlierst du.</p>${selectedInfo()}`;if(selected&&own(selected))primary='<button class="primary" id="choose-capital">Als Hauptstadt festlegen</button>';break;
    case 'claim':content=`<span class="eyebrow">DIE WELT WIRD AUFGETEILT</span><h2>Wähle dein Gebiet.</h2><p>Klicke oder tippe auf ein freies Gebiet, um es sofort zu besetzen. Danach ist der nächste Spieler dran.</p>${state.setup==='frontier'?`<div class="claim-progress">${state.players[state.me].territories} / ${board.id==='simple-world'?2:5} Länder gewählt</div><p class="fine">Danach verteilst du ${board.id==='simple-world'?8:15} zusätzliche Einheiten. Die übrigen Länder erhalten 1–3 Einheimische.</p>`:''}`;break;
    case 'setup': {
	  content=`<span class="eyebrow">DIE ARMEEN STELLEN SICH AUF</span><h2>Deine Armee formiert sich.</h2><p>${state.setup==='frontier'?`Verteile deine ${board.id==='simple-world'?8:15} zusätzlichen Starteinheiten. Tippe ein eigenes Land an; jeder weitere Tipp setzt dort eine Einheit. Oder platziere hier eine Figur.`:'Setze eine Starteinheit auf eines deiner Gebiete.'}${state.setup!=='frontier'&&state.players.some(p=>p.neutral)?` Noch ${2-state.setupPlaced} eigene Einheit${state.setupPlaced===0?'en':''}; danach wird eine neutrale Einheit zufällig gesetzt.`:''}</p><div class="pool-number">${state.players[state.me].reserve}<span>übrig</span></div>${selectedInfo()}`;
      primary=placementButtons();break;
    }
    case 'reinforce':
      content=`<h2>${state.resume==='attack'?'Beute wird Verstärkung.':'Verstärke deine Front.'}</h2><p>Tippe ein eigenes Land an. Jeder weitere Tipp setzt dort eine Einheit. Mit den Figuren platzierst du 1, 5 oder 10 Einheiten auf einmal.</p><div class="pool-number">${state.pool}<span>Einheiten</span></div>${state.mustTrade?'<div class="banner">Du hältst mindestens 5 Karten. Tausche zuerst einen gültigen Satz ein.</div><button class="secondary" id="force-trade">Karten eintauschen</button>':''}${selectedInfo()}`;
      max=state.pool;
      if(own(selected)&&state.pool>0&&!state.mustTrade){content+=placementButtons()+'<label for="amount">Andere Anzahl</label>'+stepper(1,max);primary='<button class="primary" id="place">Verstärkung platzieren</button>';}
      break;
    case 'attack':
      content=autoCombat.active?'<h2>Der Angriff läuft.</h2><p>Nach jedem Kampf wird mit den maximal verfügbaren Würfeln weiter angegriffen.</p>':'<h2>Dein nächster Angriff.</h2><p>Wähle ein Gebiet mit mindestens zwei Einheiten, dann einen angrenzenden Gegner.</p>';
      if(selected&&target&&own(selected)&&!own(target)&&country(selected).neighbors.includes(target)) {content+=pair(selected,target)+mountainNotice(target);const limit=maxAttackDice(state.territories[selected-1],state.rules);if(limit>0&&!autoCombat.active)content+='<p>Wähle deinen Angriff im Schlachtfeld.</p>';}
      else content+=selectedInfo();
      if(state.conquered)content+='<span class="badge">✓ Eine Gebietskarte ist dir sicher</span>';
      secondary=autoCombat.active?'':'<button class="secondary" id="next">Angriffsphase beenden →</button>';break;
    case 'defend':
      content=`<span class="eyebrow">DEIN GEBIET WIRD ANGEGRIFFEN</span><h2>Halte deine Stellung.</h2>${pair(state.pending.from,state.pending.to)}${attackRollPreview()}<p>${attackRolling?'Der Angriff würfelt. Danach wählst du im Schlachtfeld deine Verteidigung.':'Wähle deine Verteidigung im Schlachtfeld. Bei Gleichstand gewinnst du.'}</p>${mountainNotice(state.pending.to)}`;break;
    case 'occupy':
      min=state.pending.minimum;max=state.territories[state.pending.from-1].troops-1;
      content=`<span class="eyebrow">DEIN GEBIET</span><h2>${country(state.pending.to).name} erobert.</h2><p>Ziehe mindestens ${min} Einheiten nach. Im Ausgangsgebiet muss eine Einheit bleiben.</p>${pair(state.pending.from,state.pending.to)}${movementAmount(min,max)}`;
      primary='<button class="primary" id="occupy">Einheiten nachrücken →</button>';
      secondary=moveAllButton(max);break;
    case 'fortify': {
      const source=canMoveFrom(selected),destinations=source?board.countries.filter(c=>c.id!==selected&&own(c.id)&&connected(selected,c.id)):[];
      const step=source?(target?3:2):1;
      content=state.moved?'<h2>Truppen verschoben.</h2><p>Deine Truppenbewegung ist abgeschlossen. Du kannst jetzt deinen Zug beenden.</p>':`<h2>${step===1?'Wähle dein Startland.':step===2?'Wähle dein Zielland.':'Wie viele ziehen mit?'}</h2><ol class="move-steps" aria-label="Truppen verschieben">${['Startland','Zielland','Anzahl'].map((name,i)=>`<li ${step===i+1?'aria-current="step"':''}><b>${i+1}</b>${name}</li>`).join('')}</ol>`;
      if(!state.moved){
        if(!source)content+='<p>Klicke zuerst auf ein eigenes Land mit mindestens zwei Einheiten. Mögliche Startländer sind grün umrandet.</p>';
        else {
          content+=target?'<p>Wähle die Anzahl und drücke „Truppen bewegen“ – oder ziehe alle verfügbaren Einheiten auf einmal.</p>':'<p>Klicke als Zweites auf ein grün umrandetes eigenes Land. Der Weg dorthin darf nur durch eigene Länder führen.</p>';
          if(!target)content+=selectedInfo();
          content+=`<label for="move-target">Zielland</label><select id="move-target"><option value="">Auf der Karte oder hier wählen …</option>${destinations.map(c=>`<option value="${c.id}" ${target===c.id?'selected':''}>${escapeHTML(c.name)}</option>`).join('')}</select>`;
          if(target&&destinations.some(c=>c.id===target)){max=state.territories[selected-1].troops-1;content+=pair(selected,target)+movementAmount(1,max);primary='<button class="primary" id="fortify">Truppen bewegen →</button>'+moveAllButton(max);}
        }
        if(source)secondary='<button class="secondary" id="reset-move">Anderes Startland wählen</button>';
      }
      if(!state.moved)secondary+='<button class="secondary" id="back-to-attack">← Zurück zum Angriff</button>';
      secondary+='<button class="secondary" id="next">Zug beenden ✓</button>';break;
    }
  }
  if(state.battle&&state.phase==='attack')content+=`<div class="last-battle">Letzter Kampf: ${state.battle.attackerLoss} Einheit${state.battle.attackerLoss===1?'':'en'} im Angriff, ${state.battle.defenderLoss} in der Verteidigung verloren.</div>`;
  if(autoCombat.active){
    const run=autoCombat.active;
    content=`<div class="auto-combat"><span class="eyebrow">AUTOMATIK AKTIV</span><strong>${run.mode==='attack'?'Automatischer Angriff':'Automatische Verteidigung'}</strong><p>${escapeHTML(country(run.from).name)} → ${escapeHTML(country(run.to).name)}</p><button class="primary red" id="stop-auto">■ Stopp</button><small>Ein laufender Wurf wird noch ausgewertet.</small></div>`+content;
  }
  $('#sidebar').innerHTML=`${unitInfoHTML(state,inspectedUnit,board.countries)}<div class="panel">${!['claim','capital','setup','finished'].includes(state.phase)?phaseSteps():''}${state.phase!=='finished'?`<div class="turn-owner"><i class="player-color" style="--player:${displayColor(state.actor)}"></i>${isMe&&!state.hotseat?'Du bist am Zug':escapeHTML(state.players[state.actor].name)}</div>`:''}${state.mission&&state.phase!=='finished'?'<button class="secondary" id="show-mission">Meine geheime Mission</button>':''}${content}${primary}${secondary}${state.setup==='frontier'&&!['claim','capital','setup','finished'].includes(state.phase)?`<p class="native-status">Einheimische: zufällig +1–3 alle 3 Runden, solange ein Nachbar mindestens 2 Einheiten mehr hat; sonst +0–2 alle 5 Runden. Auch andere Einheimische zählen als Bedrohung. Überlebter Gesamtangriff: sofort +1–3 Einheiten.</p>`:''}</div><div class="history">${state.botStatus?`<p class="bot-status">${escapeHTML(state.botStatus)}</p>`:''}<h3>AM SPIELTISCH</h3><ol>${[...state.log].reverse().slice(0,5).map(l=>`<li>${escapeHTML(l)}</li>`).join('')}</ol></div>`;
  $('#close-unit-info')?.addEventListener('click',()=>{inspectedUnit=null;renderSidebar();});
  $('#inspected-unit')?.addEventListener('change',e=>{inspectedUnit.unitId=+e.target.value;renderSidebar();});
  renderCombat();
  $$('[data-place-piece]').forEach(button=>button.onclick=()=>placePiece(+button.dataset.placePiece));
  const readAmount=()=>Math.trunc(Number($('#amount')?.value ?? amount));
  $('#place')?.addEventListener('click',()=>{sound('place');act('place',{territory:selected,amount:readAmount()});});
  if($('#choose-capital'))$('#choose-capital').onclick=()=>act('capital',{territory:selected});
  $('#next')?.addEventListener('click',advancePhase);
  $$('[data-open-building]',$('#sidebar')).forEach(button=>button.onclick=()=>openBuilding(+button.dataset.openBuilding));
  $('#back-to-attack')?.addEventListener('click',()=>act('back'));
  $('#show-mission')?.addEventListener('click',()=>openModal('Deine geheime Mission',`<p class="eyebrow">NUR FÜR ${escapeHTML(state.players[state.me].name)}</p><h3>${escapeHTML(state.mission.description)}</h3><p>${escapeHTML(state.mission.progress)}</p><p class="fine">Schließe dieses Fenster, bevor du das Gerät weitergibst.</p>`));
  $('#close-finished-room')?.addEventListener('click',()=>confirmCloseRoom(state.code));
  $('#attack')?.addEventListener('click',()=>act('attack',{from:selected,to:target,dice:diceChoice}));
  $('#defend')?.addEventListener('click',()=>act('defend',{dice:defenseChoice}));
  $('#auto-defend')?.addEventListener('click',()=>autoCombat.start('defend',state.pending.from,state.pending.to));
  $('#auto-attack')?.addEventListener('click',()=>autoCombat.start('attack',selected,target));
  $('#stop-auto')?.addEventListener('click',stopAutoCombat);
  $('#occupy')?.addEventListener('click',()=>{sound('move');act('occupy',{amount:readAmount()});});
  $('#fortify')?.addEventListener('click',()=>{sound('move');act('fortify',{from:selected,to:target,amount:readAmount()});});
  $('#reset-move')?.addEventListener('click',()=>{selected=0;target=0;amount=1;renderMap();renderSidebar();});
  $('#move-target')?.addEventListener('change',e=>{if(+e.target.value)selectTerritory(+e.target.value);else {target=0;renderMap();renderSidebar();}});
  $('#move-all')?.addEventListener('click',()=>{
    const occupying=state.phase==='occupy',from=occupying?state.pending.from:selected,to=occupying?state.pending.to:target;
    sound('move');act(occupying?'occupy':'fortify',{from,to,amount:state.territories[from-1].troops-1});
  });
  $('#force-trade')?.addEventListener('click',openTrade);
  $$('[data-dice]').forEach(b=>b.onclick=()=>{if(state.phase==='defend')defenseChoice=+b.dataset.dice;else diceChoice=+b.dataset.dice;renderSidebar();});
  const adjust=n=>{amount=Math.max(min,Math.min(max,n||min));renderSidebar();};
  $$('[data-move-add]').forEach(button=>button.onclick=()=>adjust(readAmount()+Number(button.dataset.moveAdd)));
  $('#less')?.addEventListener('click',()=>adjust(readAmount()-1));$('#more')?.addEventListener('click',()=>adjust(readAmount()+1));
  $('#amount')?.addEventListener('input',e=>{amount=Math.trunc(Number(e.target.value));$('#less').disabled=amount<=min;$('#more').disabled=amount>=max;$$('[data-move-add]').forEach(button=>button.disabled=amount+Number(button.dataset.moveAdd)>max);});
  syncMobileHUD();
}
async function copyLink() {const link=`${location.origin}/#${roomCode}`;try{await navigator.clipboard.writeText(link);toast('Einladungslink kopiert.');}catch{openModal('Einladungslink',`<p>Teile diesen Link mit deinen Freunden:</p><input readonly value="${escapeHTML(link)}" aria-label="Einladungslink">`);$('input',$('#modal')).select();}}
function moveAllButton(max){return `<button class="secondary" id="move-all">Alle ${max} verfügbaren Einheiten ziehen →</button><p class="fine">Eine Einheit bleibt im Ausgangsland.</p>`;}
function cardHTML(id,selectable=false) {
  const c=board.cards[id],t=c.territory?country(c.territory):null;
  let map='';if(t){const [x,y,w,h]=t.bounds;map=`<svg class="card-map" viewBox="${x-4} ${y-4} ${w+8} ${h+8}" aria-hidden="true"><path d="${t.path}"/></svg>`;}else map='<div class="wild-symbol">✦</div>';
  return `<button class="card ${c.kind==='wild'?'wild':''} ${chosenCards.includes(id)?'selected':''}" data-card="${id}" ${selectable?'aria-pressed="'+chosenCards.includes(id)+'"':''} aria-label="${t?t.name:'Joker'}, ${kindNames[c.kind]}"><small>${kindNames[c.kind]}</small>${map}<strong>${t?t.name:'Joker'}</strong>${c.kind!=='wild'?icon(c.kind,'card-symbol'):''}<span class="card-number">${String(id+1).padStart(2,'0')}</span></button>`;
}
function renderHand() {
  const visible=state&&!['lobby','claim','capital','setup'].includes(state.phase);$('#hand-section').hidden=!visible;if(!visible)return;
  $('#hand-count').textContent=state.hand?.length||0;
  $('#hand').innerHTML=state.hand?.length?state.hand.map(id=>cardHTML(id)).join(''):'<div class="empty-hand">Erobere ein Gebiet, um am Ende der Angriffsphase eine Karte zu erhalten.</div>';
  const canTrade=!state.paused&&state.me===state.turn&&state.phase==='reinforce'&&state.tradeOpen&&(!state.forcedTrade||state.mustTrade);
  $('#trade-open').disabled=!canTrade||state.hand.length<3;
  $('#card-hint').textContent=state.mustTrade?'Ab fünf Karten musst du zu Beginn deines Zugs einen Satz eintauschen.':`Drei gleiche Symbole oder drei verschiedene bilden einen Satz. ${state.mode==='fixed'?'Feste Boni: '+fixedCardValues(board.id).join(' / ')+'.':'Nächster Satz: '+progressiveValue(state.trades)+' Einheiten.'}`;
  $$('#hand [data-card]').forEach(b=>b.onclick=()=>{if(canTrade&&state.hand.length>=3)openTrade();else{const c=board.cards[+b.dataset.card];toast(`${c.territory?country(c.territory).name:'Joker'} · ${kindNames[c.kind]}`);}});
}
function progressiveValue(n){return progressiveCardValue(n,board.id);}
function valueOfSet(ids) {
  if(ids.length!==3)return 0;const kinds=ids.map(id=>board.cards[id].kind),types=['infantry','cavalry','artillery'];let best=0;
  for(const a of types)for(const b of types)for(const c of types){const match=[a,b,c];if(kinds.some((k,i)=>k!=='wild'&&k!==match[i]))continue;if(a===b&&b===c)best=Math.max(best,{infantry:4,cavalry:6,artillery:8}[a]);else if(a!==b&&a!==c&&b!==c)best=Math.max(best,10);}
  return best&&state.mode==='progressive'?progressiveValue(state.trades):cardValue(best,board.id);
}
function openTrade(){chosenCards=[];drawTrade();}
function drawTrade(){
  const value=valueOfSet(chosenCards),eligible=state.rules==='classic'&&state.cardTerritoryBonusUsed?[]:chosenCards.map(id=>board.cards[id].territory).filter(own);
  openModal('Karten gegen Verstärkung.',`<p>Wähle drei gleiche Symbole oder je eines von jeder Art. Joker ersetzen ein Symbol.</p><div class="hand">${state.hand.map(id=>cardHTML(id,true)).join('')}</div>${eligible.length&&value?`<label for="bonus-territory">+2 Einheiten auf ein eigenes Kartengebiet</label><select id="bonus-territory">${eligible.map(id=>`<option value="${id}">${country(id).name}</option>`).join('')}</select>`:''}<p>${chosenCards.length===3?(value?`Dieser Satz bringt dir <strong>${value} neue Einheiten</strong>.`:'Diese drei Karten bilden keinen gültigen Satz.'):`${chosenCards.length} von 3 Karten gewählt.`}</p><button class="primary" id="confirm-trade" ${!value?'disabled':''}>${value?`${value} Verstärkungen erhalten`:'Drei Karten auswählen'}</button>`);
  $$('#modal [data-card]').forEach(b=>b.onclick=()=>{const id=+b.dataset.card;if(chosenCards.includes(id))chosenCards=chosenCards.filter(n=>n!==id);else if(chosenCards.length<3)chosenCards.push(id);drawTrade();});
  $('#confirm-trade').onclick=async()=>{const cards=[...chosenCards],bonus=+($('#bonus-territory')?.value||0);$('#modal').close();await act('trade',{cards,bonus});chosenCards=[];};
}
function openBuilding(id,targetLevel){
  if(!state||state.rules!=='domination'||!country(id)||state.territories[id-1]?.owner<0||animating)return;
  const room=state.code,player=state.me;
  openModal(`Gebäude · ${country(id).name}`,buildingPanel(state,id,targetLevel,isCapital(id),Object.fromEntries(board.cards.map((card,i)=>[i,`${card.territory?country(card.territory).name:'Joker'} · ${kindNames[card.kind]||card.kind}`]))));
  const picker=$('#building-target');
  if(picker)picker.onchange=e=>{openBuilding(id,+e.target.value);$('#building-target')?.focus();};
  const payment=$$('[data-building-card]',$('#modal'));
  payment.forEach(input=>input.onchange=()=>{const count=payment.filter(el=>el.checked).length;$('#building-confirm').disabled=busy||count!==Number(picker.value)-(state.territories[id-1].buildingLevel||0);});
  $('#building-confirm')?.addEventListener('click',async event=>{
    if(state.code!==room||state.me!==player)return;
    const level=+$('#building-target').value;
    event.currentTarget.disabled=true;
    await act('build',{territory:id,level,cards:payment.filter(el=>el.checked).map(el=>+el.dataset.buildingCard)});
    refreshBuildingPanel(true);
  });
}
function refreshBuildingPanel(force=false){
  const panel=$('.building-manager',$('#modal'));
  if(!$('#modal').open||!panel)return;
  if(!state||state.code!==panel.dataset.buildingRoom){$('#modal').close();return;}
  if(!force&&+panel.dataset.buildingRevision===state.revision)return;
  const id=+panel.dataset.buildingTerritory;
  const level=state.territories[id-1]?.construction?state.territories[id-1].buildingLevel:+($('#building-target')?.value||state.territories[id-1]?.buildingLevel||0);
  openBuilding(id,level);
}
function openModal(title,html){$('#modal-title').textContent=title;$('#modal-content').innerHTML=html;if(!$('#modal').open)$('#modal').showModal();}
function openRules(){
  openModal('Spielregeln',rulesTabsHTML(state||{goal:$('#game-goal')?.value||'domination',mode:$('#card-mode')?.value||'fixed',map:board.id}));
  bindRulesTabs($('#modal-content'));
}
function initZoom(){
  const svg=$('#world');
  // Geometry is stable during a gesture. Reading it for every pointer event
  // after writing SVG transforms otherwise forces Safari to update layout.
  let rect=null,safariGesture=null;
  const invalidateRect=()=>{rect=null;};
  const resizeMap=({width,height})=>{
    invalidateRect();if(!width||!height)return;
    const wasOverview=camera.zoom<=minimumZoom()+1e-6;
    const previous=viewport,center={x:(previous.width/2-camera.x)/camera.zoom,y:(previous.height/2-camera.y)/camera.zoom};
    viewport=fullscreenMap()?(width/height<1.6?{width:500*width/height,height:500}:{width:800,height:800*height/width}):{width:800,height:500};
    pixelsPerUnit=Math.max(.1,Math.min(width/viewport.width,height/viewport.height));
    if(fullscreenMap()){const area=cameraBounds();viewport.insets={left:area.x,top:area.y,right:viewport.width-area.x-area.width,bottom:viewport.height-area.y-area.height};}
    if(previous.width!==viewport.width||previous.height!==viewport.height){
      cameraMotion++;battleFocus='';
      camera.x=viewport.width/2-center.x*camera.zoom;camera.y=viewport.height/2-center.y*camera.zoom;

    }
    if(document.body.classList.contains('start-screen')||wasOverview)camera=overviewCamera();
    clampCamera(camera,board.maxZoom||6,viewport);markerRoot.classList.toggle('compact',width<700);cameraFrame.schedule();
  };
  refreshMapLayout=()=>resizeMap($('#map-frame').getBoundingClientRect());
  new ResizeObserver(entries=>resizeMap(entries[0].contentRect)).observe(svg);
  window.addEventListener('scroll',invalidateRect,{capture:true,passive:true});
  function position(e){rect ||= svg.getBoundingClientRect();const scale=Math.min(rect.width/viewport.width,rect.height/viewport.height);return {x:(e.clientX-rect.left-(rect.width-viewport.width*scale)/2)/scale,y:(e.clientY-rect.top-(rect.height-viewport.height*scale)/2)/scale};}
  svg.addEventListener('wheel',e=>{e.preventDefault();if(safariGesture)return;const p=position(e),delta=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?500:1);zoomTo(camera.zoom*Math.exp(-delta*.0015),p.x,p.y);},{passive:false});
  svg.addEventListener('pointerdown',e=>{
    if(e.button!==0)return;cameraMotion++;
    invalidateRect();pointers.set(e.pointerId,position(e));dragMoved=pointers.size>1;
    if(pointers.size>1)cancelPieceDrag();
    drag={x:camera.x,y:camera.y,zoom:camera.zoom,points:[...pointers.values()],touch:e.pointerType==='touch'};
    const node=e.target.closest('.army-figure.movable');
    if(node&&pointers.size===1&&!busy&&!animating&&!state?.paused){
      const id=+node.dataset.id;
      if(!state.pending||![state.pending.from,state.pending.to].includes(id)){
        const p=position(e),last={x:+node.dataset.x,y:+node.dataset.y};
        pieceDrag={node,id,piece:+node.dataset.piece,last,original:node.getAttribute('transform'),offset:{x:last.x-(p.x-camera.x)/camera.zoom,y:last.y-(p.y-camera.y)/camera.zoom}};
        svg.classList.add('arranging');
      }
    }
    svg.setPointerCapture(e.pointerId);
  });
  svg.addEventListener('pointermove',e=>{
    if(!pointers.has(e.pointerId)||!drag)return;
    const p=position(e);pointers.set(e.pointerId,p);const pts=[...pointers.values()];
    if(pieceDrag&&pts.length===1){
      if(Math.hypot(p.x-drag.points[0].x,p.y-drag.points[0].y)*pixelsPerUnit<4&&!dragMoved)return;
      dragMoved=true;
      const next={x:(p.x-camera.x)/camera.zoom+pieceDrag.offset.x,y:(p.y-camera.y)/camera.zoom+pieceDrag.offset.y};
      if(insideLand(pieceDrag.id,next)){pieceDrag.last=next;pieceFrame.schedule();}
      return;
    }
    if(pts.length===2&&drag.points.length===2){
      const [a,b]=drag.points,d0=Math.hypot(a.x-b.x,a.y-b.y);if(d0<1)return;
      const d1=Math.hypot(pts[0].x-pts[1].x,pts[0].y-pts[1].y),z=Math.max(minimumZoom(),Math.min(board.maxZoom||6,drag.zoom*d1/d0)),ratio=z/drag.zoom;
      camera={zoom:z,x:(pts[0].x+pts[1].x)/2-((a.x+b.x)/2-drag.x)*ratio,y:(pts[0].y+pts[1].y)/2-((a.y+b.y)/2-drag.y)*ratio};
      dragMoved=true;applyCamera();
    }else if(pts.length===1){
      const dx=p.x-drag.points[0].x,dy=p.y-drag.points[0].y;
      if(Math.hypot(dx,dy)*pixelsPerUnit>4||dragMoved){dragMoved=true;if(!drag.touch&&(fullscreenMap()||camera.zoom>1)){camera.x=drag.x+dx;camera.y=drag.y+dy;applyCamera();}}
    }
  });
  const end=e=>{
    if(!pointers.has(e.pointerId))return;
    if(pieceDrag){const d=pieceDrag,commit=e.type==='pointerup'&&dragMoved;if(commit)pieceFrame.flush();cancelPieceDrag(!commit);if(commit)figurePlacement.move(d.id,d.piece,d.last);else if(e.type==='pointerup'&&!dragMoved){inspectFigure(d.id,d.piece);dragMoved=true;}}
    // Pointer capture retargets touch clicks to the SVG: explicitly retain taps.
    else if(e.type==='pointerup'&&!dragMoved&&pointers.size===1){const hit=document.elementFromPoint(e.clientX,e.clientY);if(activateMapTarget(hit))dragMoved=true;}
    pointers.delete(e.pointerId);
    if(!pointers.size){drag=null;cameraFrame.schedule();}else drag={x:camera.x,y:camera.y,zoom:camera.zoom,points:[...pointers.values()],touch:e.pointerType==='touch'};
  };
  svg.addEventListener('pointerup',end);svg.addEventListener('pointercancel',end);svg.addEventListener('lostpointercapture',end);
  svg.addEventListener('keydown',e=>{
    if(e.key==='Escape'){cancelPieceDrag();pointers.clear();drag=null;return;}
    const node=e.target.closest('.army-figure.movable'),moves={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};
    if(!node||!moves[e.key]||busy||animating)return;e.preventDefault();
    const id=+node.dataset.id,[dx,dy]=moves[e.key],step=2/camera.zoom,p={x:+node.dataset.x+dx*step,y:+node.dataset.y+dy*step};
    if(insideLand(id,p))figurePlacement.move(id,+node.dataset.piece,p);
  });
  // Safari trackpads also deliver GestureEvents; prevent browser-page zoom
  // only while the gesture is over the game board.
  svg.addEventListener('gesturestart',e=>{e.preventDefault();if(pointers.size>=2){safariGesture=null;return;}cameraMotion++;cancelPieceDrag();invalidateRect();safariGesture={...camera,pivot:position(e)};},{passive:false});
  svg.addEventListener('gesturechange',e=>{e.preventDefault();if(!safariGesture||pointers.size>=2)return;const g=safariGesture,z=Math.max(minimumZoom(),Math.min(board.maxZoom||6,g.zoom*e.scale)),ratio=z/g.zoom;camera={zoom:z,x:g.pivot.x-(g.pivot.x-g.x)*ratio,y:g.pivot.y-(g.pivot.y-g.y)*ratio};dragMoved=true;applyCamera();},{passive:false});
  svg.addEventListener('gestureend',e=>{e.preventDefault();safariGesture=null;},{passive:false});
  $('#zoom-in').onclick=()=>zoomTo(camera.zoom*1.5);$('#zoom-out').onclick=()=>zoomTo(camera.zoom/1.5);$('#zoom-reset').onclick=()=>{cameraMotion++;camera=overviewCamera();applyCamera();};
  svg.addEventListener('dblclick',e=>{if(['claim','setup','reinforce'].includes(state?.phase))return;const p=position(e);zoomTo(camera.zoom<2?3:1,p.x,p.y);});
}
function zoomTo(z,x,y){const i=viewport.insets||{};x??=((i.left||0)+viewport.width-(i.right||0))/2;y??=((i.top||0)+viewport.height-(i.bottom||0))/2;cameraMotion++;z=Math.max(minimumZoom(),Math.min(board.maxZoom||6,z));const ratio=z/camera.zoom;camera.x=x-(x-camera.x)*ratio;camera.y=y-(y-camera.y)*ratio;camera.zoom=z;applyCamera();}
function applyCamera(){clampCamera(camera,board.maxZoom||6,viewport);cameraFrame.schedule();}
function commitCamera(){
  if(!mapCamera)return;
  const svg=$('#world'),viewBox=cameraViewBox(camera,viewport);
  if(svg.getAttribute('viewBox')!==viewBox){
    svg.setAttribute('viewBox',viewBox);
    // The decorative frame stays fixed in screen space on the classic layout.
    setAttributeChanged($('.map-neatline',svg),'transform',`translate(${-camera.x/camera.zoom} ${-camera.y/camera.zoom}) scale(${1/camera.zoom})`);
    if(!mapCamera.classList.contains('camera-moving'))mapCamera.classList.add('camera-moving');
  }
  clearTimeout(cameraIdle);
  cameraIdle=setTimeout(()=>{
    if(drag||pointers.size)return;
    mapCamera.classList.remove('camera-moving');mapDetails?.update(camera,pixelsPerUnit,viewport);
  },140);
  updateZoomDetails();
}
const facePips={1:[5],2:[1,9],3:[1,5,9],4:[1,3,7,9],5:[1,3,5,7,9],6:[1,3,4,6,7,9]};
function dieHTML(value,color,index,revealed=false){const rot={1:[0,0],2:[0,-90],3:[90,0],4:[-90,0],5:[0,90],6:[0,180]}[value];return `<div class="die-space" aria-label="${revealed?'Würfel '+value:'Würfel rollt'}"><div class="die ${color}" style="--rx:${rot[0]}deg;--ry:${rot[1]}deg;--delay:${index*65}ms">${Object.entries(facePips).map(([n,pips])=>`<div class="face face-${n}">${pips.map(p=>`<i style="grid-area:${Math.ceil(p/3)}/${(p-1)%3+1}"></i>`).join('')}</div>`).join('')}</div></div>`;}
function focusBattle(from,to,reduced){
  const key=`${from.id}:${to.id}`;
  if(battleFocus===key)return battleFocusAnimation;
  battleFocus=key;
  const frame=$('#map-frame'),bounds=frame.getBoundingClientRect();
  if(!fullscreenMap()&&(innerWidth<800||bounds.bottom>innerHeight||bounds.top<0))frame.scrollIntoView({block:'center',behavior:reduced?'instant':'smooth'});
  const max=!!board.artwork?.startsWith('historical-')?10:4,padding=!!board.artwork?.startsWith('historical-')?55:100;
  const destination=fitMapBounds(Math.min(from.x,to.x)-padding/2,Math.min(from.y,to.y)-padding/2,Math.abs(from.x-to.x)+padding,Math.abs(from.y-to.y)+padding,max);
  battleFocusAnimation=animateCamera(destination,reduced);
  return battleFocusAnimation;
}
function animateCamera(destination,reduced){
  const start={...camera},motion=++cameraMotion,began=performance.now();
  if(reduced){camera=destination;applyCamera();return Promise.resolve();}
  return new Promise(resolve=>{
    function frame(now){
      if(motion!==cameraMotion){resolve();return;}
      const t=Math.min(1,(now-began)/900),ease=t*t*(3-2*t);
      camera={zoom:start.zoom+(destination.zoom-start.zoom)*ease,x:start.x+(destination.x-start.x)*ease,y:start.y+(destination.y-start.y)*ease};
      applyCamera();if(t<1)requestAnimationFrame(frame);else resolve();
    }
    requestAnimationFrame(frame);
  });
}
function showBattlefield(fromID,toID,attackTroops,defenseTroops,fortificationTroops,attacker,defender,game=state,buildingSnapshot,constructionSnapshot,experienceSnapshot){
  const routeKey=`${game.code}:${game.round}:${attacker}:${fromID}:${toID}`;
  if(combatRoute?.key!==routeKey)combatRoute={key:routeKey,from:fromID,to:toID,expanded:false};
  setCombatExpanded(combatRoute.expanded,false);
  const from=country(fromID),to=country(toID),scene=$('#combat-scene');
  const attackName=state.players?.[attacker]?.neutral?countryBanner(from):state.players?.[attacker]?.name||'';
  const defenseName=state.players?.[defender]?.neutral?countryBanner(to):state.players?.[defender]?.name||'';
  const buildingLevel=game.rules==='domination'?(buildingSnapshot??game.territories[toID-1].buildingLevel??0):game.rules==='classic'?0:null;
  const construction=game.rules==='domination'?(constructionSnapshot===undefined?game.territories[toID-1].construction:constructionSnapshot):null;
  const experience=game.rules==='domination'?(experienceSnapshot??{a:game.territories[fromID-1].experience||[],d:game.territories[toID-1].experience||[]}):null;
  const key=JSON.stringify([experience,buildingLevel,Boolean(construction),fromID,toID,attackTroops,defenseTroops,fortificationTroops,attackName,defenseName,isCapital(toID,game)]);
  if(scene.dataset.key!==key){
    scene.innerHTML=battleScene(attackTroops,defenseTroops,displayColor(attacker),displayColor(defender),attackName,defenseName,Boolean(to.mountainous),fortificationTroops,isCapital(toID,game),buildingLevel,construction,experience);
    scene.dataset.key=key;scene.classList.remove('artillery-firing');
  }
  scene.classList.add('combat-ready');$('#dice-overlay').hidden=false;
  setCombatCompact(combatCompact,false);
  $('#battle-title').textContent=`${from.name} → ${to.name}${isCapital(toID,game)?' · Hauptstadtfestung':''}`;
}
function updateAttackRoute(){
  if(attackIntro)renderAttackRoute($('#attack-route'),attackIntro.from,attackIntro.to,1/(camera.zoom*pixelsPerUnit));
}
const battleIntro=createBattleIntro({
  show(from,to){
    attackIntro={from,to};
    hideBattlefield(true);
    $('#attack-intro-from').textContent=from.name;$('#attack-intro-to').textContent=to.name;
    $('#attack-intro-countdown').textContent='Karte wird ausgerichtet …';
    $('#attack-intro').hidden=false;$('#map-frame').classList.add('showing-attack');
    territoryNodes.get(from.id)?.land.classList.add('attack-start');
    territoryNodes.get(to.id)?.land.classList.add('attack-destination');
    $('#stop-auto-map').hidden=!autoCombat.active;
    updateZoomDetails();
  },
  focus:focusBattle,
  tick:seconds=>{$('#attack-intro-countdown').textContent=`Kampf beginnt in ${seconds} …`;},
  hide(){
    const previous=attackIntro;attackIntro=null;
    $('#attack-intro').hidden=true;$('#attack-route').innerHTML='';$('#map-frame').classList.remove('showing-attack');
    if(previous){
      territoryNodes.get(previous.from.id)?.land.classList.remove('attack-start');
      territoryNodes.get(previous.to.id)?.land.classList.remove('attack-destination');
    }
  },
});
$('#stop-auto-map').onclick=stopAutoCombat;
$('#pause-intro').onclick=togglePause;
function autoDefenseSwitch(place){
  return `<label class="auto-defense-setting" for="auto-defense-${place}"><span>${state?.hotseat?escapeHTML(state.players[state.me].name)+': automatisch verteidigen':'Immer automatisch verteidigen'}</span><input id="auto-defense-${place}" data-auto-defense type="checkbox" role="switch" aria-label="Immer automatisch verteidigen" ${(autoDefenseDraft??state?.autoDefense)?'checked':''} ${autoDefenseSaving?'disabled':''}><span class="switch-track" aria-hidden="true"></span></label>`;
}
function renderAutoDefenseSettings(){
  for(const place of ['header','combat']){
    const holder=$(`#auto-defense-${place}`);
    holder.hidden=!state||state.phase==='finished';
    holder.innerHTML=holder.hidden?'':autoDefenseSwitch(place+'-setting');
  }
  $$('[data-auto-defense]').forEach(input=>input.onchange=async()=>{
    const enabled=input.checked;autoDefenseDraft=enabled;autoDefenseSaving=true;
    renderAutoDefenseSettings();
    const ok=await act('autodefense',{enabled});
    autoDefenseSaving=false;
    if(!ok||!animating)autoDefenseDraft=null;
    renderAutoDefenseSettings();
    if(ok)toast(enabled?'Automatische Verteidigung für alle Angriffe eingeschaltet.':'Dauerhafte automatische Verteidigung ausgeschaltet.');
  });
}
function renderPauseControls(){
  for(const id of ['#pause-game','#pause-combat','#pause-intro']){
    const button=$(id);button.hidden=!state||['lobby','finished'].includes(state.phase);
    button.textContent=state?.paused?'▶ Fortsetzen':'Ⅱ Pause';
    button.setAttribute('aria-label',state?.paused?'Partie fortsetzen':'Partie pausieren');
  }
}
async function togglePause(){
  if(!state)return;
  await act('pause',{enabled:!state.paused});
}
$('#pause-game').onclick=togglePause;
$('#pause-combat').onclick=togglePause;
function setCombatExpanded(expanded,remember=true){
  expanded=expanded&&!combatCompact;
  if(remember&&combatRoute)combatRoute.expanded=expanded;
  $('#dice-overlay').classList.toggle('expanded',expanded);
  document.body.classList.toggle('combat-expanded',expanded);
  const button=$('#expand-combat');
  button.setAttribute('aria-pressed',String(expanded));
  button.setAttribute('aria-label',expanded?'Schlachtfeld verkleinern':'Schlachtfeld vergrößern');
  button.textContent=expanded?'↙ Verkleinern':'⛶ Vergrößern';
}
function setCombatCompact(compact,remember=true){
  combatCompact=compact;
  if(remember){try{localStorage.setItem('dom-combat-compact',compact?'on':'off');}catch{}}
  if(compact)setCombatExpanded(false,remember);
  $('#dice-overlay').classList.toggle('compact',compact);
  $('#combat-scene').hidden=compact;
  $('#expand-combat').hidden=compact;
  const button=$('#minimize-combat');
  button.setAttribute('aria-pressed',String(compact));
  button.setAttribute('aria-label',compact?'Kampfszene anzeigen':'Kampf minimieren: nur Würfel und Ergebnisse');
  button.textContent=compact?'▣ Kampfszene':'− Minimieren';
}
function hideBattlefield(preserveSize=false){
  $('#dice-overlay').hidden=true;
  $('#battle-controls').innerHTML='';
  setCombatExpanded(false,false);
  if(!preserveSize)combatRoute=null;
}
function renderCombat(){
  renderAutoDefenseSettings();renderPauseControls();
  if(state?.paused){hideBattlefield();updateZoomDetails();return;}
  $('#stop-auto-overlay').hidden=!autoCombat.active;
  $('#stop-auto-map').hidden=!autoCombat.active;
  $('#close-combat').hidden=animating||Boolean(autoCombat.active)||state?.phase==='defend';
  if(animating){$('#battle-controls').innerHTML='';return;}
  const pending=state?.phase==='defend'?state.pending:null;
  const watching=state?.turn!==state?.me&&combatRoute;
  const from=pending?.from||(watching?combatRoute.from:selected),to=pending?.to||(watching?combatRoute.to:target);
  const source=state?.territories[from-1],destination=state?.territories[to-1];
  const valid=state&&['attack','defend'].includes(state.phase)&&source?.owner===state.turn&&source.troops>1&&destination?.troops>0&&destination.owner!==source.owner&&country(from)?.neighbors.includes(to);
  if(!valid){hideBattlefield();updateZoomDetails();return;}
  showBattlefield(from,to,source.troops,destination.troops,destination.fortificationTroops||destination.troops,source.owner,destination.owner);
  $('#combat-scene').classList.remove('skirmishing');
  const previous=state.battle?.from===from&&state.battle?.to===to?state.battle:null;
  const revealed=attackRollRevealed(state,lastAttackRoll);
  const attack=pending?(revealed?(pending.attack||[]):[]):previous?.attack||[];
  const defense=pending?[]:previous?.defense||[];
  $('#attack-dice').classList.add('settled');
  $('#attack-dice').innerHTML=attack.length?attack.map((v,i)=>dieHTML(v,'red',i,true)).join(''):'<span class="dice-waiting">Noch nicht gewürfelt</span>';
  $('#defense-dice').innerHTML=defense.length?defense.map((v,i)=>dieHTML(v,'',i,true)).join(''):`<span class="dice-waiting">${state.rules==='classic'?'Wählt vor dem Wurf':'Wählt nach dem Angriff'}</span>`;
  $('#battle-result').textContent=!pending&&previous?`Letzter Kampf: Angriff −${previous.attackerLoss} · Verteidigung −${previous.defenderLoss}`:'';
  $('#battle-result').classList.toggle('visible',Boolean(!pending&&previous));
  let controls='';
  if(autoCombat.active){
    $('#dice-overlay .eyebrow').textContent='AUTOMATISCHER KAMPF';
    controls='<p class="combat-status">Der nächste Wurf wird vorbereitet.</p>';
  }else if(state.actor===state.me&&state.phase==='attack'){
    const limit=maxAttackDice(source,state.rules);
    $('#dice-overlay .eyebrow').textContent='ANGRIFF VORBEREITEN';
    const training=armyExperience(source);
    controls=`${state.rules==='domination'?`<p class="experience-summary">★ Ø ${training.average.toLocaleString('de-DE',{maximumFractionDigits:2})} · +${training.bonus} Angriffswürfel${limit<3+training.bonus?' (durch Truppenzahl begrenzt)':''}</p>`:''}<label>Angriffswürfel</label>${choices(limit)}<div class="combat-buttons"><button class="primary red" id="attack">Angreifen</button><button class="secondary auto-start" id="auto-attack">↻ Automatisch angreifen</button></div>`;
  }else if(state.actor===state.me&&pending&&revealed){
    $('#dice-overlay .eyebrow').textContent='VERTEIDIGUNG WÄHLEN';
    const training=armyExperience(destination),limit=maxDefenseDice(country(to),destination.troops,isCapital(to),state.rules,destination.buildingLevel||0,destination.experience);
    controls=`${state.rules==='domination'?`<p class="experience-summary">★ Ø ${training.average.toLocaleString('de-DE',{maximumFractionDigits:2})} · +${training.bonus} Verteidigungswürfel${limit<2+(destination.buildingLevel||0)+training.bonus?' (durch Truppenzahl begrenzt)':''}</p>`:''}<label>Verteidigungswürfel</label>${choices(limit,true)}<div class="combat-buttons"><button class="primary red" id="defend">Verteidigen</button><button class="secondary auto-start" id="auto-defend">Automatisch verteidigen</button></div>`;
  }else{
    $('#dice-overlay .eyebrow').textContent=pending?'WARTE AUF VERTEIDIGUNG':'SCHLACHTFELD';
    controls=`<p class="combat-status">${escapeHTML(state.players?.[state.actor]?.name||'Der Mitspieler')} ist am Zug.</p>`;
  }
  $('#battle-controls').innerHTML=controls;
}
async function closeCombat(){
  if(animating||autoCombat.active||state?.phase==='defend')return;
  const defended=state?.nativeDefense;
  if(state?.phase==='attack'&&state.turn===state.me&&defended){
    if(!await act('endattack',{from:defended.from,to:defended.to}))return;
  }
  battleIntro.cancel();hideBattlefield();battleFocus='';
  target=0;renderMap();renderSidebar();
}
$('#close-combat').onclick=closeCombat;
$('#expand-combat').onclick=()=>setCombatExpanded(!$('#dice-overlay').classList.contains('expanded'));
$('#minimize-combat').onclick=()=>setCombatCompact(!combatCompact);
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'&&$('#dice-overlay').classList.contains('expanded')){
    e.preventDefault();setCombatExpanded(false);$('#expand-combat').focus();
  }
});
async function animateAttackRoll(next,overview){
  const epoch=connectionEpoch,q=next.pending,from=country(q.from),to=country(q.to);
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  const a=next.territories[q.from-1],d=next.territories[q.to-1];
  if(!await battleIntro.present(next,from,to,reduced,overview)||epoch!==connectionEpoch)return;
  showBattlefield(q.from,q.to,a.troops,d.troops,d.fortificationTroops||d.troops,a.owner,d.owner,next);
  $('#dice-overlay .eyebrow').textContent='DER ANGRIFF WÜRFELT';
  $('#attack-dice').classList.remove('settled');
  $('#attack-dice').innerHTML=q.attack.map((v,i)=>dieHTML(v,'red',i)).join('');
  $('#defense-dice').innerHTML='<span class="dice-waiting">Wählt danach</span>';
  $('#battle-result').classList.remove('visible');$('#battle-result').textContent='';$('#dice-overlay').classList.add('rolling');
  await waitForDice($('#dice-overlay'),reduced);
  if(epoch!==connectionEpoch)return;
  lastAttackRoll=q.id;
  $('#dice-overlay').classList.remove('rolling');animating=false;
  renderSidebar();
  drainUpdates();
}
async function animateBattle(next){
  const epoch=connectionEpoch,b=next.battle,from=country(b.from),to=country(b.to);
  animating=true;renderSidebar();lastBattle=b.id;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  const attackTroops=b.attackerTroops??state.territories[b.from-1].troops,defenseTroops=b.defenderTroops??state.territories[b.to-1].troops;
  const fortificationTroops=b.fortificationTroops||state.territories[b.to-1].fortificationTroops||defenseTroops;
  if(!await battleIntro.present({...next,turn:b.attacker},from,to,reduced)||epoch!==connectionEpoch)return;
  showBattlefield(b.from,b.to,attackTroops,defenseTroops,fortificationTroops,b.attacker,b.defender,next,b.buildingLevel,b.construction??null,{a:b.attackerExperience||[],d:b.defenderExperience||[]});
  const attackSettled=b.attackId&&b.attackId===lastAttackRoll;
  $('#dice-overlay .eyebrow').textContent=attackSettled?'DIE VERTEIDIGUNG WÜRFELT':'DIE WÜRFEL FALLEN';
  $('#attack-dice').classList.toggle('settled',Boolean(attackSettled));
  $('#attack-dice').innerHTML=b.attack.map((v,i)=>dieHTML(v,'red',i,attackSettled)).join('');
  $('#defense-dice').innerHTML=b.defense.map((v,i)=>dieHTML(v,'',i)).join('');
  $('#battle-result').classList.remove('visible');$('#battle-result').textContent='';$('#dice-overlay').classList.add('rolling');
  const scene=$('#combat-scene');scene.classList.remove('combat-ready');scene.classList.toggle('skirmishing',!reduced);sound('battle');
  await waitForDice($('#dice-overlay'),reduced);
  if(epoch!==connectionEpoch)return;
  for(const [id,values] of [['#attack-dice',b.attack],['#defense-dice',b.defense]])$$('.die-space',$(id)).forEach((die,i)=>die.setAttribute('aria-label',`Würfel ${values[i]}`));
  $('#dice-overlay').classList.remove('rolling');
  scene.classList.remove('skirmishing');
  const unitCasualties=next.rules==='domination'&&b.attackerExperience?{a:b.attackerCasualties||[],d:b.defenderCasualties||[]}:null;
  const defenseArtwork=next.rules==='domination'?buildingArtworkTroops[b.buildingLevel??next.territories[b.to-1].buildingLevel??0]:next.rules==='classic'?1:isCapital(b.to,next)?Math.max(70,fortificationTroops):fortificationTroops;
  const shots=artilleryShots(attackTroops,defenseTroops,b.attackerLoss,b.defenderLoss,Boolean(to.mountainous),defenseArtwork,b.id,unitCasualties);
  $('.artillery-effects',scene).innerHTML=artilleryEffects(shots);
  if(shots.length&&!reduced&&!combatCompact){
    scene.classList.add('artillery-firing');sound('cannon');
    await new Promise(r=>setTimeout(r,cannonFlightMs));
    if(epoch!==connectionEpoch)return;
    sound('explosion');
    // The impact flashes before the struck figure collapses at its own feet.
    await new Promise(r=>setTimeout(r,90));
    if(epoch!==connectionEpoch)return;
  }
  $('#battle-result').textContent=b.conquered?`${to.name} ist erobert. ${b.attackerLoss?b.attackerLoss+' eigene Einheit verloren.':''}`:`Angriff −${b.attackerLoss} · Verteidigung −${b.defenderLoss}`;
  if(b.defenderGrowth)$('#battle-result').textContent+=` · Einheimische +${b.defenderGrowth}`;
  $('#battle-result').classList.add('visible');sound(b.conquered?'conquer':'impact');scene.classList.remove('skirmishing');
  for(const [side,troops,losses] of [['a',attackTroops,b.attackerLoss],['d',defenseTroops,b.defenderLoss]]){
    for(const figure of battleCasualties(troops,losses,side==='a',unitCasualties?.[side]??null,defenseArtwork)){
      const fighter=$(`[data-casualty="${side}-${figure.id}"]`,scene);
      fighter?.classList.add(figure.partial?'wounded':'fallen');
      if(figure.partial)fighter?.insertAdjacentHTML('beforeend',`<text class="unit-loss" y="-17" text-anchor="middle">−${figure.lost}</text>`);
    }
  }
  await new Promise(r=>setTimeout(r,reduced?650:1100));
  if(epoch!==connectionEpoch)return;
  animating=false;receive(next);drainUpdates();
}
function drainUpdates(){
  while(!animating&&queued.length)receive(queued.shift());
}
$('#modal-close').onclick=()=>$('#modal').close();$('#modal').addEventListener('click',e=>{if(e.target===$('#modal')){const r=$('#modal').getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)$('#modal').close();}});
$('#rules-open').onclick=openRules;$('#trade-open').onclick=openTrade;
$('#credits-open').onclick=()=>openModal('Ein Brettspiel. Neu am Bildschirm.',`<p>Spielkarten-Symbole, klassische Nachbarschaften, deutsche Namen und mitgelieferte kurze Sounds: Domination von Yura Mamyrin und Mitwirkenden. Original-Weltkarte: Christian Domsch, Sebastian Kirsch, Andreas Habel und Dirk Engberg. Die klassische Atlaszeichnung, historische Spielregionen, Figuren und Oberfläche wurden neu erstellt.</p><p>„Welt um 1700“ ist historisch inspiriert: 120 vereinfachte Spielregionen, keine exakte politische Karte von 1700. Singapura liegt an seiner tatsächlichen Position vor der Südspitze der Malaiischen Halbinsel und ist zur Bedienbarkeit vergrößert.</p><p>„Europa um 1871“: 71 Spielregionen, historisch angenäherte Staatsgrenzen und vereinfachte innere Gebiete. Geometrien nach <a href="https://github.com/aourednik/historical-basemaps" target="_blank" rel="noopener">André Ourednik, Historical Basemaps</a> (GPL-3.0), europäischer Ausschnitt und generalisierte Balkankorrekturen auf 1871. Referenz: <a href="https://www.loc.gov/item/2012590219/" target="_blank" rel="noopener">Asher &amp; Adams, Europakarte 1871</a>. Neutrale Länder dieser Karte führen beschriftete Banner ohne die Motive von 1700.</p><p>Einheimische führen Landesbanner mit historischen Flaggen- oder Wappenmotiven, für die Miniaturansicht vereinfacht. Wo keine eindeutige Zuordnung um 1700 vorliegt, zeigen sie ein neutrales Namensbanner. Grundlage unter anderem: <a href="https://www.royal.uk/union-jack" target="_blank" rel="noopener">britisches Königshaus</a>, <a href="https://data.riksdagen.se/dokument/G503109" target="_blank" rel="noopener">schwedischer Reichstag</a>, <a href="https://www.aboutswitzerland.eda.admin.ch/de/fahne" target="_blank" rel="noopener">Schweizer EDA</a>, <a href="https://archiv.hdbg.de/boehmen/treffpunkte/treffpunkte-texte-d/treffpunkt-bogen.htm" target="_blank" rel="noopener">Haus der Bayerischen Geschichte</a> und <a href="https://www.metmuseum.org/exhibitions/listings/2009/art-of-the-samurai/photo-gallery" target="_blank" rel="noopener">Metropolitan Museum</a>.</p><p>Küsten, Flüsse und Gebirgsregionen: <a href="https://www.naturalearthdata.com/" target="_blank" rel="noopener">Natural Earth 5.1.2</a>, Public Domain. Waldzonen: <a href="https://developers.google.com/earth-engine/datasets/catalog/RESOLVE_ECOREGIONS_2017" target="_blank" rel="noopener">RESOLVE Ecoregions 2017, Dinerstein et al.</a>, <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener">CC BY 4.0</a>, ausgewählt und vereinfacht. Sie zeigen natürliche Waldbiome, keine exakten Waldgrenzen von heute oder 1700. Häuser sind stilisierte Siedlungen an realen Orten, keine vermessenen Gebäude.</p><p>Code und abgeleitete Domination-Kartendaten: <a href="https://www.gnu.org/licenses/gpl-3.0.html" target="_blank" rel="noopener">GPL-3.0</a>. Domination: Copyright (c) 2003–2025 yura.net. Geänderte Web-Umsetzung; Namensbereinigung am 2. Oktober 2026. <a href="https://github.com/ThomasKagerer/risk" target="_blank" rel="noopener">Quellcode und vollständige Lizenzhinweise</a>. Die aktuellen Spielklänge werden im Browser synthetisiert. Die mitgelieferten Domination-Sounds behalten die Upstream-Lizenz. Die abgeleiteten RESOLVE-Daten behalten CC BY 4.0. RISK / RISIKO ist eine Marke von Hasbro; dies ist ein unabhängiges Projekt.</p>`);
function updateSound(){const waiting=soundEnabled&&soundPlayer.status==='blocked',label=waiting?'Ton fortsetzen':soundEnabled?'Ton ausschalten':'Ton einschalten';$('.sound-off').hidden=soundEnabled;$('#sound-toggle').setAttribute('aria-label',label);$('#sound-toggle').title=label;$('#sound-toggle').dataset.audioState=waiting?'waiting':soundEnabled?'ready':'off';}
let soundResumeClick=false;
for(const event of ['pointerdown','keydown'])addEventListener(event,e=>{if(e.target.closest?.('#sound-toggle'))soundResumeClick=$('#sound-toggle').dataset.audioState==='waiting';},{capture:true});
$('#sound-toggle').onclick=()=>{if(soundEnabled&&(soundResumeClick||soundPlayer.status==='blocked')){soundResumeClick=false;soundPlayer.unlock({gesture:true,recover:true});return;}soundResumeClick=false;soundEnabled=!soundEnabled;localStorage.setItem('dom-sound',soundEnabled?'on':'off');updateSound();soundPlayer.setEnabled(soundEnabled);};updateSound();
bindSoundLifecycle(soundPlayer);
try{
  const [classic,world,europe,mini,terrain,europeTerrain,config]=await Promise.all([(await fetch(new URL('./assets/board.json',import.meta.url))).json(),(await fetch(new URL('./assets/world120.json',import.meta.url))).json(),(await fetch(new URL('./assets/europe1871.json',import.meta.url))).json(),(await fetch(new URL('./assets/simple-world.json',import.meta.url))).json(),(await fetch(new URL('./assets/terrain.json',import.meta.url))).json(),(await fetch(new URL('./assets/terrain-europe1871.json',import.meta.url))).json(),api('/api/config')]);
  boardCatalog={classic,world120:world,europe1871:europe,'simple-world':mini};terrainData={world120:terrain,europe1871:europeTerrain};serverConfig=config;board=classic;initBoard();
  const code=roomCodeFromHash(location.hash);
  if(code)await resumeFromLink(code);
  else {render();refreshMapLayout();}
}catch(e){$('#sidebar').innerHTML='<div class="panel"><h2>Keine Verbindung.</h2><p>Das Spielbrett konnte nicht geladen werden. Bitte lade die Seite erneut.</p></div>';console.error(e);}
