import { localize as tr } from './i18n.mjs';
const escape = s => String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const metrics = {lost:'Einheiten verloren',killed:'Einheiten getötet',attacked:'Länder angegriffen',reinforcements:'Verstärkungen erhalten'};
const palette = ['#b84e40','#477ca0','#b59036','#6c8753','#896b91','#ad7350','#414e4b'];
const playerColor = (game,i) => game.players[i].neutral?'#414e4b':i<6?palette[i]:`hsl(${(i*137.508)%360} 43% 40%)`;
const sessions = new WeakMap();

export function combatTotals(statistics,playerCount,round='total') {
 const totals=Array.from({length:playerCount},()=>({lost:0,killed:0,attacked:0}));
 for(const entry of statistics?.rounds||[]) {
  if(round!=='total'&&entry.round!==Number(round))continue;
  entry.players.forEach((p,i)=>{if(totals[i]){totals[i].lost+=p.lost;totals[i].killed+=p.killed;totals[i].attacked+=new Set(p.attacked||[]).size;}});
 }
 return totals;
}

export function combatSeries(game,{metric='lost',cumulative=true}={}) {
 if(!metrics[metric])metric='lost';
 const history=metric==='reinforcements'?game.reinforcementStatistics:game.statistics;
 const first=Math.max(1,history?.sinceRound||1),last=Math.max(first,game.round||first);
 const rounds=Array.from({length:last-first+1},(_,i)=>first+i);
 const records=new Map((game.statistics?.rounds||[]).map(r=>[r.round,r.players]));
 const income=new Map();
 for(const turn of game.reinforcementStatistics?.turns||[]){const key=`${turn.round}:${turn.player}`;income.set(key,(income.get(key)||0)+turn.total);}
 const players=game.players.map((player,id)=>{
  let total=0;
  const values=rounds.map(round=>{
   const entry=records.get(round)?.[id];
   const value=metric==='reinforcements'?(income.get(`${round}:${id}`)||0):metric==='attacked'?new Set(entry?.attacked||[]).size:entry?.[metric]||0;
   total+=value;
   return cumulative?total:value;
  });
  return {id,name:player.name,neutral:!!player.neutral,values};
 });
 return {rounds,players,metric,cumulative};
}

export function chartMaximum(values) {
 const maximum=values.reduce((max,value)=>Math.max(max,value),1),rawStep=maximum/4,unit=10**Math.floor(Math.log10(rawStep));
 const step=[1,2,2.5,5,10].map(n=>Math.max(1,Math.ceil(n*unit))).find(n=>n>=rawStep);
 return step*4;
}
const pointX=(index,count)=>count===1?500:index/(count-1)*1000;
const pointY=(value,maximum)=>230-value/maximum*220;
const tickIndices=count=>[...new Set(Array.from({length:Math.min(6,count)},(_,i)=>Math.round(i*(count-1)/Math.max(1,Math.min(6,count)-1))))];

export function statisticsHTML(game,settings={}) {
 const statistics=settings.metric==='reinforcements'?game.reinforcementStatistics:game.statistics;
 const data=combatSeries(game,settings),hidden=settings.hidden||new Set(),index=Math.min(data.rounds.length-1,Math.max(0,settings.index??data.rounds.length-1));
 const visible=data.players.filter(p=>!hidden.has(p.id));
 const maximum=chartMaximum(visible.flatMap(p=>p.values));
 const title=tr(metrics[data.metric]),x=pointX(index,data.rounds.length);
 const values=visible.map(p=>`${p.name}: ${p.values[index]}`).join(', ');
 const controls=tr`<div class="statistics-heading"><div><span class="eyebrow">SPIELAUSWERTUNG</span><h2>Die Partie im Verlauf</h2></div><div class="statistics-mode" role="group" aria-label="Werte im Diagramm"><button type="button" data-stat-mode="total" aria-pressed="${data.cumulative}">Kumuliert</button><button type="button" data-stat-mode="round" aria-pressed="${!data.cumulative}">Pro Runde</button></div></div>
 <div class="statistics-metrics" role="group" aria-label="Kennzahl im Diagramm">${Object.entries(metrics).map(([key,name])=>`<button type="button" data-stat-metric="${key}" aria-pressed="${data.metric===key}">${tr(name)}</button>`).join('')}</div>`;
 if(!statistics)return controls+`<p class="statistics-note">${data.metric==='reinforcements'?tr('Für diese ältere Partie wurden noch keine Verstärkungen erfasst. Frühere Vergaben lassen sich aus dem Spielstand nicht zuverlässig rekonstruieren.'):tr('Für diese ältere Partie wurden noch keine Kampfstatistiken erfasst.')}</p>`;
 return controls+tr`
 ${statistics.partial?tr`<p class="statistics-note">Erfasst ab Aktivierung in Runde ${statistics.sinceRound}. ${data.metric==='reinforcements'?tr('Frühere Verstärkungen'):tr('Frühere Kämpfe')} sind nicht enthalten.</p>`:''}
 <div class="statistics-chart-heading"><h3>${title}</h3><span>${data.cumulative?tr('Summe bis zur gewählten Runde'):tr('Werte der gewählten Runde')}</span></div>
 <div class="statistics-plot-layout"><div class="statistics-y-labels" aria-hidden="true">${Array.from({length:5},(_,i)=>{const value=maximum*i/4;return `<span style="top:${pointY(value,maximum)/2.4}%">${value}</span>`;}).join('')}</div>
 <div class="statistics-plot" role="slider" tabindex="0" aria-label="Runde im Verlaufsdiagramm" aria-valuemin="${data.rounds[0]}" aria-valuemax="${data.rounds.at(-1)}" aria-valuenow="${data.rounds[index]}" aria-valuetext="Runde ${data.rounds[index]}: ${escape(values)}">
 <svg viewBox="0 0 1000 240" preserveAspectRatio="none" aria-hidden="true"><g class="statistics-grid">${Array.from({length:5},(_,i)=>`<path d="M0 ${pointY(maximum*i/4,maximum)}H1000"/>`).join('')}</g>
 ${visible.map(p=>`<path class="statistics-series ${p.neutral?'neutral-series':''}" stroke="${playerColor(game,p.id)}" d="${p.values.map((v,i)=>`${i?'L':'M'}${pointX(i,data.rounds.length).toFixed(2)},${pointY(v,maximum).toFixed(2)}`).join('')}"/>`).join('')}
 <path class="statistics-cursor" d="M${x} 0V240"/>
 ${visible.map(p=>`<ellipse class="statistics-point" data-stat-point="${p.id}" cx="${x}" cy="${pointY(p.values[index],maximum)}" rx="5" ry="5" fill="${playerColor(game,p.id)}"/>`).join('')}
 </svg></div><div class="statistics-x-labels" aria-hidden="true">${tickIndices(data.rounds.length).map(i=>`<span style="left:${pointX(i,data.rounds.length)/10}%">${data.rounds[i]}</span>`).join('')}</div></div>
 <div class="statistics-round-readout"><strong data-stat-round>Runde ${data.rounds[index]}</strong><span>Rundenverlauf · Maus, Antippen oder ← →</span></div>
 <div class="statistics-legend" role="group" aria-label="Spieler im Diagramm">${data.players.map(p=>tr`<button type="button" data-stat-player="${p.id}" aria-pressed="${!hidden.has(p.id)}" ${visible.length===1&&!hidden.has(p.id)?'disabled':''} style="--series-color:${playerColor(game,p.id)}" title="${escape(p.name)} im Diagramm ein- oder ausblenden"><i aria-hidden="true"></i><span>${escape(p.name)}${p.id===game.winner?tr(' <small>Sieger</small>'):p.neutral?tr(' <small>Neutral</small>'):''}</span><b data-stat-value="${p.id}">${p.values[index]}</b></button>`).join('')}</div>
 <p class="fine">${data.cumulative?tr('Die Linien addieren die Werte von Runde zu Runde.'):tr('Jeder Punkt zeigt die Werte einer einzelnen Runde.')} ${data.metric==='reinforcements'?tr('Gezählt werden tatsächlich erhaltene Grundverstärkungen, Kontinentboni, Kartentausche und direkte Kartengebietsboni. Bei Einheimischen zählt das Wachstum einschließlich überlebter Angriffe. Starttruppen und Truppenverschiebungen zählen nicht.'):tr('Ein angegriffenes Land zählt je Spieler und Runde einmal, auch bei mehreren Würfen. Verluste und Abschüsse zählen im Angriff und in der Verteidigung.')}</p>`;
}

export function renderStatisticsChart(panel,game) {
 let settings=sessions.get(panel);
 if(!settings||settings.code!==game.code){settings?.resize?.disconnect();settings={code:game.code,metric:'lost',cumulative:true,hidden:new Set()};sessions.set(panel,settings);}
 const draw=(focusSelector)=>{
  panel.innerHTML=statisticsHTML(game,settings);
  bindControls();
  if(focusSelector)panel.querySelector(focusSelector)?.focus({preventScroll:true});
  const plot=panel.querySelector('.statistics-plot');
  if(!plot){settings.resize?.disconnect();return;}
  const data=combatSeries(game,settings);
  settings.index=Math.min(data.rounds.length-1,Math.max(0,settings.index??data.rounds.length-1));
  const visible=data.players.filter(p=>!settings.hidden.has(p.id));
  const maximum=chartMaximum(visible.flatMap(p=>p.values));
  const selectRound=index=>{
   settings.index=Math.min(data.rounds.length-1,Math.max(0,index));
   const x=pointX(settings.index,data.rounds.length),round=data.rounds[settings.index];
   panel.querySelector('[data-stat-round]').textContent=tr`Runde ${round}`;
   panel.querySelector('.statistics-cursor').setAttribute('d',`M${x} 0V240`);
   for(const p of data.players){
    panel.querySelector(`[data-stat-value="${p.id}"]`).textContent=p.values[settings.index];
    const point=panel.querySelector(`[data-stat-point="${p.id}"]`);
    if(point){point.setAttribute('cx',x);point.setAttribute('cy',pointY(p.values[settings.index],maximum));}
   }
   plot.setAttribute('aria-valuenow',round);
   plot.setAttribute('aria-valuetext',tr`Runde ${round}: ${visible.map(p=>`${p.name}: ${p.values[settings.index]}`).join(', ')}`);
  };
  // Scale just the dots in screen space, keeping the paths and axes responsive.
  const sizeDots=()=>{
   const width=plot.getBoundingClientRect().width;
   if(width)for(const point of plot.querySelectorAll('ellipse'))point.setAttribute('rx',4500/width);
  };
  settings.resize?.disconnect();
  settings.resize=new ResizeObserver(sizeDots);settings.resize.observe(plot);sizeDots();
  const inspect=event=>{
   const rect=plot.getBoundingClientRect();
   if(rect.width)selectRound(Math.round((event.clientX-rect.left)/rect.width*(data.rounds.length-1)));
  };
  plot.addEventListener('pointermove',inspect);
  plot.addEventListener('pointerdown',inspect);
  plot.addEventListener('keydown',event=>{
   let index=settings.index??data.rounds.length-1;
   if(event.key==='ArrowLeft')index--;else if(event.key==='ArrowRight')index++;else if(event.key==='Home')index=0;else if(event.key==='End')index=data.rounds.length-1;else return;
   event.preventDefault();selectRound(index);
  });
 };
 const bindControls=()=>{
  for(const button of panel.querySelectorAll('[data-stat-metric]'))button.addEventListener('click',()=>{settings.metric=button.dataset.statMetric;draw(`[data-stat-metric="${settings.metric}"]`);});
  for(const button of panel.querySelectorAll('[data-stat-mode]'))button.addEventListener('click',()=>{settings.cumulative=button.dataset.statMode==='total';draw(`[data-stat-mode="${button.dataset.statMode}"]`);});
  for(const button of panel.querySelectorAll('[data-stat-player]'))button.addEventListener('click',()=>{const id=+button.dataset.statPlayer;if(settings.hidden.has(id))settings.hidden.delete(id);else settings.hidden.add(id);draw(`[data-stat-player="${id}"]`);});
 };
 draw();
}

export function clearStatisticsChart(panel) {sessions.get(panel)?.resize?.disconnect();sessions.delete(panel);panel.innerHTML='';}
