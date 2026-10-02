import { hasFeature, ruleConfig } from './content.mjs';
import { localize as tr } from './i18n.mjs';
import { unitStars } from './experience.mjs';
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function mapPieces(troops) {
  const pieces=[];let offset=0;
  while(offset<troops&&pieces.length<6){
    const value=troops-offset>=10?10:troops-offset>=5?5:1;
    pieces.push({value,count:1,units:Array.from({length:value},(_,i)=>offset+i)});offset+=value;
  }
  return pieces;
}

export function inspectPiece(game,territory,piece) {
  if(!hasFeature(game,'experience'))return null;
  const t=game.territories[territory-1],members=t&&mapPieces(t.troops)[piece]?.units;
  if(!members)return null;
  return {territory,ids:members.map(i=>t.unitHistory?.[i]?.id).filter(Boolean),unitId:t.unitHistory?.[members[0]]?.id};
}

export function unitInfoHTML(game,selection,countries) {
  if(!selection||!hasFeature(game,'experience'))return '';
  const units=game.territories.flatMap((t,territory)=> (t.unitHistory||[]).flatMap((u,index)=>selection.ids.includes(u.id)?[{...u,experience:t.experience?.[index]||0,territory:territory+1,owner:t.owner}]:[]));
  const unit=units.find(u=>u.id===selection.unitId)||units[0];
  const close=tr('<button type="button" id="close-unit-info" aria-label="Einheiteninfo schließen">×</button>');
  if(!unit)return tr`<section class="unit-info">${close}<h3>Einheit nicht mehr vorhanden</h3><p>Diese Einheit ist im Kampf gefallen.</p></section>`;
  const stars=unitStars(unit.experience),age=unit.bornRound?tr`${Math.max(0,game.round-unit.bornRound)} Runden · seit Runde ${unit.bornRound}`:tr`Unbekannt · erfasst seit Runde ${unit.sinceRound}`;
  return tr`<section class="unit-info" aria-label="Einheiteninformationen">${close}<span class="eyebrow">${escape(countries[unit.territory-1]?.name)} · ${escape(game.players[unit.owner]?.name)}</span><h3>Einheit #${unit.id}</h3>${units.length>1?tr`<label for="inspected-unit">Figur mit ${units.length} Einheiten</label><select id="inspected-unit">${units.map(u=>tr`<option value="${u.id}" ${u.id===unit.id?'selected':''}>Einheit #${u.id} · ${unitStars(u.experience)} ★</option>`).join('')}</select>`:''}<dl><div><dt>Schlachten</dt><dd>${unit.battles}${unit.partial?tr(' erfasst'):''}</dd></div><div><dt>Erfahrungsstufe</dt><dd class="unit-rank">★ ${stars} / 3</dd></div><div><dt>Erfahrungspunkte</dt><dd>${unit.experience}</dd></div><div><dt>Lebt seit</dt><dd>${age}</dd></div></dl><p class="fine">Jede abgeschlossene Würfelrunde zählt als Schlacht. Einheiten, die gekämpft haben und bis zum nächsten Zug ihres Spielers überleben, erhalten dann einen Erfahrungspunkt.${unit.partial?tr(' Frühere Schlachten und das Geburtsdatum sind für diese Bestandseinheit unbekannt.'):''}</p></section>`;
}
