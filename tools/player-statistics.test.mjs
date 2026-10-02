import test from 'node:test';
import assert from 'node:assert/strict';
import { playerStatisticsHTML } from '../web/player-statistics.mjs';

const income={territories:6,territoryTroops:3,continents:[{id:2,name:'Großbritannien',bonus:3}],total:6};
const board={countries:[{id:1,name:'Island'},{id:2,name:'Irland'}]};
const player={name:'Ada',territories:6,troops:25,cards:3,capital:2,reinforcements:{next:income,sinceRound:1,partial:false,recordedTurns:1,total:18,history:[{round:4,income,trades:[{troops:10,territory:2,territoryTroops:2}],total:18}]},combat:{lost:2,killed:3,attacked:1}};
const game={code:'ABCDEF',phase:'reinforce',goal:'capital',round:4,turn:0,players:[player],territories:[{owner:1,troops:3},{owner:0,troops:5}]};

test('player details separate actual card and continent awards from the next turn forecast',()=>{
 const html=playerStatisticsHTML(game,board,0);
 for(const text of ['Grundverstärkung / Länderbesitz','Großbritannien','Kartentausch 1','Bonus für eigenes Kartengebiet','Irland','+18','+10','+2','Nächster Zug bei unverändertem Besitz','noch nicht erhalten','5 Einheiten','Gegnerische Truppen besiegt'])assert.ok(html.includes(text),text);
 assert.match(html,/data-income-round="4" open/);
 assert.match(html,/data-statistics-player="0"/);
});
test('legacy history is explicitly partial and never presented as zero past income',()=>{
 const p={...player,reinforcements:{partial:true,sinceRound:9,total:4,recordedTurns:1,history:[{round:9,trades:[{troops:4}],total:4}]}};
 const html=playerStatisticsHTML({...game,players:[p]},board,0);
 assert.match(html,/reguläre Vergabe dieses Zugs wurde noch nicht erfasst/);
 assert.match(html,/Erfassung ab Runde 9/);
 assert.doesNotMatch(html,/Nächster Zug/);
});
test('native, eliminated and empty players remain inspectable without invented income',()=>{
 for(const p of [{...player,neutral:true},{...player,territories:0,reinforcements:{history:[]}},{name:'Neu',territories:0}]){
  const html=playerStatisticsHTML({...game,players:[p]},board,0);
  assert.doesNotMatch(html,/NaN|undefined|Infinity|Nächster Zug/);
 }
 assert.match(playerStatisticsHTML({...game,players:[{...player,neutral:true}]},board,0),/keine reguläre/);
 assert.equal(playerStatisticsHTML(game,board,8),'');
});
test('detail text escapes names and refresh preserves the expanded rounds',()=>{
 const p={...player,reinforcements:{...player.reinforcements,next:{...income,continents:[{name:'<img src=x>',bonus:2}]}}};
 const html=playerStatisticsHTML({...game,players:[p]},board,0,{expanded:new Set()});
 assert.match(html,/&lt;img src=x&gt;/);assert.doesNotMatch(html,/<img|data-income-round="4" open/);
});
