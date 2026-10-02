import { localize as tr } from './i18n.mjs';
import { armyExperience } from './experience.mjs';
import { buildingNames, buildingArtworkTroops, buildingUpgradeDuration, constructionDuration, nextBuildingStage } from './buildings.mjs';
import { fortification, capitalFortress } from './figures.mjs';
import { buildingConstruction } from './construction-art.mjs';
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function buildingPortrait(level,capital=false,construction=null){
 const frame=construction?(level===0?'355 5 185 170':level<3?'285 -5 250 185':'260 -60 275 240'):level===0?'370 42 150 128':level===1?'310 48 215 122':level===2?'300 65 230 105':'270 -22 260 200';
 const art=capital?capitalFortress(false,level)+capitalFortress(true,level):fortification(buildingArtworkTroops[level])+fortification(buildingArtworkTroops[level],true);
 return `<svg class="building-portrait" viewBox="${frame}" role="img" aria-label="${capital?tr('Hauptstadt: '):''}${buildingNames[level]}${construction?tr(' · wird erweitert'):''}"><path d="M265 158Q405 129 535 156V190H265Z" fill="#bbc6a5"/>${art}${construction?buildingConstruction(level):''}</svg>`;
}
export function buildingPanel(game,id,target,capital=false,cardLabels={}){
 const t=game.territories[id-1],current=t.buildingLevel||0,c=t.construction,next=nextBuildingStage(t),bonus=armyExperience(t).bonus,limit=current+2+bonus;
 target=t.owner===game.me&&!c&&Number.isInteger(target)&&target>=current&&target<buildingNames.length?target:current;
 const mine=t.owner===game.me,active=mine&&game.actor===game.me&&!game.paused&&!game.mustTrade&&['reinforce','attack','fortify'].includes(game.phase),changeable=active&&!c;
 const cost=target-current,duration=buildingUpgradeDuration(current,target),upgrade=target>current,affordable=(game.hand||[]).length>=cost;
 const reason=!mine?tr('Dieses Gebäude gehört einem anderen Spieler.'):game.mustTrade?tr('Tausche zuerst deinen verpflichtenden Kartensatz.'):game.paused?tr('Setze die Partie fort, um auszubauen.'):!active?tr('Ausbauen ist nach der Startaufstellung in deinem eigenen Zug möglich.'):c?tr('Der laufende Ausbau muss zuerst fertig werden.'):'';
 const available=(game.hand||[]).length;
 return tr`<section class="building-manager" data-building-territory="${id}" data-building-room="${escape(game.code)}" data-building-revision="${game.revision}">
  <div class="building-current"><strong>Aktuell: ${buildingNames[current]}</strong><span>${Math.min(t.troops,limit)} / ${limit} Würfel besetzt · ${t.troops} Einheiten${bonus?tr` · +${bonus} durch Erfahrung`:""}</span></div>
  <figure class="building-illustration">${buildingPortrait(target,capital,c)}<figcaption>${c?tr('Wird erweitert'):target===current?tr('Aktuelles Gebäude'):tr`Vorschau: ${buildingNames[target]}`}${capital?tr(' · Hauptstadt'):''}</figcaption></figure>
  ${c?tr`<div class="building-work" role="status"><strong>${buildingNames[c.level]} im Bau</strong><span>${c.remaining===1?tr('Noch eine eigene Runde'):tr`Noch ${c.remaining} eigene Runden`}</span><progress value="${Math.max(0,constructionDuration(t)-c.remaining)}" max="${constructionDuration(t)}" aria-label="Baufortschritt"></progress><p>Nächste Stufe: ${buildingNames[next.level]} in ${next.remaining} ${next.remaining===1?tr('eigener Runde'):tr('eigenen Runden')}. Dann stehen ${next.level+2} Würfelplätze bereit; aktuell sind es ${current+2}.</p></div>`:''}
  ${mine&&!c?tr`<label for="building-target">Zielgebäude wählen</label><select id="building-target" ${c||current===buildingNames.length-1?'disabled':''}>${buildingNames.map((name,level)=>level<current?'':`<option value="${level}" ${level===target?'selected':''}>${name}${level===current?tr(' · aktuell'):''}</option>`).join('')}</select>
  ${upgrade?tr`<div class="building-quote"><div><span>Kosten</span><strong>${cost} ${cost===1?tr('Karte'):tr('Karten')}</strong></div><div><span>Bauzeit</span><strong>${duration} eigene Runden</strong></div><div><span>Nach Fertigstellung</span><strong>${target+2} Würfelplätze</strong></div></div>${!c?tr`<details class="building-plan"><summary>Bauplan · ${target-current} ${target-current===1?tr('Stufe'):tr('Stufen')}</summary><ol class="building-timeline" aria-label="Ausbauplan">${buildingNames.map((name,level)=>level>current&&level<=target?tr`<li><strong>${name}</strong><span>nach ${buildingUpgradeDuration(current,level)} eigenen Runden · ${level+2} Würfelplätze</span></li>`:'').join('')}</ol></details>`:''}<p class="building-explanation">Alle Zwischenstufen sind eingerechnet und werden nacheinander fertig. Jede fertige Stufe verbessert sofort den Schutz. Jeder Würfel braucht einen Verteidiger.</p>${mine?tr`<p class="building-budget">${available} Karten verfügbar. Die Garnison bleibt unverändert.${!affordable?tr` Es fehlen ${cost-available} Karten.`:''}</p><fieldset class="building-payment"><legend>${cost} ${cost===1?tr('Karte wählen'):tr('Karten wählen')}</legend>${(game.hand||[]).map((card,i)=>`<label><input type="checkbox" data-building-card="${card}" ${i<cost?'checked':''} ${!changeable?'disabled':''}> ${escape(cardLabels[card]||tr`Karte ${card+1}`)}</label>`).join('')}</fieldset>`:''}`:`<p class="building-explanation">${c?tr`Der Ausbau läuft automatisch bis zur ${buildingNames[c.level]}. Die Kosten sind bereits bezahlt.`:current===buildingNames.length-1?tr('Die Zitadelle ist die höchste Ausbaustufe.'):tr('Wähle deine gewünschte Ausbaustufe. Du kannst mehrere Stufen auf einmal ausbauen.')}</p>`}
  `:''}
  ${reason&&!c?`<p class="building-restriction">${reason}</p>`:''}
  ${mine&&!c?`<button class="primary building-submit" id="building-confirm" ${!changeable||target===current||upgrade&&!affordable?'disabled':''}>${c?tr('Ausbau läuft'):current===buildingNames.length-1?tr('Höchste Stufe erreicht'):upgrade?tr`Ausbau zu ${buildingNames[target]} starten`:tr('Zielgebäude wählen')}</button>`:''}
 </section>`;
}
