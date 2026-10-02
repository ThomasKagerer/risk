import { hasFeature, ruleConfig, installedPackages } from '../web/content.mjs';
import './content-fixture.mjs';
import { setLanguage, localize as tr, currentLocale, serverText, localizeBoard } from '../web/i18n.mjs';
await setLanguage('de',{persist:false});
import { buildingArtworkTroops } from '../web/buildings.mjs';
import { maxAttackDice, armyExperience } from '../web/experience.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { attackRollRevealed, waitForDice, selectedDice, maxDefenseDice } from '../web/combat-ui.mjs';
import { symbols, battleFigures, battleCasualties, figureBadge, playerBanner, bannerBearer, defendingFigures, defenseHill, mountainLift, fortification, fortificationBanner, battleScene, artilleryShots, artilleryEffects, cannonFlightMs } from '../web/figures.mjs';

import { countryBanner } from '../web/country-banners.mjs';
import { createBattleIntro, attackRouteMarkup, renderAttackRoute } from '../web/battle-intro.mjs';
import { controlledContinents } from '../web/continents.mjs';

const source=await readFile(new URL('../web/app.js',import.meta.url),'utf8');
const section=(start,end)=>source.slice(source.indexOf(start),source.indexOf(end));
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};

function harness(storage=new Map()){
  const nodes=new Map(),frames=[],timers=[],renders=[],cameraMoves=[],sounds=[];
  const camera=deferred();let dice=deferred();
  const node=id=>{
    if(!nodes.has(id)){
      const classes=new Set();
      nodes.set(id,{innerHTML:'',insertAdjacentHTML(position,html){this.innerHTML+=html;},textContent:'',hidden:true,style:{},get firstChild(){return this.innerHTML?{}:null;},querySelector(){return {setAttribute(){}};},dataset:{},attributes:{},listeners:{},setAttribute(k,v){this.attributes[k]=v;},classes,
        addEventListener(type,fn){this.listeners[type]=fn;},focus(){this.focused=true;},close(){this.open=false;},
        classList:{add:name=>classes.add(name),remove:name=>classes.delete(name),contains:name=>classes.has(name),toggle(name,value){if(value)classes.add(name);else classes.delete(name);}},
        getAnimations:()=>[{animationName:'tumble',finished:dice.promise}]});
    }
    return nodes.get(id);
  };
  const context=vm.createContext({hasFeature,ruleConfig,installedPackages,tr,currentLocale,serverText,localizeBoard,
    localStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value)},
    document:{body:node('body'),addEventListener(type,fn){node('document').listeners[type]=fn;}},
    state:{code:'TEST',players:[{name:'Ada'},{name:'Ben'},{name:'Cleo'}],revision:10,phase:'attack',turn:0,actor:0,me:1,hand:[],territories:[{owner:0,troops:8},{owner:1,troops:3}]},
    attackIntro:null,combatRoute:null,camera:{zoom:1},pixelsPerUnit:1,territoryNodes:new Map([1,2,3].map(id=>[id,{land:node('#land-'+id)}])),createBattleIntro:options=>createBattleIntro({...options,schedule:(fn,ms)=>{fn.ms=ms;timers.push(fn);return fn;},cancel:fn=>{const i=timers.indexOf(fn);if(i>=0)timers.splice(i,1);}}),attackRouteMarkup,renderAttackRoute,
    connectionEpoch:1,autoDefenseDraft:null,autoDefenseSaving:false,cameraMotion:0,battleFocusAnimation:null,placementQueue:[],soundPlayer:{stop(){}},animating:false,queued:[],lastBattle:0,lastAttackRoll:0,battleFocus:'',selected:0,target:0,amount:1,diceChoice:3,defenseChoice:2,diceContexts:['',''],chosenCards:[],toast(){},autoCombat:{active:null,stop(){this.active=null;}},escapeHTML:s=>s,
    buildingArtworkTroops,maxAttackDice,armyExperience,attackRollRevealed,waitForDice,selectedDice,maxDefenseDice,armies:{setVisible(value){node('#units').hidden=!value;}},cancelPieceDrag(){},country:id=>({id,name:`Land ${id}`,x:id*20,y:30,neighbors:[1,2]}),
    matchMedia:()=>({matches:false}),focusBattle:()=>camera.promise,sound:name=>sounds.push(name),
    overviewCamera:()=>({zoom:1,x:0,y:0}),animateCamera:destination=>{cameraMoves.push(destination);return Promise.resolve();},
    $:node,$$:()=>[],performance:{now:()=>0},requestAnimationFrame:fn=>frames.push(fn),setTimeout:(fn,ms)=>{fn.ms=ms;timers.push(fn);return fn;},clearTimeout:fn=>{const i=timers.indexOf(fn);if(i>=0)timers.splice(i,1);},
    countryBanner,symbols,battleFigures,battleCasualties,figureBadge,playerBanner,bannerBearer,defendingFigures,defenseHill,mountainLift,fortification,fortificationBanner,battleScene,artilleryShots,artilleryEffects,cannonFlightMs,displayColor:()=> 'red',
    stopAutoCombat(){context.autoCombat.active=null;context.renderCombat();},renderMap(){},updateZoomDetails(){node('#units').hidden=false;context.updateAttackRoute?.();},
    render(){renders.push({revision:context.state.revision,preview:context.attackRollPreview()});context.renderCombat();},
    renderSidebar(){renders.push({revision:context.state.revision,preview:context.attackRollPreview()});context.renderCombat();},
  });
  vm.runInContext(section('let combatCompact=', 'let chosenCards')+section('function isCapital(', 'function eligible(')+section('function switchLocalPlayer(', 'function render()')+
    section('function smallDie(', 'function renderSidebar(')+
    section('const facePips=', 'function focusBattle(')+
    section('function showBattlefield(', "$('#modal-close').onclick"),context);
  return {context,node,storage,camera,renders,frames,timers,cameraMoves,sounds,async finishIntro(){await flush();while(timers[0]?.ms===1000){timers.shift()();await flush();}},get dice(){return dice;},nextDice(){dice=deferred();return dice;}};
}

test('sidebar, board and history do not reveal queued results while camera or dice animate',async()=>{
  const h=harness(),c=h.context;
  const pending={...c.state,revision:11,phase:'defend',actor:1,pending:{id:11,from:1,to:2,attack:[6,4,2]}};
  c.receive(pending);
  assert.equal(h.node('#dice-overlay').hidden,true,'the map is unobstructed before a new attack');
  assert.equal(h.node('#attack-intro').hidden,false);
  assert.match(h.node('#attack-route').innerHTML,/START/);
  assert.equal(h.node('#units').hidden,false,'the map is visible during the introduction');
  assert.equal(c.animating,true);
  assert.equal(c.lastAttackRoll,0);
  assert.match(h.renders.at(-1).preview,/Die Würfel rollen/);
  assert.doesNotMatch(h.renders.at(-1).preview,/Angriffswürfel:|rolled-die/);
  // A second update is received before even the camera transition ends.
  const battle={...pending,revision:12,phase:'attack',actor:0,pending:null,
    territories:[{owner:0,troops:7},{owner:1,troops:2}],log:['Angriff −1, Verteidigung −1'],
    battle:{id:12,attackId:11,from:1,to:2,attacker:0,defender:1,attack:[6,4,2],defense:[6,1],attackerLoss:1,defenderLoss:1}};
  c.receive(battle);
  assert.equal(c.state.revision,11);
  assert.equal(c.state.territories[0].troops,8);
  assert.equal(c.state.log,undefined);
  h.camera.resolve();await h.finishIntro();
  assert.doesNotMatch(h.node('#attack-dice').innerHTML,/aria-label="Würfel [1-6]"/);
  assert.equal(c.lastAttackRoll,0);
  const firstDice=h.dice;h.nextDice();firstDice.resolve();await flush();
  assert.equal(c.lastAttackRoll,11);
  assert.equal(h.node('#dice-overlay').hidden,false,'the battlefield stays open while choosing defense');
  assert.match(h.renders.at(-1).preview,/Angriffswürfel: 6, 4, 2/);
  assert.equal(c.state.revision,11);
  assert.equal(h.node('#battle-result').textContent,'');
  assert.equal(h.node('[data-casualty="a-infantry-0"]').classes.has('fallen'),false);
  assert.equal(h.sounds.includes('impact'),false);
  // Defense results remain withheld until the last die settles.
  for(const frame of h.frames.splice(0))frame(2000);
  await flush();
  assert.equal(h.node('#battle-result').textContent,'');
  h.dice.resolve();await flush();
  assert.match(h.node('#battle-result').textContent,/Angriff −1/);
  assert.equal(h.node('[data-casualty="a-infantry-0"]').classes.has('fallen'),true);
  assert.equal(h.sounds.includes('impact'),true);
  assert.equal(h.node('#combat-scene').classes.has('combat-ready'),false,'troops advance only during the resolved battle');
  assert.equal(c.state.territories[0].troops,8);
  h.timers.shift()();await flush();
  assert.equal(c.state.revision,12);
  assert.equal(c.state.territories[0].troops,7);
  assert.deepEqual(c.state.log,['Angriff −1, Verteidigung −1']);
  assert.equal(h.node('#dice-overlay').hidden,false,'the next round stays in the same battlefield');
  assert.equal(h.node('#combat-scene').classes.has('combat-ready'),true);
});

test('bot occupation reaches the map before the next attack countdown even when updates arrive during a battle',async()=>{
  const h=harness(),c=h.context;
  c.state={...c.state,me:2,territories:[{owner:0,troops:24},{owner:1,troops:1},{owner:2,troops:1}]};
  const conquest={...c.state,revision:11,phase:'occupy',pending:{from:1,to:2,minimum:3},
    territories:[{owner:0,troops:24},{owner:0,troops:0},{owner:2,troops:1}],
    battle:{id:11,from:1,to:2,attacker:0,defender:1,attack:[6,5,4],defense:[1],attackerTroops:24,defenderTroops:1,attackerLoss:0,defenderLoss:1,conquered:true}};
  c.receive(conquest);
  const occupied={...conquest,revision:12,phase:'attack',pending:null,
    territories:[{owner:0,troops:1},{owner:0,troops:23},{owner:2,troops:1}]};
  c.receive(occupied);
  c.receive({...occupied,revision:13,phase:'occupy',pending:{from:2,to:3,minimum:3},
    territories:[{owner:0,troops:1},{owner:0,troops:23},{owner:0,troops:0}],
    battle:{id:13,from:2,to:3,attacker:0,defender:2,attack:[6,5,4],defense:[1],attackerTroops:23,defenderTroops:1,attackerLoss:0,defenderLoss:1,conquered:true}});
  assert.equal(c.state.territories[1].owner,1,'the first conquest is still hidden until its animation finishes');
  h.camera.resolve();await h.finishIntro();h.dice.resolve();await flush();
  while(h.timers.length&&h.timers[0].ms!==1000){h.timers.shift()();await flush();}
  assert.equal(h.node('#attack-intro-from').textContent,'Land 2');
  assert.equal(h.node('#attack-intro-to').textContent,'Land 3');
  assert.equal(c.state.territories[0].troops,1,'the old source has already sent its troops');
  assert.equal(c.state.territories[1].troops,23,'the new attacking country must not still show zero');
  assert.equal(c.state.territories[2].owner,2,'the next conquest must not leak into the countdown');
  assert.equal(c.state.territories[2].troops,1);
  assert.equal(c.state.phase,'attack','the previous occupation prompt is gone');
  assert.ok(h.renders.some(view=>view.revision===12),'the occupation update is rendered before the next battle');
  assert.equal(h.node('#dice-overlay').hidden,true);
});

test('selecting an attack target opens the battlefield with attack controls before any roll',()=>{
  const h=harness(),c=h.context;
  c.state.me=0;c.selected=1;c.target=2;
  c.renderCombat();
  assert.equal(h.node('#dice-overlay').hidden,false);
  assert.equal(h.node('#combat-scene').hidden,false);
  assert.equal(h.node('#combat-scene').classes.has('combat-ready'),true);
  assert.match(h.node('#battle-controls').innerHTML,/id="attack"/);
  assert.match(h.node('#battle-controls').innerHTML,/id="auto-attack"/);
  assert.match(h.node('#attack-dice').innerHTML,/Noch nicht gewürfelt/);
  assert.equal(c.state.revision,10);
  c.closeCombat();
  assert.equal(c.target,0);
  assert.equal(h.node('#dice-overlay').hidden,true);
  assert.equal(h.node('#units').hidden,false);
});

test('a reconnected defender gets dice selection inside the existing battlefield',()=>{
  const h=harness(),c=h.context;
  c.state={...c.state,phase:'defend',actor:1,pending:{from:1,to:2,id:11,defender:1,attack:[6,5,2]}};
  c.lastAttackRoll=11;c.renderCombat();
  assert.equal(h.node('#dice-overlay').hidden,false);
  assert.match(h.node('#battle-controls').innerHTML,/id="defend"/);
  assert.match(h.node('#battle-controls').innerHTML,/id="auto-defend"/);
  assert.doesNotMatch(h.node('#battle-controls').innerHTML,/data-auto-defense/);
  assert.match(h.node('#attack-dice').innerHTML,/Würfel 6/);
  c.closeCombat();
  assert.equal(h.node('#dice-overlay').hidden,false,'a pending defense cannot be dismissed');
});

test('the final loss remains visible, then an exhausted attack closes and unlocks the page',async()=>{
  const h=harness(),c=h.context;
  c.state.me=0;c.selected=1;c.target=2;c.state.territories[0].troops=2;
  c.renderCombat();c.setCombatExpanded(true);
  const next={...c.state,revision:11,territories:[{owner:0,troops:1},{owner:1,troops:3}],
    battle:{id:11,from:1,to:2,attacker:0,defender:1,attack:[1],defense:[6,5],attackerTroops:2,defenderTroops:3,attackerLoss:1,defenderLoss:0}};
  c.receive(next);h.camera.resolve();await h.finishIntro();h.dice.resolve();await flush();
  assert.equal(h.node('#dice-overlay').hidden,false,'show the last dice and fallen figure first');
  assert.equal(h.node('#dice-overlay').classes.has('expanded'),true);
  assert.equal(h.node('[data-casualty="a-infantry-0"]').classes.has('fallen'),true);
  h.timers.shift()();await flush();
  assert.equal(c.state.territories[0].troops,1);
  assert.equal(h.node('#dice-overlay').hidden,true);
  assert.equal(h.node('#units').hidden,false);
  assert.equal(h.node('body').classes.has('combat-expanded'),false);
  assert.equal(h.node('#expand-combat').attributes['aria-pressed'],'false');
});

test('enlarging and Escape preserve a pending defense, closing or conquest reset the size',()=>{
  const h=harness(),c=h.context;
  c.state={...c.state,phase:'defend',actor:1,pending:{from:1,to:2,id:11,defender:1,attack:[6,5,2]}};
  c.lastAttackRoll=11;c.renderCombat();
  h.node('#expand-combat').onclick();
  assert.equal(h.node('#expand-combat').attributes['aria-pressed'],'true');
  assert.equal(h.node('body').classes.has('combat-expanded'),true);
  const before=h.node('#combat-scene').innerHTML;
  c.animating=true;c.renderCombat();
  assert.equal(h.node('#dice-overlay').classes.has('expanded'),true,'size survives ongoing rolls');
  let prevented=false;
  h.node('document').listeners.keydown({key:'Escape',preventDefault(){prevented=true;}});
  assert.equal(prevented,true);assert.equal(h.node('#expand-combat').focused,true);
  assert.equal(h.node('#dice-overlay').classes.has('expanded'),false);
  assert.equal(h.node('#dice-overlay').hidden,false);
  assert.equal(h.node('#combat-scene').innerHTML,before);
  c.animating=false;c.setCombatExpanded(true);c.state.phase='occupy';c.renderCombat();
  assert.equal(h.node('#dice-overlay').hidden,true);
  assert.equal(h.node('body').classes.has('combat-expanded'),false);
  c.state.phase='attack';c.state.actor=0;c.state.me=0;c.selected=1;c.target=2;c.state.pending=null;
  c.renderCombat();assert.equal(h.node('#dice-overlay').hidden,false);
  assert.equal(h.node('#dice-overlay').classes.has('expanded'),false);
});

test('a maximized battlefield survives the introduction and every roll of one attack, including spectators',async()=>{
  for(const me of [0,1,2]){
    const h=harness(),c=h.context;
    c.state.me=me;
    if(me===0){c.selected=1;c.target=2;c.renderCombat();}
    else c.showBattlefield(1,2,8,3,3,0,1);
    c.setCombatExpanded(true);
    for(const revision of [11,12]){
      const next={...c.state,revision,territories:[{owner:0,troops:8-(revision-10)},{owner:1,troops:3}],
        battle:{id:revision,from:1,to:2,attacker:0,defender:1,attack:[1],defense:[6],attackerTroops:9-(revision-10),defenderTroops:3,attackerLoss:1,defenderLoss:0}};
      c.receive(next);h.camera.resolve();await h.finishIntro();
      assert.equal(h.node('#dice-overlay').classes.has('expanded'),true,`player ${me}, roll ${revision}`);
      h.dice.resolve();await flush();h.timers.shift()();await flush();
      assert.equal(h.node('#dice-overlay').hidden,false,'the ongoing attack stays visible between rolls');
      assert.equal(h.node('body').classes.has('combat-expanded'),true);
      h.nextDice();
    }
    c.showBattlefield(1,3,6,3,3,0,1);
    assert.equal(h.node('#dice-overlay').classes.has('expanded'),false,'a different target starts at normal size');
    await c.closeCombat();
    assert.equal(h.node('#dice-overlay').hidden,true);
  }
});

test('leaving a native attack requests its survival bonus before closing the battlefield',async()=>{
  const h=harness(),c=h.context,calls=[];
  c.state.me=0;c.selected=1;c.target=2;c.state.nativeDefense={attacker:0,from:1,to:2};
  c.act=async(type,args)=>{calls.push({type,...args});return true;};
  c.renderCombat();await c.closeCombat();
  assert.deepEqual(calls,[{type:'endattack',from:1,to:2}]);
  assert.equal(h.node('#dice-overlay').hidden,true);
});

test('reconnecting during a roll cannot publish a stale result',async()=>{
  const h=harness(),c=h.context;
  c.receive({...c.state,revision:11,phase:'defend',pending:{id:11,from:1,to:2,attack:[6]}});
  h.camera.resolve();await h.finishIntro();
  c.connectionEpoch++;c.lastAttackRoll=30;
  const renderCount=h.renders.length;
  h.dice.resolve();await flush();
  assert.equal(c.lastAttackRoll,30);
  assert.equal(h.renders.length,renderCount);
});

test('pause immediately frees the map during camera, dice and artillery animations without stale continuations',async()=>{
  for(const stage of ['camera','intro','dice','projectile','result']){
    const h=harness(),c=h.context;
    const battle={...c.state,revision:12,phase:'attack',pending:null,
      territories:[{owner:0,troops:15},{owner:1,troops:2}],
      battle:{id:12,from:1,to:2,attacker:0,defender:1,attack:[6,4,2],defense:[6,1],attackerTroops:16,defenderTroops:3,attackerLoss:1,defenderLoss:1}};
    c.receive(battle);c.setCombatExpanded(true);
    if(stage==='intro'){h.camera.resolve();await flush();}
    else if(stage!=='camera'){h.camera.resolve();await h.finishIntro();}
    if(['projectile','result'].includes(stage)){h.dice.resolve();await flush();}
    if(stage==='result'){h.timers.shift()();await flush();h.timers.shift()();await flush();}
    c.receive({...battle,revision:13}); // queued before the pause
    c.receive({...battle,revision:14,paused:true,pausedBy:2});
    assert.equal(c.state.revision,14);assert.equal(c.animating,false);assert.equal(c.queued.length,0);
    assert.equal(h.node('#dice-overlay').hidden,true,stage);
    assert.equal(h.node('#units').hidden,false,stage);
    assert.equal(h.node('body').classes.has('combat-expanded'),false);
    assert.equal(h.node('#pause-game').attributes['aria-label'],'Partie fortsetzen');
    h.camera.resolve();h.dice.resolve();await flush();
    while(h.timers.length){h.timers.shift()();await flush();}
    assert.equal(c.state.revision,14);assert.equal(h.node('#dice-overlay').hidden,true,stage);
    c.receive({...battle,revision:15,paused:false});await flush();
    assert.equal(c.state.revision,15);assert.equal(c.animating,false,'the completed battle is not replayed on resume');
  }
});

test('resuming a paused pending defense shows the original dice without rolling again',async()=>{
  const h=harness(),c=h.context;
  const pending={...c.state,revision:11,phase:'defend',actor:1,pending:{from:1,to:2,id:11,defender:1,attack:[6,5,2]}};
  c.receive(pending);
  c.receive({...pending,revision:12,paused:true});
  assert.equal(c.lastAttackRoll,11);
  c.receive({...pending,revision:13,paused:false});
  assert.equal(c.animating,false);
  assert.equal(h.node('#dice-overlay').hidden,false);
  assert.match(h.node('#attack-dice').innerHTML,/Würfel 6/);
  assert.match(h.node('#battle-controls').innerHTML,/id="defend"/);
  h.camera.resolve();h.dice.resolve();await flush();
  assert.equal(c.state.revision,13);
});

test('each side loses its own matching figure, with no replacements before the next battle',async()=>{
  for(const [attackerLoss,defenderLoss] of [[2,0],[0,2],[1,1]]){
    const h=harness(),c=h.context;
    // Live state can already be ahead after a fast occupation or queued update.
    // The stored combat snapshot must determine the armies actually fighting.
    c.state.territories=[{owner:0,troops:30},{owner:1,troops:10}];
    c.receive({...c.state,revision:12,phase:'attack',pending:null,
      battle:{id:12,from:1,to:2,attacker:0,defender:1,attack:[6,4,2],defense:[6,1],attackerTroops:16,defenderTroops:3,attackerLoss,defenderLoss}});
    h.camera.resolve();await h.finishIntro();
    const initial=h.node('#combat-scene').innerHTML;
    assert.equal((initial.match(/data-casualty="a-/g)||[]).length,3);
    assert.equal((initial.match(/data-casualty="d-/g)||[]).length,3);
    for(const frame of h.frames.splice(0))frame(2000);
    h.dice.resolve();await flush();
    h.timers.shift()();await flush(); // cannonball reaches its impact
    h.timers.shift()();await flush(); // flash precedes the fall
    assert.equal(h.node('[data-casualty="a-cavalry-0"]').classes.has('fallen'),attackerLoss===2);
    assert.equal(h.node('[data-casualty="a-infantry-0"]').classes.has('fallen'),attackerLoss===1);
    assert.equal(h.node('[data-casualty="d-infantry-0"]').classes.has('fallen'),defenderLoss>0);
    assert.equal(h.node('[data-casualty="d-infantry-1"]').classes.has('fallen'),defenderLoss===2);
    assert.equal(h.node('[data-casualty="a-artillery-0"]').classes.has('fallen'),false);
    assert.equal(h.node('#combat-scene').innerHTML,initial,'no morphing or replacement figures');
    assert.equal(h.sounds.includes('dice'),false);
    h.timers.shift()();await flush();
  }
});

test('top player strip highlights the turn owner while the defender chooses dice',()=>{
  let html='';
  const context=vm.createContext({hasFeature,ruleConfig,installedPackages,tr,currentLocale,serverText,localizeBoard,state:{turn:0,actor:1,me:1,phase:'defend',players:[
    {name:'Angreifer',territories:4,troops:10,cards:2},{name:'Verteidiger',territories:3,troops:8,cards:1}]},
    $$:()=>[], $:id=>id==='#players'?{set innerHTML(value){html=value;}}:id==='#game-settings'?{}:null,
    controlledContinents,board:{continents:[],countries:[]},displayColor:()=> 'red',escapeHTML:s=>s,botPlayerDetail:()=>'',managePlayers(){},renderAutoDefenseSettings(){},renderPauseControls(){},
  });
  vm.runInContext(section('const isHost =', 'const meActing =')+section('function renderPlayers()', 'function setBoard('),context);
  context.renderPlayers();
  const cards=html.split('<div class="player ').slice(1);
  assert.match(cards[0],/^[^"]*active/);
  assert.doesNotMatch(cards[1],/^[^"]*active/);
});

test('combat uses the saved fortress strength while showing the current garrison',async()=>{
  const h=harness(),c=h.context;
  c.country=id=>({id,name:`Land ${id}`,x:id*20,y:30,mountainous:id===2});
  c.receive({...c.state,revision:12,battle:{id:12,from:1,to:2,attacker:0,defender:1,
    attack:[6],defense:[1],attackerTroops:16,defenderTroops:3,fortificationTroops:75,attackerLoss:0,defenderLoss:1}});
  h.camera.resolve();await h.finishIntro();
  const scene=h.node('#combat-scene').innerHTML;
  assert.match(scene,/data-fortification="citadel"/);
  assert.match(scene,/class="defense-hill"/);
  assert.equal((scene.match(/data-casualty="d-/g)||[]).length,3);
  assert.doesNotMatch(source,/battle-units/);
  for(const frame of h.frames.splice(0))frame(2000);
  h.dice.resolve();await flush();h.timers.shift()();await flush();
});

test('every new player turn zooms out, including opponents and bots',()=>{
  for(const nextTurn of [0,1,2]){
    const h=harness(),c=h.context;
    c.state.turn=(nextTurn+1)%3;c.state.phase='fortify';
    c.receive({...c.state,revision:11,phase:'reinforce',turn:nextTurn,actor:nextTurn});
    assert.equal(h.cameraMoves.length,1);
    assert.equal(h.cameraMoves[0].zoom,1);
    assert.equal(h.cameraMoves[0].x,0);
    assert.equal(h.cameraMoves[0].y,0);
    c.receive({...c.state,revision:12,pool:3});
    assert.equal(h.cameraMoves.length,1,'placing more reinforcements must not repeatedly reset the view');
  }
});

test('defense and mid-attack loot exchanges do not reset the turn overview',()=>{
  const h=harness(),c=h.context;
  c.lastAttackRoll=11;
  c.receive({...c.state,revision:11,phase:'defend',actor:1,pending:{id:11,from:1,to:2,attack:[4]}});
  assert.equal(h.cameraMoves.length,0);
  c.receive({...c.state,revision:12,phase:'reinforce',actor:0,pending:null,resume:'attack'});
  assert.equal(h.cameraMoves.length,0);
});

test('cannonball flight finishes and explosion begins before the actual casualty falls',async()=>{
 const h=harness(),c=h.context;
 c.state.me=0;c.selected=1;c.target=2;c.state.territories[0].troops=47;
 const next={...c.state,revision:11,territories:[{owner:0,troops:47},{owner:1,troops:2}],battle:{id:11,from:1,to:2,attacker:0,defender:1,attack:[6,5,3],defense:[1],attackerTroops:47,defenderTroops:3,attackerLoss:0,defenderLoss:1}};
 c.receive(next);h.camera.resolve();await h.finishIntro();h.dice.resolve();await flush();
 assert.match(h.node('.artillery-effects').innerHTML,/data-hit="d-infantry-0"/);
 assert.equal(h.node('[data-casualty="d-infantry-0"]').classes.has('fallen'),false);
 assert.equal(h.sounds.includes('explosion'),false);
 h.timers.shift()();await flush();
 assert.equal(h.sounds.includes('explosion'),true);
 assert.equal(h.node('[data-casualty="d-infantry-0"]').classes.has('fallen'),false);
 h.timers.shift()();await flush();
 assert.equal(h.node('[data-casualty="d-infantry-0"]').classes.has('fallen'),true);
 assert.equal(h.node('[data-casualty="a-infantry-0"]').classes.has('fallen'),false);
 h.timers.shift()();await flush();assert.equal(c.state.revision,11);
});


test('hotseat hands controls to the defender and discards previous private UI choices',async()=>{
  const h=harness(),c=h.context;
  c.state={...c.state,me:0,hotseat:true,hand:[0,3,6]};
  c.chosenCards=[0,3,6];c.placementQueue=[5,10];h.node('#modal').open=true;
  c.autoCombat.active={mode:'attack'};
  c.receive({...c.state,revision:11,me:1,actor:1,phase:'defend',hand:[1,4,7],pending:{id:11,from:1,to:2,attack:[6,4,2]}});
  assert.equal(c.state.me,1);assert.deepEqual([...c.state.hand],[1,4,7]);
  assert.equal(c.chosenCards.length,0);assert.equal(c.placementQueue.length,0);
  assert.equal(h.node('#modal').open,false);assert.equal(c.autoCombat.active,null);
  assert.equal(c.selected,1);assert.equal(c.target,2);
  await h.finishIntro();h.camera.resolve();await flush();await h.finishIntro();
  h.dice.resolve();await flush();
  assert.match(h.node('#battle-controls').innerHTML,/defend/);
});

test('dice-only preference survives new attacks and browser reloads without changing pending defense',()=>{
  const h=harness(),c=h.context;
  c.state={...c.state,phase:'defend',actor:1,pending:{from:1,to:2,id:11,defender:1,attack:[6,5,2]}};
  c.lastAttackRoll=11;c.renderCombat();c.setCombatExpanded(true);
  const controls=h.node('#battle-controls').innerHTML,dice=h.node('#attack-dice').innerHTML,pending=c.state.pending;
  h.node('#minimize-combat').onclick();
  assert.equal(h.node('#combat-scene').hidden,true);
  assert.equal(h.node('#dice-overlay').classes.has('compact'),true);
  assert.equal(h.node('#dice-overlay').classes.has('expanded'),false);
  assert.equal(h.node('#expand-combat').hidden,true);
  assert.equal(h.node('#battle-controls').innerHTML,controls);
  assert.equal(h.node('#attack-dice').innerHTML,dice);
  assert.equal(c.state.pending,pending);
  c.hideBattlefield();c.showBattlefield(1,3,8,3,3,0,1);
  assert.equal(h.node('#combat-scene').hidden,true,'new routes retain the browser preference');
  const reloaded=harness(h.storage);
  reloaded.context.showBattlefield(1,2,8,3,3,0,1);
  assert.equal(reloaded.node('#combat-scene').hidden,true,'reload retains dice-only mode');
  reloaded.node('#minimize-combat').onclick();
  assert.equal(reloaded.node('#combat-scene').hidden,false);
  assert.equal(reloaded.node('#expand-combat').hidden,false);
  const restored=harness(h.storage);restored.context.showBattlefield(1,2,8,3,3,0,1);
  assert.equal(restored.node('#combat-scene').hidden,false,'restoring the scene is remembered too');
});

test('minimizing during a roll preserves dice timing and results without waiting for invisible cannonballs',async()=>{
  const h=harness(),c=h.context;
  c.state.me=0;c.selected=1;c.target=2;c.renderCombat();
  const battle={...c.state,revision:11,territories:[{owner:0,troops:15},{owner:1,troops:2}],
    battle:{id:11,from:1,to:2,attacker:0,defender:1,attack:[6,4,2],defense:[6,1],attackerTroops:16,defenderTroops:3,attackerLoss:1,defenderLoss:1}};
  c.receive(battle);h.camera.resolve();await h.finishIntro();
  const dice=h.node('#attack-dice').innerHTML;
  h.node('#minimize-combat').onclick();
  assert.equal(c.animating,true);assert.equal(c.state.revision,10);
  assert.equal(h.node('#attack-dice').innerHTML,dice,'presentation must not restart or change the roll');
  assert.equal(h.node('#battle-result').textContent,'');
  assert.equal(h.node('#units').hidden,false,'map armies stay present across battle transitions');
  h.dice.resolve();await flush();
  assert.match(h.node('#battle-result').textContent,/Angriff −1 · Verteidigung −1/);
  assert.equal(h.timers[0].ms,1100,'only the result reading time remains');
  assert.equal(h.sounds.includes('cannon'),false);
  h.timers.shift()();await flush();
  assert.equal(c.state.revision,11);
  assert.equal(h.node('#combat-scene').hidden,true);
  assert.match(h.node('#battle-controls').innerHTML,/id="attack"/);
});

test('blocked browser storage still allows switching the battle view',()=>{
  const h=harness();h.context.localStorage.getItem=()=>{throw Error('blocked');};h.context.localStorage.setItem=()=>{throw Error('blocked');};
  assert.equal(h.context.readCombatCompact(),false);
  assert.doesNotThrow(()=>h.context.setCombatCompact(true));
  assert.equal(h.node('#combat-scene').hidden,true);
});

test('domination displays six attack choices and refreshes stars even without troop changes',()=>{
  const h=harness(),c=h.context;
  c.state={...c.state,rules:'domination',me:0,actor:0,territories:[{owner:0,troops:8,experience:Array(8).fill(5)},{owner:1,troops:3,experience:[1,3,5]}]};
  c.selected=1;c.target=2;c.renderCombat();
  assert.match(h.node('#battle-controls').innerHTML,/data-dice="6"/);
  assert.match(h.node('#battle-controls').innerHTML,/\+3 Angriffswürfel/);
  assert.match(h.node('#combat-scene').innerHTML,/data-stars="3"/);
  const key=h.node('#combat-scene').dataset.key;
  c.state.territories[0].experience=[];c.renderCombat();
  assert.notEqual(h.node('#combat-scene').dataset.key,key);
  assert.doesNotMatch(h.node('#battle-controls').innerHTML,/data-dice="4"/);
});

test('veteran defenders get building plus experience dice, capped by their army',()=>{
  const h=harness(),c=h.context;
  c.state={...c.state,rules:'domination',phase:'defend',actor:1,me:1,pending:{id:11,from:1,to:2,attack:[6,4,2]},territories:[{owner:0,troops:8},{owner:1,troops:12,buildingLevel:5,experience:Array(12).fill(5)}]};
  c.lastAttackRoll=11;c.renderCombat();
  assert.match(h.node('#battle-controls').innerHTML,/data-dice="10"/);
  assert.match(h.node('#battle-controls').innerHTML,/\+3 Verteidigungswürfel/);
  assert.equal(c.defenseChoice,10);
  c.state.territories[1].troops=4;c.renderCombat();
  assert.doesNotMatch(h.node('#battle-controls').innerHTML,/data-dice="5"/);
  assert.match(h.node('#battle-controls').innerHTML,/durch Truppenzahl begrenzt/);
  assert.equal(c.defenseChoice,4);
});

test('battle reveals the selected casualty and only shows earned stars after the result',async()=>{
 const h=harness(),c=h.context;
 c.state={...c.state,rules:'domination',me:0,actor:0,territories:[{owner:0,troops:4},{owner:1,troops:3}]};
 const next={...c.state,revision:11,territories:[{owner:0,troops:3,experience:[0,1,1]},{owner:1,troops:2,experience:[1,1]}],battle:{id:11,from:1,to:2,attacker:0,defender:1,attackerTroops:4,defenderTroops:3,buildingLevel:0,attack:[6,1],defense:[5,4],attackerLoss:1,defenderLoss:1,attackerExperience:[0,0,0,0],defenderExperience:[0,0,0],attackerCasualties:[2],defenderCasualties:[0]}};
 c.selected=1;c.target=2;c.receive(next);h.camera.resolve();await h.finishIntro();
 assert.doesNotMatch(h.node('#combat-scene').innerHTML,/class="unit-experience"/);
 h.dice.resolve();await flush();
 assert.equal(h.node('[data-casualty="a-infantry-2"]').classes.has('fallen'),true);
 assert.equal(h.node('[data-casualty="a-infantry-0"]').classes.has('fallen'),false);
 h.timers.shift()();await flush();
 assert.match(h.node('#combat-scene').innerHTML,/class="unit-experience"/);
 assert.equal(c.state.revision,11);
});
