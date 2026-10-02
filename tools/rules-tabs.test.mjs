import test from 'node:test';
import assert from 'node:assert/strict';
import {rulesTabsHTML, bindRulesTabs} from '../web/rules.mjs';

test('rules always open on classic and isolate preview rules from the classic panel', () => {
  const html = rulesTabsHTML({rules:'domination', goal:'capital', mode:'fixed', map:'classic'});
  assert.match(html, /id="rules-tab-classic"[^>]*aria-selected="true"/);
  assert.match(html, /id="rules-tab-domination"[^>]*aria-selected="false"/);
  const classic = html.split('id="rules-panel-classic"')[1].split('</section>')[0];
  const domination = html.split('id="rules-panel-domination"')[1].split('</section>')[0];
  assert.doesNotMatch(classic, /Preview|Verteidigung ausbauen|Verteidige deine Hauptstadt/);
  assert.match(classic, /Die Verteidigung wählt vor dem Wurf/);
  assert.match(domination, / hidden>/);
  assert.match(domination, /Preview · in progress/);
  assert.match(domination, /Verteidigung ausbauen/);
  assert.match(domination, /Verteidige deine Hauptstadt/);
  const mission = rulesTabsHTML({goal:'mission', map:'europe1871'});
  assert.match(mission.split('id="rules-panel-classic"')[1].split('</section>')[0], /geheimen Auftrag/);
  assert.doesNotMatch(mission.split('id="rules-panel-domination"')[1], /geheimen Auftrag/);
});

test('mouse and keyboard switching update panels, focus and accessible selection', () => {
  const panels = [{hidden:false}, {hidden:true}];
  const tabs = panels.map((_, index) => ({
    attrs:{'aria-controls':`panel-${index}`, 'aria-selected':String(index===0)},
    tabIndex:index===0?0:-1,
    getAttribute(key){return this.attrs[key];},
    setAttribute(key,value){this.attrs[key]=value;},
    focus(){this.focused=true;},
  }));
  bindRulesTabs({querySelectorAll:()=>tabs, querySelector:selector=>panels[Number(selector.at(-1))]});
  tabs[1].onclick();
  assert.deepEqual(panels.map(panel=>panel.hidden), [true,false]);
  assert.deepEqual(tabs.map(tab=>tab.attrs['aria-selected']), ['false','true']);
  let prevented=false;
  tabs[1].onkeydown({key:'ArrowRight', preventDefault(){prevented=true;}});
  assert.equal(prevented,true);
  assert.equal(tabs[0].focused,true);
  assert.deepEqual(panels.map(panel=>panel.hidden), [false,true]);
  assert.deepEqual(tabs.map(tab=>tab.tabIndex), [0,-1]);
  tabs[0].onkeydown({key:'End', preventDefault(){}});
  assert.deepEqual(panels.map(panel=>panel.hidden), [true,false]);
  tabs[1].onkeydown({key:'Home', preventDefault(){}});
  assert.deepEqual(panels.map(panel=>panel.hidden), [false,true]);
});
