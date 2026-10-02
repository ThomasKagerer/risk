import test from 'node:test';
import assert from 'node:assert/strict';
import { combatTotals,combatSeries,chartMaximum,statisticsHTML } from '../web/statistics.mjs';
const statistics={sinceRound:1,rounds:[{round:1,players:[{lost:2,killed:3,attacked:[2,2,4]},{lost:3,killed:2}]},{round:3,players:[{lost:4,killed:1,attacked:[2]},{lost:1,killed:4}]}]};
const game={code:'CHTEST',round:3,winner:0,players:[{name:'<img src=x>'},{name:'Ben'},{name:'Neuling'}],statistics};
test('end statistics aggregate per-round distinct countries and both sides of losses',()=>{
 assert.deepEqual(combatTotals(statistics,3),[{lost:6,killed:4,attacked:3},{lost:4,killed:6,attacked:0},{lost:0,killed:0,attacked:0}]);
 assert.deepEqual(combatTotals(statistics,3,'2'),Array.from({length:3},()=>({lost:0,killed:0,attacked:0})));
 assert.deepEqual(combatTotals(statistics,3,'3')[0],{lost:4,killed:1,attacked:1});
});
test('chart fills quiet rounds and keeps running totals through missing combat records',()=>{
 const data=combatSeries(game);
 assert.deepEqual(data.rounds,[1,2,3]);
 assert.deepEqual(data.players[0].values,[2,2,6]);
 assert.deepEqual(data.players[1].values,[3,3,4]);
 assert.deepEqual(data.players[2].values,[0,0,0]);
 assert.deepEqual(combatSeries(game,{cumulative:false}).players[0].values,[2,0,4]);
 assert.deepEqual(combatSeries(game,{metric:'attacked'}).players[0].values,[2,2,3]);
 assert.deepEqual(combatSeries(game,{metric:'killed'}).players[0].values,[3,3,4]);
});
test('chart replaces the round dropdown, labels players and safely escapes their names',()=>{
 const html=statisticsHTML(game,{index:1});
 assert.match(html,/class="statistics-series/);assert.match(html,/aria-valuenow="2"/);
 assert.doesNotMatch(html,/<select|<table/);
 assert.match(html,/&lt;img src=x&gt;/);assert.doesNotMatch(html,/<img/);
 assert.match(html,/Neuling/);assert.doesNotMatch(html,/Aktivierung/);
 assert.match(statisticsHTML({...game,statistics:null}),/noch keine Kampfstatistiken/);
});
test('partial history starts at its recorded round and never invents earlier totals',()=>{
 const partial={...game,statistics:{...statistics,partial:true,sinceRound:2}};
 assert.deepEqual(combatSeries(partial).rounds,[2,3]);
 assert.deepEqual(combatSeries(partial).players[0].values,[0,4]);
 assert.match(statisticsHTML(partial),/Erfasst ab Aktivierung in Runde 2/);
 assert.match(statisticsHTML(partial),/aria-valuemin="2"/);
});
test('empty and single-round games render finite axes and inspectable zero values',()=>{
 const empty={...game,round:1,statistics:{sinceRound:1,rounds:[]}};
 const html=statisticsHTML(empty);
 assert.doesNotMatch(html,/NaN|Infinity/);
 assert.match(html,/cx="500"/);
 assert.match(html,/aria-valuemax="1"/);
 for(const values of [[],[0],[1],[12,6],[2021]]){
  const max=chartMaximum(values);
  assert.ok(Number.isFinite(max)&&max>=Math.max(1,...values));
  assert.equal(max%4,0);
 }
});
test('player filtering removes their line but keeps their labelled value available',()=>{
 const html=statisticsHTML(game,{hidden:new Set([1])});
 assert.equal((html.match(/class="statistics-series /g)||[]).length,2);
 assert.match(html,/data-stat-player="1" aria-pressed="false"/);
 assert.match(html,/data-stat-value="1">4/);
});

test('reinforcement curves count actual income including exchanges, direct bonuses and native growth',()=>{
 const g={...game,reinforcementStatistics:{sinceRound:1,turns:[
  {round:1,player:0,total:18,income:{total:6},trades:[{troops:10,territoryTroops:2}]},
  {round:1,player:1,total:3}, {round:2,player:0,total:6},
  {round:2,player:0,total:4,trades:[{troops:4}]}, {round:3,player:2,total:5,nativeTroops:5}
 ]}};
 const options={metric:'reinforcements'};
 assert.deepEqual(combatSeries(g,options).players.map(p=>p.values),[[18,28,28],[3,3,3],[0,0,5]]);
 assert.deepEqual(combatSeries(g,{...options,cumulative:false}).players[0].values,[18,10,0]);
 const html=statisticsHTML(g,options);
 assert.match(html,/Verstärkungen erhalten/);
 assert.match(html,/data-stat-metric="reinforcements" aria-pressed="true"/);
 assert.match(html,/Starttruppen und Truppenverschiebungen zählen nicht/);
});
test('reinforcement history has its own start round and missing legacy data is never a zero curve',()=>{
 const g={...game,reinforcementStatistics:{sinceRound:2,partial:true,turns:[{round:2,player:0,total:4}]}};
 const options={metric:'reinforcements'};
 assert.deepEqual(combatSeries(g,options).rounds,[2,3]);
 assert.deepEqual(combatSeries(g,options).players[0].values,[4,4]);
 assert.match(statisticsHTML(g,options),/Frühere Verstärkungen sind nicht enthalten/);
 assert.match(statisticsHTML({...g,statistics:null},options),/statistics-plot/);
 const missing=statisticsHTML(game,options);
 assert.match(missing,/noch keine Verstärkungen erfasst/);
 assert.doesNotMatch(missing,/statistics-plot|statistics-series/);
 assert.match(missing,/data-stat-metric="lost"/);
});
