// Input devices can produce several events per display frame. Keep only the
// latest camera state and never leave an animation loop running while idle.
export function frameBatch(render, request = requestAnimationFrame, cancel = cancelAnimationFrame) {
  let pending = null;
  return {
    schedule() {
      if (pending !== null) return;
      pending = request(() => { pending = null; render(); });
    },
    flush() {
      if (pending !== null) cancel(pending);
      pending = null;
      render();
    },
    cancel() {
      if (pending !== null) cancel(pending);
      pending = null;
    },
  };
}

export function setAttributeChanged(node, name, value) {
  value = String(value);
  if (node.getAttribute(name) !== value) node.setAttribute(name, value);
}

export function setTextChanged(node, value) {
  value = String(value);
  if (node.textContent !== value) node.textContent = value;
}

// Counter size is expressed in screen pixels, independent of both the board's
// responsive size and its camera zoom. The army figures keep the camera scale.
export function markerScale(zoom, pixelsPerUnit = 1) {
  return 1 / (zoom * pixelsPerUnit);
}

// Move the SVG viewport instead of transforming the entire map's render layer.
// This keeps Safari's backing surface bounded by the visible browser viewport.
export function cameraViewBox(camera, viewport = {width:800,height:500}) {
  return `${-camera.x/camera.zoom} ${-camera.y/camera.zoom} ${viewport.width/camera.zoom} ${viewport.height/camera.zoom}`;
}

// SVG groups and their figures survive every pan and zoom. Only a territory
// whose owner, troop count or experience changes gets new children.
export function armyLayer(layer, countries, markup) {
  const groups = countries.map(country => {
    const node = layer.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'g');
    node.setAttribute('transform', `translate(${country.x},${country.y}) scale(${country.armyScale || 1})`);
    node.setAttribute('style',`--army-base-scale:${country.armyScale||1}`);
    layer.appendChild(node);
    return { node, key: null };
  });
  let visible;
  return {
    viewportItems() {
      return groups.map((entry,i)=>({node:entry.node,bounds:countries[i].bounds||[countries[i].x-35,countries[i].y-35,70,70]}));
    },
    suppress(ids = []) {
      groups.forEach((entry,i) => { entry.node.style.visibility=ids.includes(countries[i].id)?'hidden':''; });
    },
    setVisible(next) {
      if (next === visible) return;
      visible = next;
      layer.style.display = next ? '' : 'none';
    },
    update(territories, color, appearance = () => '') {
      let changed = 0;
      groups.forEach((entry, i) => {
        const territory = territories?.[i];
        const key = territory && territory.owner >= 0 && territory.troops > 0
          ? `${territory.owner}:${territory.troops}:${color(territory.owner)}:${JSON.stringify(territory.positions || [])}:${JSON.stringify(territory.experience || [])}:${appearance(territory,countries[i])}` : '';
        if (entry.key === key) return;
        entry.key = key;
        entry.node.innerHTML = key ? markup(territory, countries[i]) : '';
        changed++;
      });
      return changed;
    },
  };
}

// Numeric bounds are prepared once. Camera frames never read layout or replace
// SVG children; offscreen detail and its animations are removed from rendering.
export function viewportLayer(items) {
  const entries=items.map(item=>({...item,visible:null}));
  let writes=0;
  return {
    update(camera,pixelsPerUnit=1,viewport={width:800,height:500},moving=false) {
      const pad=100/(camera.zoom*Math.max(.1,pixelsPerUnit));
      const left=-camera.x/camera.zoom-pad,top=-camera.y/camera.zoom-pad;
      const right=(viewport.width-camera.x)/camera.zoom+pad,bottom=(viewport.height-camera.y)/camera.zoom+pad;
      for(const entry of entries){
        const [x,y,w,h]=entry.bounds;
        const visible=x+w>=left&&x<=right&&y+h>=top&&y<=bottom;
        // During navigation, reveal incoming detail but keep existing renderers.
        // Prune once the camera settles, not while WebKit is painting the move.
        if(moving&&entry.visible&&!visible)continue;
        if(entry.visible===visible)continue;
        entry.visible=visible;entry.node.style.display=visible?'':'none';writes++;
      }
    },
    stats(){return {total:entries.length,visible:entries.filter(e=>e.visible).length,writes};},
  };
}

export function clampCamera(camera, maxZoom = 6, viewport = {width:800,height:500}) {
  // The overview fits inside the area left by floating menus. At higher zoom,
  // constrain panning to that same area; smaller axes stay centered in it.
  const {left=0,right=0,top=0,bottom=0}=viewport.insets||{};
  const width=Math.max(1,viewport.width-left-right),height=Math.max(1,viewport.height-top-bottom);
  camera.zoom = Math.max(Math.min(width/800,height/500), Math.min(maxZoom, camera.zoom));
  const mapWidth=800*camera.zoom,mapHeight=500*camera.zoom;
  camera.x = mapWidth<=width?left+(width-mapWidth)/2:Math.max(left+width-mapWidth,Math.min(left,camera.x));
  camera.y = mapHeight<=height?top+(height-mapHeight)/2:Math.max(top+height-mapHeight,Math.min(top,camera.y));
  return camera;
}
