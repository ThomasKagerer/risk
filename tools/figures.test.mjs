import './content-fixture.mjs';
import { setLanguage, localize as tr, currentLocale, serverText, localizeBoard } from '../web/i18n.mjs';
await setLanguage('de',{persist:false});
import test from 'node:test';
import assert from 'node:assert/strict';
import { battleFigures, attackingFigures, battleCasualties, battleScene, playerBanner, defensePosition, defendingFigures, mountainLift, mountainRise, fortification } from '../web/figures.mjs';

test('formations exactly represent every army size, independent of dice, with bounded large stacks',()=>{
  for(const troops of [...Array(200).keys(),999,10000,999999]){
    const figures=battleFigures(troops);
    assert.equal(figures.reduce((sum,f)=>sum+f.count*f.value,0),troops);
    assert.ok(figures.length<=Math.min(troops,16));
    assert.equal(new Set(figures.map(f=>f.id)).size,figures.length);
  }
  assert.deepEqual(battleFigures(3).map(f=>f.kind),['infantry','infantry','infantry']);
  assert.deepEqual(battleFigures(16).map(f=>f.kind),['artillery','cavalry','infantry']);
});

test('attack formations favor infantry and cavalry while preserving exact strength and clear positions',()=>{
  const figures=attackingFigures(26);
  assert.equal(figures.filter(f=>f.kind==='infantry').length,11);
  assert.equal(figures.filter(f=>f.kind==='cavalry').length,1);
  assert.equal(figures.filter(f=>f.kind==='artillery').length,1);
  for(const troops of [...Array(200).keys(),999,10000,999999]){
    const army=attackingFigures(troops);
    assert.equal(army.reduce((sum,f)=>sum+f.count*f.value,0),troops);
    assert.ok(army.length<=33);
    assert.ok(army.every(f=>f.x-12*f.scale>0&&f.x+12*f.scale<260&&f.y>=82&&f.y<=159));
    assert.equal(new Set(army.map(f=>`${f.x},${f.y}`)).size,army.length);
    if(troops<11)assert.ok(army.every(f=>f.kind!=='artillery'));
    else assert.ok(army.some(f=>f.kind==='artillery'),'armies of 11 or more include artillery support');
    if(troops>0)assert.ok(army.some(f=>f.kind==='infantry'),'every army retains infantry');
    if(troops>=16||troops>=6&&troops<11)assert.ok(army.some(f=>f.kind==='cavalry'),'affordable cavalry is included');
    if(troops<165)assert.ok(army.every(f=>f.count===1));
    for(const kind of ['infantry','cavalry']){
      const group=army.filter(f=>f.kind===kind);
      for(const index of new Set(group.map(f=>f.rank))){
        const rank=group.filter(f=>f.rank===index);
        for(let i=1;i<rank.length;i++){
          const dx=rank[i].x-rank[i-1].x,dy=rank[i].y-rank[i-1].y;
          assert.ok(dy>Math.abs(dx),'ranks face the enemy across the field, not single file along the attack direction');
          assert.ok(Math.abs(dx+dy*.5)<.001,'each rank remains a straight line in perspective');
          if(kind==='infantry')assert.ok(dy<=15,'infantry stands shoulder to shoulder');
        }
        if(index>0)assert.ok(rank[0].x<group.find(f=>f.rank===index-1).x,'additional ranks stand behind the front');
      }
    }
    const guns=army.filter(f=>f.kind==='artillery');
    if(guns.length>1)assert.ok(new Set(guns.map(f=>f.y)).size>1,'artillery uses scattered positions');
  }
  const large=attackingFigures(79);
  for(const kind of ['infantry','cavalry'])assert.equal(new Set(large.filter(f=>f.kind===kind).map(f=>f.rank)).size,3);
});

test('artillery grows proportionally while the 47-unit army retains a full infantry line',()=>{
  for(const [troops,artillery,cavalry,infantry] of [[6,0,1,1],[10,0,1,5],[11,1,0,1],[15,1,0,5],[16,1,1,1],[20,1,1,5],[26,1,1,11],[47,2,3,12],[75,3,7,10]]){
    const figures=attackingFigures(troops);
    for(const [kind,count] of Object.entries({artillery,cavalry,infantry}))
      assert.equal(figures.filter(f=>f.kind===kind).reduce((sum,f)=>sum+f.count,0),count,`${troops} units: ${kind}`);
    assert.equal(figures.reduce((sum,f)=>sum+f.value*f.count,0),troops);
  }
  assert.deepEqual(battleCasualties(47,2,true).map(f=>f.kind),['infantry','infantry']);
  assert.deepEqual(battleCasualties(16,1,true).map(f=>f.kind),['infantry']);
  assert.deepEqual(battleCasualties(16,2,true).map(f=>f.kind),['cavalry']);
  assert.deepEqual(battleCasualties(11,1,true).map(f=>f.kind),['infantry']);
});

test('casualties select only denominations lost, without turning figures into replacements',()=>{
  assert.deepEqual(battleCasualties(16,0),[]);
  assert.deepEqual(battleCasualties(16,1).map(f=>f.kind),['infantry']);
  assert.deepEqual(battleCasualties(16,2).map(f=>f.kind),['cavalry']);
  assert.deepEqual(battleCasualties(3,2).map(f=>f.kind),['infantry','infantry']);
  assert.deepEqual(battleCasualties(5,2).map(f=>f.kind),['cavalry']);
  assert.deepEqual(battleCasualties(10,1).map(f=>f.kind),['artillery']);
  // The next round contains exactly the remaining strength.
  assert.deepEqual(battleFigures(14).map(f=>f.kind),['artillery','infantry','infantry','infantry','infantry']);
  for(const attacking of [false,true])for(let troops=1;troops<500;troops++)for(let losses=1;losses<=Math.min(3,troops);losses++){
    const fallen=battleCasualties(troops,losses,attacking),before=(attacking?attackingFigures:battleFigures)(troops);
    assert.ok(fallen.length>0);
    for(const f of fallen){
      const original=before.find(p=>p.id===f.id);
      assert.equal(f.count,original.count,'a loss must not knock over an entire reserve stack');
    }
  }
});

test('both armies, exactly one banner each, and defensive cover are present before any outcome',()=>{
  const scene=battleScene(16,3,'red','blue','Ada','Ben');
  assert.equal((scene.match(/data-casualty="a-/g)||[]).length,3);
  assert.equal((scene.match(/data-casualty="d-/g)||[]).length,3);
  assert.equal((scene.match(/class="player-banner"/g)||[]).length,2);
  assert.equal((scene.match(/class="fortification-banner"/g)||[]).length,1);
  const defenders=scene.split('<g class="scene-defender">').slice(1);
  assert.equal(defenders.length,2);
  for(const group of defenders)assert.doesNotMatch(group.split('<g class="scene-attacker">')[0],/player-banner/);
  assert.match(scene,/ANGRIFF · 16/);assert.match(scene,/VERTEIDIGUNG · 3/);
  assert.match(scene,/data-fortification="hut"/);
  assert.doesNotMatch(scene,/class="scene-fighter[^"]* fallen/);
  assert.equal((battleScene(1,0,'red','blue','Ada','Ben').match(/class="player-banner"/g)||[]).length,1);
});

test('banners escape names and remain readable when the soldier faces left',()=>{
  const banner=playerBanner('A <B> & "C"','infantry',-1);
  assert.match(banner,/A &lt;B&gt; &amp; &quot;C&quot;/);
  assert.match(banner,/scale\(-1 1\)/);
  assert.doesNotMatch(banner,/<B>/);
});

test('defensive cover follows each requested threshold through the grand citadel',()=>{
  for(const [troops,kind] of [[1,'hut'],[5,'hut'],[6,'palisade'],[9,'palisade'],[10,'castle'],[14,'castle'],[15,'fort'],[29,'fort'],[30,'bastion'],[49,'bastion'],[50,'stronghold'],[69,'stronghold'],[70,'citadel'],[100,'citadel']]){
    assert.equal(defensePosition(troops),kind);
    assert.match(fortification(troops),new RegExp(`data-fortification="${kind}"`));
  }
  assert.equal(fortification(0),'');
  assert.doesNotMatch(fortification(5,true),/defense-cover/);
  assert.match(fortification(6,true),/defense-cover/);
  assert.doesNotMatch(fortification(69),/citadel-expansion/);
  assert.match(fortification(70),/citadel-expansion/);
});

test('defenders stand at doors, gates, battlements and tower platforms; overflow stays outside',()=>{
  assert.equal(defendingFigures(1)[0].post,'door');
  assert.equal(defendingFigures(5)[0].post,'door');
  assert.equal(defendingFigures(15).find(f=>f.kind==='cavalry').post,'gate');
  for(const troops of [1,3,5,6,9,10,14,15,29,30,49,50,69,70,99,10000]){
    const figures=defendingFigures(troops);
    assert.equal(figures.reduce((sum,f)=>sum+f.count*f.value,0),troops);
    for(const figure of figures){
      assert.ok(Number.isFinite(figure.x)&&Number.isFinite(figure.y));
      if(figure.kind==='artillery')assert.ok(['tower','upper-tower','keep','forecourt'].includes(figure.post));
      if(figure.post==='tower')assert.equal(figure.y,96);
      if(figure.post==='wall')assert.equal(figure.y,116);
      if(figure.post==='forecourt')assert.equal(figure.y,158);
    }
  }
});

test('a depleted garrison retains its original castle and supported positions on a mountain',()=>{
  const scene=battleScene(16,1,'red','blue','Ada','Ben',true,75);
  assert.match(scene,/data-fortification="citadel"/);
  assert.match(scene,/class="defense-hill"/);
  assert.match(scene,/class="uphill-road"/);
  assert.match(scene,/--climb:-[1-9]/);
  assert.equal(mountainRise(150),0);
  assert.ok(mountainRise(273)>mountainRise(220));
  assert.equal(mountainRise(400),mountainLift);
  assert.match(scene,/class="defense-position" transform="translate\(0 -78\)"/);
  assert.equal((scene.match(/data-casualty="d-/g)||[]).length,1);
  assert.equal(defendingFigures(1,75)[0].post,'wall');
  assert.match(scene,/VERTEIDIGUNG · 1/);
  for(const troops of [16,26,54,75,150]){
    const attackers=battleScene(troops,75,'red','blue','','',true).split('<g class="scene-attacker">')[1];
    const positions=[...attackers.matchAll(/<g transform="translate\(([.\d]+) ([-.\d]+)\)"><g class="scene-advance"/g)];
    assert.equal(positions.length,attackingFigures(troops).length);
    assert.ok(positions.every(([,x,y])=>+x<190&&+y>=82),'all ranks assemble at the foot of the hill');
  }
});

test('75 defenders occupy all seven tower gun positions without stack multipliers',()=>{
  const figures=defendingFigures(75),guns=figures.filter(f=>f.kind==='artillery');
  assert.equal(guns.length,7);
  assert.equal(guns.filter(f=>f.post==='keep').length,3);
  assert.equal(guns.filter(f=>f.post==='upper-tower').length,2);
  assert.equal(guns.filter(f=>f.post==='tower').length,2);
  assert.ok(figures.every(f=>f.count===1));
  assert.doesNotMatch(battleScene(16,75,'red','blue'),/class="figure-count"/);
  assert.ok(defendingFigures(119).every(f=>f.count===1));
  assert.equal(defendingFigures(120).filter(f=>f.count>1).length,1);
});

test('capital keeps its impressive fortress even with one surviving defender',()=>{
  const scene=battleScene(12,1,'#a00','#00a','Angreifer','Hauptstadt',false,1,true);
  assert.match(scene,/data-capital-fortress="true"/);
  assert.match(scene,/data-fortification="citadel"/);
  assert.match(scene,/VERTEIDIGUNG · 1/);
  assert.equal((scene.match(/data-casualty="d-/g)||[]).length,1);
  assert.doesNotMatch(battleScene(12,1,'#a00','#00a','A','D',false,1),/data-capital-fortress/);
});
