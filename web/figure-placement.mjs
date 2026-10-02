// Hold the dropped position through intervening snapshots until the action
// settles. The next server snapshot confirms it or restores the valid position.
export function createFigurePlacement({getGame,send,render}) {
  const pending=new Map();
  const key=(id,piece)=>`${getGame()?.code}:${id}:${piece}`;
  return {
    position(id,piece){return pending.get(key(id,piece))?.position;},
    signature(id){return JSON.stringify([...pending.values()].filter(p=>p.code===getGame()?.code&&p.id===id));},
    async move(id,piece,position){
      const code=getGame()?.code,k=key(id,piece),change={code,id,piece,position:{...position}};
      pending.set(k,change);render();
      try{return await send('arrange',{territory:id,piece,position:change.position});}
      finally{if(pending.get(k)===change){pending.delete(k);if(getGame()?.code===code)render();}}
    },
  };
}
