import { bundledCatalog } from './content-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { setLanguage, localize as tr } from '../web/i18n.mjs';
import { configureContent, hasFeature, ruleConfig } from '../web/content.mjs';
import { startScreenMarkup } from '../web/start-screen.mjs';
import { maxAttackDice } from '../web/experience.mjs';
import { maxDefenseDice } from '../web/combat-ui.mjs';
import { fixedCardValues } from '../web/card-values.mjs';
import { rulesTabsHTML } from '../web/rules.mjs';
await setLanguage('de',{persist:false});
const markup=()=>startScreenMarkup({mapPicker:'',description:'',name:'',email:'',lastRoom:'',code:''});
test('the start screen and rule tabs only offer installed DLCs',()=>{
 configureContent({packages:[],maps:[],rules:[{id:'classic',name:'Klassisch',goals:['domination','mission']}]});
 try {
  assert.match(markup(),/value="classic"/);assert.doesNotMatch(markup().split('<select id="game-rules">')[1].split('</select>')[0],/value="domination"/);
  assert.doesNotMatch(rulesTabsHTML(),/rules-tab-domination/);
  assert.equal(hasFeature('domination','buildings'),false);
 }finally{configureContent(bundledCatalog);}
 assert.match(markup(),/value="domination">Aufbau &amp; Eroberung · DLC/);
 assert.match(rulesTabsHTML(),/rules-tab-domination/);
});
test('another rule ID uses its capabilities and snapshotted experience thresholds',()=>{
 const config={id:'new-rules',name:'Neue Regeln',goals:['domination'],buildings:true,experience:true,starThresholds:[2,4,6]};
 const game={rules:'new-rules',ruleConfig:config};
 assert.equal(ruleConfig(game),config);
 assert.equal(maxAttackDice({troops:8,experience:Array(8).fill(1)},game),3);
 assert.equal(maxAttackDice({troops:8,experience:Array(8).fill(6)},game),6);
 assert.equal(maxDefenseDice({},8,false,game,2,Array(8).fill(6)),7);
});
test('map card scaling is supplied by DLC metadata without changing classic rules',()=>{
 assert.deepEqual(fixedCardValues('simple-world'),[2,3,4,5]);
 assert.deepEqual(fixedCardValues('world120'),[4,6,8,10]);
 assert.equal(hasFeature('classic','buildings'),false);
});

test('Aufbau & Eroberung supplies rules without adding a map',()=>{
 const pkg=bundledCatalog.packages.find(p=>p.id==='aufbau-eroberung');
 assert.deepEqual(pkg.maps,[]);
 assert.equal(pkg.rules[0].id,'domination');
 assert.equal(bundledCatalog.maps.some(m=>m.id==='aufbau-eroberung'),false);
 assert.match(markup(),/value="domination">Aufbau &amp; Eroberung · DLC/);
});
