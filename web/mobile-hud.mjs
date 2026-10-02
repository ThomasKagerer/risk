const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icons = {
  orders:'<path d="m5 15 10-10 4 4-10 10H5v-4ZM12 8l4 4M5 5h3M19 16v3h-3"/>',
  cards:'<rect x="7" y="3" width="13" height="17" rx="2"/><path d="M4 6H3v15h13M13.5 7l3 4-3 4-3-4Z"/>',
  players:'<circle cx="9" cy="7" r="3"/><path d="M3 20v-3a6 6 0 0 1 12 0v3M16 4a3 3 0 0 1 0 6M18 13a5 5 0 0 1 3 5v2"/>',
  atlas:'<path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2V5ZM9 3v16M15 5v16"/>',
  menu:'<path d="M4 6h16M4 12h16M4 18h16"/>',
};
const icon = key => `<svg viewBox="0 0 24 24" aria-hidden="true">${icons[key]}</svg>`;
const phases = {claim:'Startländer wählen',capital:'Hauptstadt wählen',setup:'Armee aufstellen',reinforce:'Verstärken',attack:'Angreifen',defend:'Verteidigen',occupy:'Nachrücken',fortify:'Bewegen',finished:'Partie beendet'};

// One short instruction stays on the map. Full controls use the same live DOM
// as desktop so state changes never leave a second set of stale game handlers.
export function mobileOrder(game, selected = 0, target = 0, countries = []) {
  if (!game) return {title:'',hint:''};
  const name = id => countries.find(c=>c.id===id)?.name || 'Gebiet';
  const mine = game.actor === game.me, territory = game.territories?.[selected-1];
  if (game.paused) return {title:'Partie pausiert',hint:'Karte erkunden oder gemeinsam fortsetzen.',action:'#resume-game',label:'Fortsetzen'};
  if (game.phase === 'finished') return {title:`${game.players[game.winner]?.name} gewinnt`,hint:'Sieh dir den Verlauf der Partie an.',sheet:'statistics',label:'Statistik'};
  if (!mine) return {title:`${game.players[game.actor]?.name || 'Gegner'} ist am Zug`,hint:selected?`${name(selected)} · ${territory?.troops || 0} Einheiten`:'Du kannst die Karte weiter erkunden.'};
  switch (game.phase) {
    case 'claim': return {title:'Wähle ein freies Startland',hint:game.rules==='classic'?'Alle Länder werden reihum verteilt · Antippen besetzt es.':`${game.players[game.me].territories} von ${game.map==='simple-world'?2:5} gewählt · Antippen besetzt es.`};
    case 'capital': return {title:territory?.owner===game.me?name(selected):'Wo soll deine Hauptstadt stehen?',hint:'Wähle eines deiner eigenen Länder.',action:territory?.owner===game.me?'#choose-capital':null,label:'Hauptstadt festlegen'};
    case 'setup': case 'reinforce':
      if (game.mustTrade) return {title:'Karten eintauschen',hint:'Deine Karten bringen neue Verstärkung.',action:'#force-trade',label:'Karten wählen'};
      return {title:selected?name(selected):'Wähle ein eigenes Land',hint:selected?'Einheit, Pferd oder Kanone setzen.':'Tippe auf der Karte, um zu verstärken.',placement:true};
    case 'attack': return {title:selected?name(selected):'Wähle dein Angriffsland',hint:target?`Ziel: ${name(target)}`:selected?(game.rules==='domination'?'Burg ausbauen unter „Befehle“ oder Gegner antippen.':'Tippe auf einen angrenzenden Gegner.'):'Mindestens 2 Einheiten nötig.',action:'#next',label:'Angriffe beenden'};
    case 'defend': return {title:'Dein Land wird angegriffen',hint:'Wähle deine Würfel im Schlachtfeld.'};
    case 'occupy': return {title:`${name(game.pending.to)} erobert`,hint:'Wähle, wie viele Einheiten nachrücken.',sheet:'orders',label:'Truppen wählen'};
    case 'fortify': return {title:game.moved?'Truppen verschoben':target?'Wie viele ziehen mit?':selected?'Wähle dein Zielland':'Wähle ein eigenes Startland',hint:game.moved?'Dein Zug ist bereit zum Abschluss.':selected&&!target?(game.rules==='classic'?'Tippe auf ein angrenzendes eigenes Land.':'Tippe auf ein verbundenes eigenes Land.'):'Du kannst einmal pro Zug Truppen bewegen.',...(target&&!game.moved?{sheet:'orders',label:'Truppen wählen'}:{action:'#next',label:'Zug beenden'})};
    default:return {title:phases[game.phase]||'',hint:''};
  }
}

export function createMobileHUD({onLayout = ()=>{}, onMapSelection = ()=>{}} = {}) {
  const $ = selector => document.querySelector(selector);
  const media = matchMedia('(max-width: 900px), (pointer: coarse) and (max-width: 1200px)');
  const root = document.createElement('div'); root.id='mobile-hud'; root.hidden=true;
  root.innerHTML=`<header class="hud-top"><button class="hud-turn" data-sheet="players" aria-label="Spieler und Kontinente anzeigen"><span class="hud-round"></span><strong class="hud-actor"></strong></button><div class="hud-top-actions"></div><div class="hud-resources"></div></header>
    <section class="hud-dock" aria-label="Aktueller Spielbefehl"><button class="hud-order-copy" data-sheet="orders"><small class="hud-phase"></small><strong class="hud-order-title"></strong><span class="hud-order-hint"></span></button><div class="hud-quick-actions"></div></section>
    <section class="hud-sheet" id="hud-sheet" aria-labelledby="hud-sheet-title" hidden><header class="hud-sheet-header"><div><small>KOMMANDOZENTRALE</small><h2 id="hud-sheet-title"></h2></div><button class="hud-close" aria-label="Zur Karte">×</button></header><div class="hud-sheet-scroll">
    ${['orders','cards','players','atlas','menu','statistics'].map(id=>`<div data-hud-panel="${id}" hidden></div>`).join('')}</div></section>
    <nav class="hud-nav" aria-label="Spielbereiche">${[['orders','Befehle'],['cards','Karten'],['players','Spieler'],['atlas','Kontinente'],['menu','Menü']].map(([id,label])=>`<button data-sheet="${id}" aria-expanded="false" aria-controls="hud-sheet">${icon(id)}<span>${label}</span>${id==='cards'?'<b class="hud-card-count">0</b>':''}</button>`).join('')}</nav>`;
  document.body.append(root);
  const panel = id => root.querySelector(`[data-hud-panel="${id}"]`);
  panel('menu').innerHTML='<p class="hud-help">Zwei Finger verschieben und zoomen die Karte. Mit einem Finger wählst du Länder oder verschiebst eigene Figuren.</p><div class="hud-menu-items"></div>';
  panel('cards').innerHTML='<p class="hud-empty-cards" hidden>Noch keine Karten. Erobere ein Land und beende deinen Zug, um eine Karte zu erhalten.</p>';
  panel('atlas').innerHTML='<p class="hud-help">Tippe auf einen Kontinent: Die Karte zeigt seine Grenzen. Erneutes Antippen hebt die Auswahl auf.</p>';
  let active=false, snapshot={}, current='', returnFocus=null, previousKey='', savedScroll=0;
  const moved=[];
  function move(selector, destination) {
    const node=$(selector), anchor=document.createComment('mobile HUD home');
    node.before(anchor); destination.append(node); moved.push({node,anchor});
  }
  function setActive(value) {
    if (value===active) return;
    active=value; root.hidden=!value; document.body.classList.toggle('mobile-game',value);
    if (value) {
      savedScroll=window.scrollY;
      for(const [selector,dest] of [['#sidebar',panel('orders')],['#hand-section',panel('cards')],['#players',panel('players')],['#continents',panel('atlas')],['#ownership-key',panel('atlas')],['#focus-territory',panel('atlas')],['#game-statistics',panel('statistics')],['#sound-toggle',root.querySelector('.hud-top-actions')],['#pause-game',root.querySelector('.hud-top-actions')]]) move(selector,dest);
      for(const selector of ['#connection','#reconnect','#auto-defense-header','#rules-open','#choose-map','#credits-open']) move(selector,root.querySelector('.hud-menu-items'));
      window.scrollTo(0,0);
    } else {
      close(false);
      for(const {node,anchor} of moved) anchor.replaceWith(node);
      moved.length=0;
      window.scrollTo(0,savedScroll);
    }
    onLayout(value);
  }
  function close(focus=true) {
    current='';root.querySelector('.hud-sheet').hidden=true;root.querySelector('.hud-dock').hidden=false;
    root.querySelectorAll('[data-sheet]').forEach(button=>button.setAttribute('aria-expanded','false'));
    document.body.classList.remove('hud-sheet-open');
    if(focus&&returnFocus?.isConnected) returnFocus.focus({preventScroll:true});
  }
  function open(id, focus=true) {
    if(!active)return;
    if(current===id){close();return;}
    current=id;returnFocus=document.activeElement;
    root.querySelector('.hud-sheet').hidden=false;root.querySelector('.hud-dock').hidden=true;
    document.body.classList.add('hud-sheet-open');
    root.querySelectorAll('[data-hud-panel]').forEach(node=>node.hidden=node.dataset.hudPanel!==id);
    root.querySelectorAll('[data-sheet]').forEach(button=>button.setAttribute('aria-expanded',String(button.dataset.sheet===id)));
    $('#hud-sheet-title').textContent=snapshot.game?.hotseat&&['orders','cards'].includes(id)?`${id==='cards'?'Karten':'Befehle'} · ${snapshot.game.players[snapshot.game.me].name}`:{orders:'Deine Befehle',cards:'Deine Karten',players:'Die Armeen',atlas:'Kontinente & Suche',menu:'Spieloptionen',statistics:'Spielstatistik'}[id];
    root.querySelector('.hud-sheet-scroll').scrollTop=0;
    if(focus) root.querySelector('.hud-close').focus({preventScroll:true});
  }
  function update(next=snapshot) {
    snapshot=next;const {game,selected=0,target=0,countries=[]}=next;
    setActive(Boolean(game&&game.phase!=='lobby'));
    if(!active){previousKey='';return;}
    const order=mobileOrder(game,selected,target,countries),p=game.players[game.me];
    root.style.setProperty('--seat-color',['#b84e40','#477ca0','#b59036','#6c8753','#896b91','#ad7350'][game.actor]||'#414e4b');
    const set=(selector,text)=>{const node=root.querySelector(selector);if(node.textContent!==String(text))node.textContent=text;};
    set('.hud-round',`RUNDE ${game.round || 1} · ${game.goal==='mission'?'MISSION':game.rules==='classic'?'KLASSISCH':game.goal==='capital'?'HAUPTSTADT':'AUFBAU & EROBERUNG'}`);
    set('.hud-actor',game.paused?'Partie pausiert':game.actor===game.me&&!game.hotseat?'Du bist am Zug':`${game.players[game.actor]?.name || 'Gegner'} ist am Zug`);
    set('.hud-phase',game.paused?'PAUSE':`${phases[game.phase]}${game.hotseat?' · '+game.players[game.actor].name:''}`);set('.hud-order-title',order.title);set('.hud-order-hint',order.hint);
    set('.hud-card-count',game.hand?.length||0);
    const reserve=game.phase==='setup'?p?.reserve:game.phase==='reinforce'?game.pool:0;
    root.querySelector('.hud-resources').innerHTML=`<span><b>${p?.territories||0}</b> Länder</span><span><b>${p?.troops||0}</b> Einheiten</span>${reserve&&game.actor===game.me?`<span class="hud-reserve"><b>+${reserve}</b> setzen</span>`:`<span>${escape(phases[game.phase])}</span>`}`;
    panel('cards').querySelector('.hud-empty-cards').hidden=Boolean(game.hand?.length);
    let actions='';
    if(order.placement) {
      const pieces=[...document.querySelectorAll('#sidebar [data-place-piece]')];
      actions=pieces.map(button=>`<button class="hud-place" data-proxy="#sidebar [data-place-piece='${button.dataset.placePiece}']" ${button.disabled?'disabled':''} aria-label="${escape(button.getAttribute('aria-label'))}">${button.querySelector('svg')?.outerHTML || ''}<b>+${button.dataset.placePiece}</b></button>`).join('');
    } else if(order.sheet) actions=`<button class="hud-primary" data-sheet="${order.sheet}">${escape(order.label)} →</button>`;
    else if(order.action&&$(order.action)) actions=`<button class="hud-primary" data-proxy="${order.action}" ${$(order.action).disabled?'disabled':''}>${escape(order.label)} →</button>`;
    const actionsNode=root.querySelector('.hud-quick-actions');
    if(actionsNode.innerHTML!==actions)actionsNode.innerHTML=actions;
    const key=`${game.code}:${game.actor}:${game.phase}:${game.paused}:${game.mustTrade}`;
    if(previousKey&&key!==previousKey) close(false);
    if(key!==previousKey&&game.phase==='finished')open('statistics',false);
    if(key!==previousKey&&game.actor===game.me&&game.phase==='occupy')open('orders',false);
    previousKey=key;
  }
  root.addEventListener('click',event=>{
    const button=event.target.closest('button');if(!button)return;
    if(button.dataset.sheet)open(button.dataset.sheet);
    if(button.dataset.proxy){const source=$(button.dataset.proxy);if(source&&!source.disabled)source.click();}
  });
  root.querySelector('.hud-close').onclick=()=>close();
  document.addEventListener('keydown',event=>{if(active&&current&&event.key==='Escape'&&!$('#modal').open){event.preventDefault();close();}});
  $('#world').addEventListener('pointerdown',()=>{if(active&&current)close(false);},true);
  panel('atlas').addEventListener('click',event=>{if(event.target.closest('[data-continent]')){close(false);onMapSelection();}});
  panel('atlas').addEventListener('change',event=>{if(event.target.id==='focus-territory'){close(false);onMapSelection();}});
  let swipe=null;const handle=root.querySelector('.hud-sheet-header');
  handle.addEventListener('pointerdown',event=>{if(event.target.closest('button'))return;swipe={x:event.clientX,y:event.clientY,id:event.pointerId};handle.setPointerCapture(event.pointerId);});
  handle.addEventListener('pointerup',event=>{if(swipe&&event.clientY-swipe.y>55&&Math.abs(event.clientX-swipe.x)<70)close();swipe=null;});
  handle.addEventListener('pointercancel',()=>{swipe=null;});
  media.addEventListener('change',()=>update());
  // Hide the command sheet for the map's attack announcement without losing
  // its controls or intercepting the route/countdown.
  new MutationObserver(()=>{const intro=!$('#attack-intro').hidden;document.body.classList.toggle('hud-attack-intro',intro);if(intro&&active)close(false);}).observe($('#attack-intro'),{attributes:true,attributeFilter:['hidden']});
  return {update,open,close,get active(){return active;}};
}
