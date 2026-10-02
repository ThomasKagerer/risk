import { clampCamera } from './rendering.mjs';

export function roomCodeFromHash(hash) {
  const code=hash.replace(/^#/, '').toUpperCase();
  return /^[A-HJ-NP-Z2-9]{6}$/.test(code)?code:'';
}

// Brief network interruptions must not send an existing player to the new-game form.
export async function loadRoom(read, pause=ms=>new Promise(resolve=>setTimeout(resolve,ms))) {
  for(let attempt=0;;attempt++) {
    try { return await read(); }
    catch(error) {
      if(attempt===2 || error.authRequired || (error.status && error.status<500))throw error;
      await pause(attempt===0?750:2000);
    }
  }
}

// Browser state is only a view preference. The server remains authoritative for
// the player, phase, territories, armies and every game action.
export function restoredView(saved, game, board, viewport) {
  if(!saved || saved.code!==game.code || saved.me!==game.me || saved.map!==(game.map||'classic'))return null;
  const c=saved.camera;
  if(!c || ![c.zoom,c.x,c.y].every(Number.isFinite))return null;
  const view={camera:clampCamera({...c},board.maxZoom||6,viewport)};
  if(saved.revision!==game.revision)return view;
  const territory=id=>Number.isInteger(id)&&id>0&&id<=board.countries.length?id:0;
  view.selected=territory(saved.selected);
  view.target=territory(saved.target);
  view.amount=Number.isInteger(saved.amount)&&saved.amount>0?saved.amount:1;
  view.diceChoice=[1,2,3,4,5,6].includes(saved.diceChoice)?saved.diceChoice:3;
  view.defenseChoice=Number.isInteger(saved.defenseChoice)&&saved.defenseChoice>=1&&saved.defenseChoice<=10?saved.defenseChoice:3;
  if(game.pending && saved.battleFocus===`${game.pending.from}:${game.pending.to}`)view.battleFocus=saved.battleFocus;
  return view;
}
