import { localize as tr } from './i18n.mjs';
import { fixedCardValues, progressiveCardValue } from './card-values.mjs';
import { installedRules, customRuleHelp, ruleConfig, mapConfig } from './content.mjs';
function classicRulesHTML(game={rules:'classic',mode:'progressive'}){
  const classic=game.rules==='classic',mini=(mapConfig(game.map).cardDivisor||1)>1;
  const fixed=fixedCardValues(game.map);
  const progression=Array.from({length:10},(_,i)=>progressiveCardValue(i,game.map)).join(', ');
  return tr`<p class="eyebrow">${tr('KLASSISCH')}</p><h3>Das Ziel</h3><p>${game.goal==='mission'?tr('Erfülle als Erster deinen geheimen Auftrag. Es gibt Länderaufträge (24 Länder oder 18 mit jeweils mindestens zwei Einheiten), Kontinentaufträge und Aufträge gegen eine bestimmte Armee. Auf anderen Karten werden die Länderziele proportional angepasst; auf Europa gelten passende Regionen. Nennt der Auftrag deine eigene Armee, gilt stattdessen das Länderziel. Eine fremde Zielarmee zählt auch dann als besiegt, wenn ein anderer Spieler sie ausschaltet. Deinen Auftrag und Fortschritt findest du unter „Meine geheime Mission“.'):tr('Besiege die anderen Spieler und erobere die Welt.')}</p><h3>Der Start</h3><p>${tr('Alle Länder der gewählten Karte werden verteilt. Auf der klassischen Weltkarte sind es 42 Länder. Bei 3 / 4 / 5 / 6 Spielern erhält jeder insgesamt 35 / 30 / 25 / 20 Einheiten. Bei Welteroberung besetzt ihr reihum ein freies Land. Bei Mission (ab drei Spielern) werden geheime Aufträge und zufällige Startländer verteilt. Danach verteilt ihr die übrigen Einheiten einzeln. Startarmeen werden an die Kartengröße angepasst, auch auf der Mini-Welt mit 20 Gebieten. Im Duell erhalten beide Spieler und eine passive neutrale Armee auf der 42er-Karte je 14 zufällige Länder und insgesamt 40 Einheiten; auf anderen Karten entsprechend angepasst. Jeder Spieler setzt abwechselnd zwei eigene und eine neutrale Einheit. Die neutrale Armee wächst nicht und greift nicht an. Für den Sieg genügt es, den anderen Spieler zu besiegen.')}${mapConfig(game.map).multiPlacement?' '+tr('Beim Aufstellen kannst du Figuren mit 1, 5 oder 10 Einheiten platzieren.'):''}</p><h3>Verstärken</h3><p>Zu Beginn deines Zugs erhältst du ein Drittel deiner Länder als Einheiten, abgerundet, mindestens drei. Vollständig gehaltene Kontinente geben den auf der Karte angegebenen Bonus. Klicke auf einen Spieler, um die Herkunft seiner Verstärkungen zu sehen.</p><h3>Angreifen und verteidigen</h3><p>Weiss gestrichelte Linien markieren spielbare Seeübergänge zwischen Ländern. </p><p>Greife aus einem eigenen Gebiet mit mindestens zwei Einheiten einen benachbarten Gegner an. Eine Einheit bleibt zurück; du würfelst mit ${tr('höchstens drei Würfeln')}. ${tr('Die Verteidigung wählt vor dem Wurf bis zu zwei Würfel, höchstens einen je Verteidiger. Berge und Gebäude ändern diese Regeln nicht.')} Die höchsten Würfel werden paarweise verglichen. Bei Gleichstand gewinnt die Verteidigung. Nach einer Eroberung rücken mindestens so viele Einheiten nach wie beim letzten Angriff Würfel eingesetzt wurden.</p><h3>Karten</h3><p>Wer in seinem Zug mindestens ein Land erobert, erhält am Zugende eine Karte. Drei gleiche Symbole oder drei verschiedene bilden einen Satz; Joker ersetzen ein Symbol. ${classic||game.mode==='progressive'?tr`Die Tauschfolge gilt für alle Spieler gemeinsam: ${progression}, …${mini?tr(' Auf der Mini-Welt werden Kartenboni halbiert und abgerundet.'):tr(' Danach jeweils fünf mehr.')}`:tr`Feste Boni: drei Infanteriekarten bringen ${fixed[0]}, drei Kavalleriekarten ${fixed[1]}, drei Artilleriekarten ${fixed[2]} und ein gemischter Satz ${fixed[3]} Einheiten.`} Gehört dir ein Land aus deinem Satz, erhält eines dieser Länder zusätzlich zwei Einheiten${classic?tr(' – höchstens einmal pro Zug'):''}. Tausche, bevor du Verstärkungen platzierst. Mit mindestens fünf Karten ist ein Tausch zu Beginn verpflichtend.</p><p>Du erhältst die Karten eines ausgeschalteten Gegners. Hast du danach mindestens sechs, tauschst du sofort, bis höchstens vier bleiben, setzt die Verstärkung und setzt deinen Angriff fort.</p><h3>Truppen bewegen</h3><p>Zum Abschluss darfst du einmal Einheiten ${classic?tr('in ein angrenzendes eigenes Land'):tr('über eine zusammenhängende Kette eigener Länder')} verschieben. Eine Einheit bleibt im Ausgangsland.</p>`;
}

export function rulesHTML(game={}) {
 const help=customRuleHelp(game);
 if(help)return help;
 if(game.rules&&game.rules!=='classic'){
  const r=ruleConfig(game);
  return `<h3>${escape(tr(r.name))}</h3><p>${escape(tr(r.description))}</p>`+
   (r.buildings?`<h3>${tr('Gebäude')}</h3><table class="building-rules"><tbody>${(r.buildingNames||[]).map((name,i)=>`<tr><td>${escape(tr(name))}</td><td>${r.buildingTurns[i]}</td><td>${i+2}</td></tr>`).join('')}</tbody></table>`:'')+
   (r.experience?`<p>★ ${r.starThresholds.join(' / ')}</p>`:'')+
   (r.natives?`<h3>${tr('Einheimische')}</h3><p>+${r.natives.threatMin}–${r.natives.threatMax} / ${r.natives.threatRounds} · +${r.natives.quietMin}–${r.natives.quietMax} / ${r.natives.quietRounds}</p>`:'');
 }
 return classicRulesHTML({...game,rules:'classic',mode:'progressive'});
}
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function rulesTabsHTML(game={}) {
 const rules=installedRules();
 return tr`<div class="rules-tabs" role="tablist" aria-label="Regelvarianten">${rules.map((r,i)=>`<button type="button" id="rules-tab-${escape(r.id)}" role="tab" aria-selected="${i===0}" aria-controls="rules-panel-${escape(r.id)}" tabindex="${i===0?0:-1}">${escape(tr(r.name))}${r.preview?'<small>'+tr('Preview · in progress')+'</small>':''}</button>`).join('')}</div>`+
 rules.map((r,i)=>`<section id="rules-panel-${escape(r.id)}" role="tabpanel" aria-labelledby="rules-tab-${escape(r.id)}" tabindex="0" ${i?'hidden':''}>${r.preview?'<p class="rules-preview"><strong>'+tr('Preview · in progress')+'</strong><br>'+escape(tr(r.previewText||''))+'</p>':''}${rulesHTML({...game,rules:r.id,ruleConfig:r,goal:r.goals.includes(game.goal)?game.goal:'domination',mode:r.id==='classic'?'progressive':game.mode})}</section>`).join('');
}

export function bindRulesTabs(root) {
  const tabs = [...root.querySelectorAll('.rules-tabs [role="tab"]')];
  const select = tab => {
    for (const item of tabs) {
      const selected = item === tab;
      item.setAttribute('aria-selected', String(selected));
      item.tabIndex = selected ? 0 : -1;
      root.querySelector('#' + item.getAttribute('aria-controls')).hidden = !selected;
    }
  };
  for (const [index, tab] of tabs.entries()) {
    tab.onclick = () => select(tab);
    tab.onkeydown = event => {
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 :
        event.key === 'ArrowRight' ? (index + 1) % tabs.length :
        event.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length : null;
      if (next === null) return;
      event.preventDefault();
      select(tabs[next]);
      tabs[next].focus();
    };
  }
}
