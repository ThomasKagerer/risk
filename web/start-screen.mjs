import { fixedCardValues } from './card-values.mjs';
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function startScreenMarkup({mapPicker, description, name, email, lastRoom, code}) {
  return `<div class="start-shell">
    <header class="start-heading"><span class="eyebrow">DEIN SPIELTISCH</span><h1>Die nächste Eroberung.</h1></header>
    <nav class="start-nav" aria-label="Partie auswählen"><button type="button" data-home-tab="create" aria-pressed="true">Neue Partie</button><button type="button" data-home-tab="join" aria-pressed="false">Beitreten</button><button type="button" data-home-tab="resume" aria-pressed="false">Fortsetzen</button></nav>
    <section id="home-create" class="start-page" aria-label="Neue Partie">
      <form id="create-form" novalidate>
        <div class="start-step-label" id="home-step-label">1 / 2 · Karte & Regeln</div>
        <div class="start-form-scroll">
          <div id="home-step-map">${mapPicker}<p class="fine" id="map-description">${escape(description)}</p>
            <label for="game-rules">Spielmodus</label><select id="game-rules"><option value="domination">Domination</option><option value="classic">Klassisch</option></select><p class="fine" id="rules-description">Freie Länder, Einheimische und ausbaubare Burgen.</p>
            <label for="game-goal">Spielziel</label><select id="game-goal"><option value="domination">Welteroberung</option><option value="capital">Hauptstadt · Burg verteidigen</option></select>
            <p class="fine" id="goal-description">Erobere die Welt und besiege die anderen Spieler.</p>
            <label for="card-mode">Kartenbonus</label><select id="card-mode"><option value="fixed">Feste Boni · 4 / 6 / 8 / 10</option><option value="progressive">Steigende Boni · 4 / 6 / 8 / …</option></select>
          </div>
          <div id="home-step-players" hidden><p class="start-summary" id="home-map-summary"></p>
            <label for="player-name">Dein Name</label><input id="player-name" maxlength="24" autocomplete="nickname" placeholder="Wie heißt du?" value="${escape(name)}" required>
            <div class="bot-setup"><div class="bot-heading"><span>Weitere Spieler</span><button type="button" class="add-bot" id="add-draft-human">+ Mensch</button><button type="button" class="add-bot" id="add-draft-bot" aria-label="KI-Spieler hinzufügen">+ KI-Spieler</button></div><div id="draft-bots"></div></div>
            <p class="fine">Menschen an diesem Gerät spielen abwechselnd. Freunde auf eigenen Geräten können danach per Raumcode beitreten.</p><p class="fine" id="setup-description">2–6 Spieler · Fünf Startländer pro Spieler · 15 zusätzliche Einheiten.</p>
          </div>
        </div>
        <footer class="start-footer"><button type="button" class="secondary" id="home-back" hidden>← Zurück</button><button class="primary" type="submit" id="home-continue">Weiter · Spieler →</button></footer>
      </form>
    </section>
    <section id="home-join" class="start-page" aria-label="Partie beitreten" hidden><form id="join-form"><div class="start-form-scroll"><h3>Mit Freunden spielen.</h3><p>Gib den Raumcode des Gastgebers ein.</p><label for="join-name">Dein Name</label><input id="join-name" maxlength="24" autocomplete="nickname" placeholder="Wie heißt du?" value="${escape(name)}" required><label for="join-code">Raumcode</label><input id="join-code" maxlength="6" minlength="6" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="ABC123" value="${escape(code)}" required></div><footer class="start-footer"><button class="primary" type="submit">Partie beitreten →</button></footer></form></section>
    <section id="home-resume" class="start-page" aria-label="Partie fortsetzen" hidden><div class="start-form-scroll"><h3>Zurück an den Spieltisch.</h3>${lastRoom?'<button class="secondary resume-last" id="resume-game">Letzte Partie fortsetzen →</button>':''}<div id="saved-games">${email?'<p class="fine">Deine gespeicherten Partien werden geladen …</p>':`<p class="fine">${lastRoom?'Die letzte Partie ist auf diesem Gerät gespeichert.':'Auf diesem Gerät ist noch keine Partie gespeichert.'} Du kannst auch den Einladungslink deiner bisherigen Partie öffnen.</p>`}</div></div></section>
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
    $('#home-step-label').textContent=next===1?'1 / 2 · Karte & Regeln':'2 / 2 · Spieler';
    $('#home-continue').textContent=next===1?'Weiter · Spieler →':'Partie erstellen →';
    $('#home-map-summary').textContent=`${$('#game-rules').value==='classic'?'Klassisch':'Domination'} · ${mapName()} · ${$('#game-goal').selectedOptions[0].textContent}`;
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
    const classic=$('#game-rules').value==='classic',mission=$('#game-goal').value==='mission',mini=$('input[name=map]:checked')?.value==='simple-world';
    $('#card-mode option[value=fixed]').textContent='Feste Boni · '+fixedCardValues(mini?'simple-world':'classic').join(' / ');
    $('#card-mode option[value=progressive]').textContent='Steigende Boni · '+fixedCardValues(mini?'simple-world':'classic').slice(0,3).join(' / ')+' / …';
    $('#goal-description').textContent=mission?'Erfülle deinen geheimen Auftrag: Länder besetzen, Regionen erobern oder eine bestimmte Armee besiegen. Ab 3 Spielern. Länderziele skalieren mit der Kartengröße.':$('#game-goal').value==='capital'?'Deine Hauptstadt startet als Hütte mit Palisadenzaun und drei besetzbaren Würfelplätzen. Fällt sie, scheidest du aus.':'Erobere die Welt und besiege die anderen Spieler.';
    $('#rules-description').textContent=classic?'Klassische Risiko-Regeln auf der gewählten Karte. Ohne Einheimische, Burgausbau und Geländeboni.':'Freie Länder, Einheimische und ausbaubare Burgen.';
    $('#setup-description').textContent=classic?(mission?'3–6 Spieler · Geheime Missionen und zufällig verteilte Startländer.':'2–6 Spieler · Alle Länder werden verteilt. Zu zweit mit passiver neutraler Armee.')+' Startarmeen werden an die Kartengröße angepasst.':mini?'2–6 Spieler · Zwei Startländer pro Spieler · 8 zusätzliche Einheiten.':'2–6 Spieler · Fünf Startländer pro Spieler · 15 zusätzliche Einheiten.';
  }
  let previousRules='domination',dominationCards='fixed';
  const goals={domination:'domination',classic:'domination'};
  $('#game-goal').onchange=updateDescriptions;
  $('#game-rules').onchange=()=>{
    const rules=$('#game-rules').value,classic=rules==='classic';
    goals[previousRules]=$('#game-goal').value;
    if(previousRules==='domination')dominationCards=$('#card-mode').value;
    $('#game-goal').innerHTML='<option value="domination">Welteroberung</option>'+(classic?'<option value="mission">Mission</option>':'<option value="capital">Hauptstadt · Burg verteidigen</option>');
    $('#game-goal').value=goals[rules];
    $('#card-mode').value=classic?'progressive':dominationCards;
    $('#card-mode').disabled=classic;
    previousRules=rules;updateDescriptions();
  };
  for(const [from,to] of [['#player-name','#join-name'],['#join-name','#player-name']])$(from).addEventListener('input',()=>{$(to).value=$(from).value;});
  $('#map-choice').addEventListener('change',updateDescriptions);
  updateDescriptions();
  showTab(code?'join':'create');
}
