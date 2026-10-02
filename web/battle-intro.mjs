import { localize as tr } from './i18n.mjs';
// Present each new attack route once. Cancelling also settles the waiting
// animation, so pause/reconnect cannot reopen an obsolete battlefield.
export function createBattleIntro({show,focus,tick,hide,schedule=setTimeout,cancel=clearTimeout}) {
  let lastKey='',active=null;
  function finish(run,completed){
    if(active!==run)return;
    cancel(run.timer);active=null;hide(completed);run.resolve(completed);
  }
  return {
    cancel(){if(active)finish(active,false);lastKey='';},
    present(game,from,to,reduced,overview){
      const key=`${game.code}:${game.round}:${game.turn}:${from.id}:${to.id}`;
      if(key===lastKey)return Promise.resolve(true);
      if(active)finish(active,false);
      lastKey=key;
      return new Promise(resolve=>{
        const run={resolve,timer:null};active=run;show(from,to);
        async function prepare(){
          if(overview)await overview;
          if(active!==run)return;
          await focus(from,to,reduced);
          if(active!==run)return;
          let seconds=2;tick(seconds);
          function step(){
            if(active!==run)return;
            if(--seconds===0){finish(run,true);return;}
            tick(seconds);run.timer=schedule(step,1000);
          }
          run.timer=schedule(step,1000);
        }
        prepare().catch(()=>finish(run,false));
      });
    },
  };
}

// Coordinates follow the map; arrowheads and labels keep their screen size.
function routeGeometry(from,to,scale){
  const dx=to.x-from.x,dy=to.y-from.y,distance=Math.hypot(dx,dy);
  if(!distance)return null;
  const ux=dx/distance,uy=dy/distance,gap=Math.min(23*scale,distance*.22);
  const start={x:from.x+ux*gap,y:from.y+uy*gap},end={x:to.x-ux*gap,y:to.y-uy*gap};
  const bend=Math.min(45*scale,distance*.2),cx=(from.x+to.x)/2-uy*bend,cy=(from.y+to.y)/2+ux*bend;
  const angle=Math.atan2(end.y-cy,end.x-cx)*180/Math.PI;
  const path=`M${start.x} ${start.y} Q${cx} ${cy} ${end.x} ${end.y}`;
  return {path,arrow:`translate(${end.x} ${end.y}) rotate(${angle}) scale(${scale})`,start:`translate(${from.x} ${from.y}) scale(${scale})`,end:`translate(${to.x} ${to.y}) scale(${scale})`};
}
export function attackRouteMarkup(from,to,scale=1){
  const geometry=routeGeometry(from,to,scale);if(!geometry)return '';
  const marker=(part,label,color,y)=>`<g data-route="${part}" transform="${geometry[part]}"><g transform="translate(0 ${y})"><rect x="-27" y="-10" width="54" height="20" rx="5" fill="${color}" stroke="#fffbed" stroke-width="1.5"/><text text-anchor="middle" y="4" fill="#fffbed" font-size="11" font-weight="800" font-family="system-ui,sans-serif">${label}</text></g></g>`;
  return `<path data-route="halo" d="${geometry.path}" fill="none" stroke="#fffbed" stroke-width="10" vector-effect="non-scaling-stroke"/><path data-route="line" d="${geometry.path}" fill="none" stroke="#a72e24" stroke-width="5" vector-effect="non-scaling-stroke"/><path data-route="arrow" d="M0 0-14-8-10 0-14 8Z" transform="${geometry.arrow}" fill="#a72e24" stroke="#fffbed" stroke-width="1.5"/>${marker('start',tr('START'),'#1d626c',-34)}${marker('end',tr('ZIEL'),'#a72e24',34)}`;
}

const routeLayers=new WeakMap();
// Panning only moves the parent camera. Zooming updates existing SVG attributes;
// replacing the arrow and labels every frame makes WebKit repaint the whole map.
export function renderAttackRoute(root,from,to,scale=1){
  const key=[from.id,from.x,from.y,to.id,to.x,to.y].join(':');
  let layer=routeLayers.get(root);
  if(layer?.key!==key||!root.firstChild){
    root.innerHTML=attackRouteMarkup(from,to,scale);
    layer={key,scale,nodes:Object.fromEntries(['halo','line','arrow','start','end'].map(part=>[part,root.querySelector(`[data-route="${part}"]`)]))};
    routeLayers.set(root,layer);
    return;
  }
  if(layer.scale===scale)return;
  layer.scale=scale;
  const geometry=routeGeometry(from,to,scale);if(!geometry)return;
  for(const part of ['halo','line'])layer.nodes[part].setAttribute('d',geometry.path);
  for(const part of ['arrow','start','end'])layer.nodes[part].setAttribute('transform',geometry[part]);
}
