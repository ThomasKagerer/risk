import { localize as tr } from './i18n.mjs';
const escape = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const count = value => Math.max(0,Number(value)||0);
const row = (label,value,detail='') => `<div class="income-row"><div>${escape(label)}${detail?`<small>${escape(detail)}</small>`:''}</div><strong>+${count(value)}</strong></div>`;

function incomeRows(income) {
  if(!income)return tr('<p class="statistics-note">Die reguläre Vergabe dieses Zugs wurde noch nicht erfasst.</p>');
  const territories=count(income.territories),troops=count(income.territoryTroops);
  return row(tr('Grundverstärkung / Länderbesitz'),troops,tr`${territories} Gebiete ÷ 3, abgerundet · mindestens 3 Einheiten`)+
    (income.continents||[]).map(c=>row(tr(c.name),c.bonus,tr('Vollständig kontrollierter Kontinent'))).join('')+
    (!(income.continents||[]).length?tr('<div class="income-empty">Kein Kontinentbonus</div>'):'');
}

function turnHTML(turn,board,open) {
  const trades=turn.trades||[];
  return tr`<details class="income-turn" data-income-round="${count(turn.round)}" ${open?'open':''}><summary><span>Runde ${count(turn.round)}</span><strong>+${count(turn.total)} Einheiten</strong></summary><div class="income-breakdown">${incomeRows(turn.income)}${trades.map((trade,i)=>row(tr`Kartentausch ${i+1}`,trade.troops)+(trade.territoryTroops?row(tr('Bonus für eigenes Kartengebiet'),trade.territoryTroops,board.countries.find(c=>c.id===trade.territory)?.name||tr`Gebiet ${trade.territory}`):'')).join('')}${!trades.length?tr('<div class="income-empty">Kein Kartentausch in diesem Zug</div>'):''}<div class="income-total"><span>Tatsächlich erhalten</span><strong>+${count(turn.total)}</strong></div></div></details>`;
}

export function playerStatisticsHTML(game,board,player,{expanded}={}) {
  const p=game?.players?.[player];
  if(!p)return '';
  const stats=p.reinforcements,combat=p.combat,history=stats?.history||[];
  const latest=history.at(-1);
  let html=tr`<section class="player-inspection" data-statistics-player="${player}" data-statistics-room="${escape(game.code)}"><div class="player-overview"><div><strong>${count(p.territories)}</strong><span>Gebiete</span></div><div><strong>${count(p.troops)}</strong><span>Truppen</span></div>${!p.neutral?tr`<div><strong>${count(p.cards)}</strong><span>Karten</span></div>`:''}</div>`;
  if(game.goal==='capital'&&p.capital){
    const capital=board.countries.find(c=>c.id===p.capital),held=game.territories?.[p.capital-1]?.owner===player;
    html+=tr`<p class="player-capital"><strong>Hauptstadt:</strong> ${escape(capital?.name||tr`Gebiet ${p.capital}`)} · ${held?`${count(game.territories[p.capital-1].troops)} ${game.territories[p.capital-1].troops===1?tr('Einheit'):tr('Einheiten')}`:tr('verloren · ausgeschieden')}</p>`;
  }
  if(p.neutral){
    html+=game.setup==='frontier'?tr('<h3>Verstärkung der Einheimischen</h3><p>Einheimische erhalten keine reguläre Länder-, Kontinent- oder Kartenverstärkung. Ihre Länder wachsen unabhängig voneinander nach den Einheimischen-Regeln.</p>'):tr('<h3>Neutrale Armee</h3><p>Neutrale Armeen erhalten nach der Startaufstellung keine reguläre Länder-, Kontinent- oder Kartenverstärkung.</p>');
  }else{
    html+=tr('<h3>Woher kommen die Verstärkungen?</h3>');
    if(history.length){
      html+=tr`<p class="income-caption">Tatsächliche Vergaben · neueste zuerst${latest?.round===game.round&&game.turn===player?tr(' · aktueller Zug'):''}</p>`;
      html+=[...history].reverse().map(turn=>turnHTML(turn,board,expanded?expanded.has(String(turn.round)):turn===latest)).join('');
      html+=tr`<div class="income-recorded-total"><span>Insgesamt erfasst · ${count(stats.recordedTurns)} ${stats.recordedTurns===1?tr('Zug'):tr('Züge')}</span><strong>+${count(stats.total)}</strong></div><p class="fine">Ohne Startaufstellung. ${stats.recordedTurns>history.length?tr`Hier siehst du die letzten ${history.length} Vergaben; die Gesamtsumme enthält alle erfassten Züge.`:''}</p>`;
    }else html+=tr('<p>Noch keine Verstärkungsvergabe erfasst.</p>');
    if(!stats||stats.partial){
      html+=tr`<p class="statistics-note">${stats?.sinceRound?tr`Erfassung ab Runde ${count(stats.sinceRound)}. `:''}Frühere Verstärkungen sind in diesem Spielstand nicht gespeichert.</p>`;
    }
    if(stats?.next){
      html+=tr`<section class="income-forecast"><h3>Nächster Zug bei unverändertem Besitz</h3><div class="income-breakdown">${incomeRows(stats.next)}<div class="income-total"><span>Reguläre Verstärkung</span><strong>+${count(stats.next.total)}</strong></div></div><p class="fine">Vorschau, noch nicht erhalten. Künftige Kartentausche kommen zusätzlich dazu.</p></section>`;
    }else if(!p.territories&&!['lobby','claim'].includes(game.phase))html+=tr('<p>Ausgeschieden · keine weiteren Verstärkungen.</p>');
    else if(['lobby','claim','capital','setup'].includes(game.phase))html+=tr('<p>Reguläre Verstärkungen beginnen nach der Startaufstellung.</p>');
  }
  html+=tr('<h3>Kampfstatistik</h3>');
  html+=combat?tr`<div class="player-overview combat-overview"><div><strong>${count(combat.killed)}</strong><span>Gegnerische Truppen besiegt</span></div><div><strong>${count(combat.lost)}</strong><span>Eigene Truppen verloren</span></div><div><strong>${count(combat.attacked)}</strong><span>Gebietsangriffe</span></div></div><p class="fine">Mehrere Würfe gegen dasselbe Gebiet zählen pro Runde als ein Gebietsangriff.${combat.partial?tr` Erfasst ab Runde ${count(combat.sinceRound)}.`:''}</p>`:tr('<p>Noch keine Kampfstatistik erfasst.</p>');
  return html+'</section>';
}
