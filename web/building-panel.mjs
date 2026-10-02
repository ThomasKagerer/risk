import { armyExperience } from './experience.mjs';
import { buildingNames, buildingArtworkTroops, buildingUpgradeDuration, constructionDuration, nextBuildingStage } from './buildings.mjs';
import { fortification, capitalFortress } from './figures.mjs';
import { buildingConstruction } from './construction-art.mjs';
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function buildingPortrait(level,capital=false,construction=null){
 const frame=construction?(level===0?'355 5 185 170':level<3?'285 -5 250 185':'260 -60 275 240'):level===0?'370 42 150 128':level===1?'310 48 215 122':level===2?'300 65 230 105':'270 -22 260 200';
 const art=capital?capitalFortress(false,level)+capitalFortress(true,level):fortification(buildingArtworkTroops[level])+fortification(buildingArtworkTroops[level],true);
 return `<svg class="building-portrait" viewBox="${frame}" role="img" aria-label="${capital?'Hauptstadt: ':''}${buildingNames[level]}${construction?' · wird erweitert':''}"><path d="M265 158Q405 129 535 156V190H265Z" fill="#bbc6a5"/>${art}${construction?buildingConstruction(level):''}</svg>`;
}
export function buildingPanel(game,id,target,capital=false,cardLabels={}){
 const t=game.territories[id-1],current=t.buildingLevel||0,c=t.construction,next=nextBuildingStage(t),bonus=armyExperience(t).bonus,limit=current+2+bonus;
 target=t.owner===game.me&&!c&&Number.isInteger(target)&&target>=current&&target<buildingNames.length?target:current;
 const mine=t.owner===game.me,active=mine&&game.actor===game.me&&!game.paused&&!game.mustTrade&&['reinforce','attack','fortify'].includes(game.phase),changeable=active&&!c;
 const cost=target-current,duration=buildingUpgradeDuration(current,target),upgrade=target>current,affordable=(game.hand||[]).length>=cost;
 const reason=!mine?'Dieses Gebäude gehört einem anderen Spieler.':game.mustTrade?'Tausche zuerst deinen verpflichtenden Kartensatz.':game.paused?'Setze die Partie fort, um auszubauen.':!active?'Ausbauen ist nach der Startaufstellung in deinem eigenen Zug möglich.':c?'Der laufende Ausbau muss zuerst fertig werden.':'';
 const available=(game.hand||[]).length;
 return `<section class="building-manager" data-building-territory="${id}" data-building-room="${escape(game.code)}" data-building-revision="${game.revision}">
  <div class="building-current"><strong>Aktuell: ${buildingNames[current]}</strong><span>${Math.min(t.troops,limit)} / ${limit} Würfel besetzt · ${t.troops} Einheiten${bonus?` · +${bonus} durch Erfahrung`:""}</span></div>
  <figure class="building-illustration">${buildingPortrait(target,capital,c)}<figcaption>${c?'Wird erweitert':target===current?'Aktuelles Gebäude':`Vorschau: ${buildingNames[target]}`}${capital?' · Hauptstadt':''}</figcaption></figure>
  ${c?`<div class="building-work" role="status"><strong>${buildingNames[c.level]} im Bau</strong><span>Noch ${c.remaining} eigene ${c.remaining===1?'Runde':'Runden'}</span><progress value="${Math.max(0,constructionDuration(t)-c.remaining)}" max="${constructionDuration(t)}" aria-label="Baufortschritt"></progress><p>Nächste Stufe: ${buildingNames[next.level]} in ${next.remaining} ${next.remaining===1?'eigener Runde':'eigenen Runden'}. Dann stehen ${next.level+2} Würfelplätze bereit; aktuell sind es ${current+2}.</p></div>`:''}
  ${mine&&!c?`<label for="building-target">Zielgebäude wählen</label><select id="building-target" ${c||current===buildingNames.length-1?'disabled':''}>${buildingNames.map((name,level)=>level<current?'':`<option value="${level}" ${level===target?'selected':''}>${name}${level===current?' · aktuell':''}</option>`).join('')}</select>
  ${upgrade?`<div class="building-quote"><div><span>Kosten</span><strong>${cost} ${cost===1?'Karte':'Karten'}</strong></div><div><span>Bauzeit</span><strong>${duration} eigene Runden</strong></div><div><span>Nach Fertigstellung</span><strong>${target+2} Würfelplätze</strong></div></div>${!c?`<details class="building-plan"><summary>Bauplan · ${target-current} ${target-current===1?'Stufe':'Stufen'}</summary><ol class="building-timeline" aria-label="Ausbauplan">${buildingNames.map((name,level)=>level>current&&level<=target?`<li><strong>${name}</strong><span>nach ${buildingUpgradeDuration(current,level)} eigenen Runden · ${level+2} Würfelplätze</span></li>`:'').join('')}</ol></details>`:''}<p class="building-explanation">Alle Zwischenstufen sind eingerechnet und werden nacheinander fertig. Jede fertige Stufe verbessert sofort den Schutz. Jeder Würfel braucht einen Verteidiger.</p>${mine?`<p class="building-budget">${available} Karten verfügbar. Die Garnison bleibt unverändert.${!affordable?` Es fehlen ${cost-available} Karten.`:''}</p><fieldset class="building-payment"><legend>${cost} ${cost===1?'Karte wählen':'Karten wählen'}</legend>${(game.hand||[]).map((card,i)=>`<label><input type="checkbox" data-building-card="${card}" ${i<cost?'checked':''} ${!changeable?'disabled':''}> ${escape(cardLabels[card]||`Karte ${card+1}`)}</label>`).join('')}</fieldset>`:''}`:`<p class="building-explanation">${c?`Der Ausbau läuft automatisch bis zur ${buildingNames[c.level]}. Die Kosten sind bereits bezahlt.`:current===buildingNames.length-1?'Die Zitadelle ist die höchste Ausbaustufe.':'Wähle deine gewünschte Ausbaustufe. Du kannst mehrere Stufen auf einmal ausbauen.'}</p>`}
  `:''}
  ${reason&&!c?`<p class="building-restriction">${reason}</p>`:''}
  ${mine&&!c?`<button class="primary building-submit" id="building-confirm" ${!changeable||target===current||upgrade&&!affordable?'disabled':''}>${c?'Ausbau läuft':current===buildingNames.length-1?'Höchste Stufe erreicht':upgrade?`Ausbau zu ${buildingNames[target]} starten`:'Zielgebäude wählen'}</button>`:''}
 </section>`;
}
