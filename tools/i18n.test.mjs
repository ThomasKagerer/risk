import './content-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {languages,readLanguage,validLanguage,setLanguage,currentLanguage,currentLocale,localize as tr,serverText,localizeBoard,formatNumber} from '../web/i18n.mjs';
import serverMessages from '../web/server-messages.mjs';
import {countryBanner} from '../web/country-banners.mjs';
import {buildingNames} from '../web/buildings.mjs';
import {statisticsHTML} from '../web/statistics.mjs';
const catalogs=Object.fromEntries(await Promise.all(languages.map(async l=>[l.code,(await import(`../web/locales/${l.code}.mjs`)).default])));
const placeholders=s=>[...s.matchAll(/\{\d+\}/g)].map(m=>m[0]).sort();

test('seven complete local catalogs retain every interpolation',()=>{
 const keys=Object.keys(catalogs.en).sort();assert.ok(keys.length>1000);
 assert.deepEqual(languages.map(l=>l.code),['en','de','fr','it','es','zh','ja']);
 for(const [code,catalog] of Object.entries(catalogs)){
  assert.deepEqual(Object.keys(catalog).sort(),keys,code);
  for(const [key,value] of Object.entries(catalog)){
   assert.equal(typeof value,'string');assert.ok(value.trim(),`${code}: ${key}`);
   assert.deepEqual(placeholders(value),placeholders(key),`${code}: ${key}`);
  }
 }
});
test('English is the default for absent, invalid and inaccessible preferences',()=>{
 assert.equal(readLanguage(undefined),'en');assert.equal(readLanguage({getItem:()=>null}),'en');
 assert.equal(readLanguage({getItem:()=>{throw Error('denied');}}),'en');
 assert.equal(readLanguage({getItem:()=> 'ja'}),'ja');assert.equal(validLanguage('xx'),'en');
 const child=spawnSync(process.execPath,['--input-type=module','-e',"const m=await import('./web/i18n.mjs');console.log(m.currentLanguage());"],{cwd:new URL('../',import.meta.url),encoding:'utf8'});
 assert.equal(child.status,0);assert.equal(child.stdout.trim(),'en');
});
test('HTML translations retain attributes, markup and player supplied values',async()=>{
 await setLanguage('en',{persist:false});
 assert.equal(tr(' \n '),' \n ');assert.equal(tr(undefined),'');
 assert.equal(tr('Quellen & Credits'),'Sources & credits');
 assert.equal(tr('Runde {900}'),'Round {900}');
 assert.equal(tr`<i>${'unchanged'}</i><span>Runde ${7}</span>`, '<i>unchanged</i><span>Round 7</span>');
 const name='Angriff <b>{0}</b>',code='ABC123';
 assert.equal(tr`${name} gewinnt.`,`${name} wins.`);
 assert.equal(tr`<button data-room="${code}" aria-label="Partie ${code} beenden und entfernen">Beenden</button>`,`<button data-room="ABC123" aria-label="End and remove game ABC123">End</button>`);
 assert.equal(tr`<strong>${name}</strong>`, `<strong>${name}</strong>`);
});
test('server logs, compound missions and status preserve player names',async()=>{
 await setLanguage('en',{persist:false});
 assert.equal(serverText('Angriff erhält 5 Verstärkungen.',['Angriff']),'Angriff receives 5 reinforcements.');
 assert.equal(serverText('Besetze 18 Länder deiner Wahl mit jeweils mindestens 2 Einheiten.'),'Occupy 18 territories of your choice with at least 2 units each.');
 assert.equal(serverText('Besetze vollständig: Nordamerika, Afrika sowie eine weitere Region deiner Wahl.'),'Fully occupy: North America, Africa and one additional region of your choice.');
 assert.equal(serverText('1 / 2 vorgegebene Regionen · 0 / 1 weitere'),'1 / 2 required regions · 0 / 1 additional');
 assert.equal(serverText('Angriff erfüllt seine Mission und gewinnt: Besetze 24 Länder deiner Wahl.',['Angriff']),'Angriff completes their mission and wins: Occupy 24 territories of your choice.');
 assert.equal(serverText('Angriff · Lokaler Strategie-Bot',['Angriff']),'Angriff · Local strategy bot');
 assert.equal(serverText('Unknown new server response'),'Unknown new server response');
});
test('backend message formats stay covered by the local catalogs',()=>{
 for(const file of readdirSync(new URL('../',import.meta.url)).filter(f=>f.endsWith('.go')&&!f.endsWith('_test.go'))){
  const source=readFileSync(new URL('../'+file,import.meta.url),'utf8');
  for(const m of source.matchAll(/(?:\.note|fmt\.Sprintf|fmt\.Errorf)\("((?:[^"\\]|\\.)*)"/g)){
   let index=0;const key=JSON.parse('"'+m[1]+'"').replace(/%[sdvf]/g,()=>`{${index++}}`);
   if(m[0].startsWith('.note'))assert.ok(Object.hasOwn(catalogs.en,key),`${file}: missing ${key}`);
   if(Object.hasOwn(catalogs.en,key)&&/\{\d+\}/.test(key))assert.ok(serverMessages.includes(key),`${file}: ${key}`);
  }
 }
});
test('maps retain geographic IDs and historic banner motifs in every language',async()=>{
 const source={id:'world120',name:'Welt um 1700',countries:[{id:1,name:'Kurfürstentum Bayern',label:'Bayern',labelLines:['Bay-','ern'],polity:'Kurfürstentum Bayern',continent:1}],continents:[{id:1,name:'Europa'}]};
 for(const {code,locale} of languages){
  await setLanguage(code,{persist:false});const board=localizeBoard(source);
  assert.equal(currentLanguage(),code);assert.equal(currentLocale(),locale);
  assert.equal(board.countries[0].id,1);assert.equal(board.countries[0].sourceName,'Kurfürstentum Bayern');
  assert.equal(board.countries[0].name,catalogs[code]['Kurfürstentum Bayern']);assert.equal(board.continents[0].name,catalogs[code].Europa);
  assert.equal(buildingNames[0],catalogs[code].Holzhütte);
  assert.equal(countryBanner(board.countries[0]).motif,'bavaria');
  if(code!=='de')assert.ok(!board.countries[0].labelLines.includes('Bay-'));
 }
 assert.deepEqual(source.countries[0].labelLines,['Bay-','ern']);
});
test('numeric formatting follows the language and charts translate metric labels',async()=>{
 for(const {code,locale} of languages){
  await setLanguage(code,{persist:false});assert.equal(formatNumber(1234.5),new Intl.NumberFormat(locale).format(1234.5));
  const html=statisticsHTML({round:1,players:[]},{metric:'reinforcements'});
  assert.ok(html.includes(catalogs[code]['Verstärkungen erhalten']),code);
 }
});
