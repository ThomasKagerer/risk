import { installedRules, ruleConfig, mapConfig } from './content.mjs';
import { localize as tr } from './i18n.mjs';
import { fixedCardValues } from './card-values.mjs';
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function startScreenMarkup({mapPicker, description, name, email, lastRoom, code}) {
  return tr`<div class="start-shell">
    <header class="start-heading"><span class="eyebrow">DEIN SPIELTISCH</span><h1>Die nächste Eroberung.</h1></header>
    <nav class="start-nav" aria-label="Partie auswählen"><button type="button" data-home-tab="create" aria-pressed="true">Neue Partie</button><button type="button" data-home-tab="join" aria-pressed="false">Beitreten</button><button type="button" data-home-tab="resume" aria-pressed="false">Fortsetzen</button></nav>
    <section id="home-create" class="start-page" aria-label="Neue Partie">
      <form id="create-form" novalidate>
        <div class="start-step-label" id="home-step-label">1 / 2 · Karte & Regeln</div>
        <div class="start-form-scroll">
          <div id="home-step-map">${mapPicker}<p class="fine" id="map-description">${escape(description)}</p>
            <label for="game-rules">Spielmodus</label><select id="game-rules">${installedRules().map(r=>`<option value="${escape(r.id)}">${escape(tr(r.name))}${r.id==='classic'?'':' · DLC'}</option>`).join('')}</select><p class="fine" id="rules-description">${escape(tr(installedRules()[0]?.description||''))}</p>
            <label for="game-goal">Spielziel</label><select id="game-goal"><option value="domination">Welteroberung</option><option value="mission">Mission</option></select>
            <p class="fine" id="goal-description">Erobere die Welt und besiege die anderen Spieler.</p>
            <label for="card-mode">Kartenbonus</label><select id="card-mode"><option value="fixed">Feste Boni · 4 / 6 / 8 / 10</option><option value="progressive">Steigende Boni · 4 / 6 / 8 / …</option></select>
          </div>
          <div id="home-step-players" hidden><p class="start-summary" id="home-map-summary"></p>
            <label for="player-name">Dein Name</label><input id="player-name" maxlength="24" autocomplete="nickname" placeholder="Wie heißt du?" value="${escape(name)}" required>
            <div class="bot-setup"><div class="bot-heading"><span>Weitere Spieler</span><button type="button" class="add-bot" id="add-draft-human">+ Mensch</button><button type="button" class="add-bot" id="add-draft-bot" aria-label="KI-Spieler hinzufügen">+ KI-Spieler</button></div><div id="draft-bots"></div></div>
            <p class="fine">Menschen an diesem Gerät spielen abwechselnd. Freunde auf eigenen Geräten können danach per Raumcode beitreten.</p><p class="fine" id="setup-description">2–6 Spieler · Alle Länder werden verteilt. Zu zweit mit passiver neutraler Armee.</p>
          </div>
        </div>
        <footer class="start-footer"><button type="button" class="secondary" id="home-back" hidden>← Zurück</button><button class="primary" type="submit" id="home-continue">Weiter · Spieler →</button></footer>
      </form>
    </section>
    <section id="home-join" class="start-page" aria-label="Partie beitreten" hidden><form id="join-form"><div class="start-form-scroll"><h3>Mit Freunden spielen.</h3><p>Gib den Raumcode des Gastgebers ein.</p><label for="join-name">Dein Name</label><input id="join-name" maxlength="24" autocomplete="nickname" placeholder="Wie heißt du?" value="${escape(name)}" required><label for="join-code">Raumcode</label><input id="join-code" maxlength="6" minlength="6" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="ABC123" value="${escape(code)}" required></div><footer class="start-footer"><button class="primary" type="submit">Partie beitreten →</button></footer></form></section>
    <section id="home-resume" class="start-page" aria-label="Partie fortsetzen" hidden><div class="start-form-scroll"><h3>Zurück an den Spieltisch.</h3>${lastRoom?tr('<button class="secondary resume-last" id="resume-game">Letzte Partie fortsetzen →</button>'):''}<div id="saved-games">${email?tr('<p class="fine">Deine gespeicherten Partien werden geladen …</p>'):tr`<p class="fine">${lastRoom?tr('Die letzte Partie ist auf diesem Gerät gespeichert.'):tr('Auf diesem Gerät ist noch keine Partie gespeichert.')} Du kannst auch den Einladungslink deiner bisherigen Partie öffnen.</p>`}</div></div></section>
  </div>`;
}

// Hide panes without recreating their inputs: names and player choices survive
// navigation between steps, joining and saved games.
export function bindStartScreen(root, {code, mapName, onCreate}) {
  const $ = selector => root.querySelector(selector);
  let step=1;
  function showStep(next) {
    step=next;
    $('#home-step-map').hidden=next!==1;$('#home-step-players').hidden=next!==2;
    $('#home-back').hidden=next===1;
    $('#home-step-label').textContent=next===1?tr('1 / 2 · Karte & Regeln'):tr('2 / 2 · Spieler');
    $('#home-continue').textContent=next===1?tr('Weiter · Spieler →'):tr('Partie erstellen →');
    $('#home-map-summary').textContent=`${$('#game-rules').selectedOptions[0].textContent} · ${mapName()} · ${$('#game-goal').selectedOptions[0].textContent}`;
    $('#create-form .start-form-scroll').scrollTop=0;
  }
  function showTab(id) {
    for(const button of root.querySelectorAll('[data-home-tab]')) button.setAttribute('aria-pressed',String(button.dataset.homeTab===id));
    for(const key of ['create','join','resume']) $(`#home-${key}`).hidden=key!==id;
  }
  $('#home-back').onclick=()=>showStep(1);
  $('#create-form').onsubmit=async event=>{
    event.preventDefault();
    if(step===1){showStep(2);return;}
    if(event.currentTarget.reportValidity())await onCreate(event.currentTarget);
  };
  for(const button of root.querySelectorAll('[data-home-tab]'))button.onclick=()=>showTab(button.dataset.homeTab);
  function updateDescriptions(){
    const classic=$('#game-rules').value==='classic',mission=$('#game-goal').value==='mission',mini=Boolean(mapConfig($('input[name=map]:checked')?.value).scaleFrontier);
    $('#card-mode option[value=fixed]').textContent=tr('Feste Boni · ')+fixedCardValues($('input[name=map]:checked')?.value).join(' / ');
    $('#card-mode option[value=progressive]').textContent=tr('Steigende Boni · ')+fixedCardValues($('input[name=map]:checked')?.value).slice(0,3).join(' / ')+' / …';
    $('#goal-description').textContent=mission?tr('Erfülle deinen geheimen Auftrag: Länder besetzen, Regionen erobern oder eine bestimmte Armee besiegen. Ab 3 Spielern. Länderziele skalieren mit der Kartengröße.'):$('#game-goal').value==='capital'?tr('Deine Hauptstadt startet als Hütte mit Palisadenzaun und drei besetzbaren Würfelplätzen. Fällt sie, scheidest du aus.'):tr('Erobere die Welt und besiege die anderen Spieler.');
    $('#rules-description').textContent=tr(ruleConfig($('#game-rules').value).description||'');
    $('#setup-description').textContent=classic?(mission?tr('3–6 Spieler · Geheime Missionen und zufällig verteilte Startländer.'):tr('2–6 Spieler · Alle Länder werden verteilt. Zu zweit mit passiver neutraler Armee.'))+tr(' Startarmeen werden an die Kartengröße angepasst.')+(mapConfig($('input[name=map]:checked')?.value).multiPlacement?' '+tr('Beim Aufstellen kannst du Figuren mit 1, 5 oder 10 Einheiten platzieren.'):''):mini?tr('2–6 Spieler · Zwei Startländer pro Spieler · 8 zusätzliche Einheiten.'):tr('2–6 Spieler · Fünf Startländer pro Spieler · 15 zusätzliche Einheiten.');
  }
  let previousRules='',customCards='fixed';
  const goals={};
  $('#game-goal').onchange=updateDescriptions;
  $('#game-rules').onchange=()=>{
    const rules=$('#game-rules').value,classic=rules==='classic';
    goals[previousRules]=$('#game-goal').value;
    if(previousRules&&previousRules!=='classic')customCards=$('#card-mode').value;
    $('#game-goal').innerHTML=(ruleConfig(rules).goals||['domination']).map(goal=>`<option value="${goal}">${tr({domination:'Welteroberung',mission:'Mission',capital:'Hauptstadt · Burg verteidigen'}[goal])}</option>`).join('');
    $('#game-goal').value=goals[rules]||'domination';
    $('#card-mode').value=classic?'progressive':customCards;
    $('#card-mode').disabled=classic;
    previousRules=rules;updateDescriptions();
  };
  for(const [from,to] of [['#player-name','#join-name'],['#join-name','#player-name']])$(from).addEventListener('input',()=>{$(to).value=$(from).value;});
  $('#map-choice').addEventListener('change',updateDescriptions);
  $('#game-rules').onchange();
  showTab(code?'join':'create');
}
