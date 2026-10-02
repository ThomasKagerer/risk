export function unitStars(survived=0) {
  return survived>=5?3:survived>=3?2:survived>=1?1:0;
}

export function armyExperience(territory={}) {
  const troops=territory.troops||0;
  const stars=(territory.experience||[]).slice(0,troops).reduce((sum,n)=>sum+unitStars(n),0);
  const bonus=[3,2,1].find(n=>2*stars>(2*n-1)*troops)||0;
  return {average:troops?stars/troops:0,bonus};
}

export function maxAttackDice(territory={},rules='') {
  return Math.max(0,Math.min(3+(rules==='domination'?armyExperience(territory).bonus:0),(territory.troops||0)-1));
}

// Figures can represent several troops (horse = 5, cannon = 10). Keep the
// exact member indices so badges and impacts use the server's actual units.
export function figureMembers(figures) {
  let offset=0;
  return figures.map(figure=>{
    const units=Array.from({length:figure.value*figure.count},(_,i)=>offset+i);
    offset+=units.length;
    return {...figure,units};
  });
}

export function experienceBadges(figure,experience) {
  if(!experience)return '';
  const counts=[0,0,0,0];
  for(const index of figure.units)counts[unitStars(experience[index])]++;
  const ranks=[1,2,3].filter(stars=>counts[stars]);
  return ranks.map((stars,i)=>{
    const count=counts[stars],group=figure.units.length>1;
    const label=`${count} ${count===1?'Einheit':'Einheiten'} mit ${stars} ${stars===1?'Stern':'Sternen'}`;
    return `<g class="unit-experience" data-stars="${stars}" data-units="${count}" transform="translate(${(i-(ranks.length-1)/2)*23} -43)" role="img" aria-label="${label}"><title>${label}${group?` · Figur: ${figure.units.length} Einheiten, davon ${counts[0]} ohne Sterne`:''}</title><path d="M0-11 3.2-4.1 10.5-3.4 5.1 2 6.5 9 0 5.7-6.5 9-5.1 2-10.5-3.4-3.2-4.1Z" fill="#ffda43" stroke="#8a5707" stroke-width="1"/><text y="3" text-anchor="middle" fill="#493008" font-size="10" font-weight="900" font-family="system-ui,sans-serif">${stars}</text>${group?`<text y="18" text-anchor="middle" fill="#fff0b5" stroke="#26332c" stroke-width="2" paint-order="stroke" font-size="9" font-weight="700">×${count}</text>`:''}</g>`;
  }).join('');
}
