"""Import the supplied Domination board, card definitions, translations and sounds.
Build-time utility only; requires Pillow. No Python dependency at runtime.
"""
from pathlib import Path
from PIL import Image
import json, re, shutil
from atlas_geometry import apply_atlas

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT.parent / 'Domination'
MAPS = SOURCE / 'swingUI/game/Domination/maps'

def sections(path):
    result, section = {}, None
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith(';'): continue
        if line.startswith('['):
            section = line[1:-1]; result[section] = []
        elif section: result[section].append(line.split())
    return result

translations = {}
for line in (SOURCE / 'src/net/yura/domination/engine/translation/DefaultMaps_de.properties').read_text().splitlines():
    if '=' in line:
        k, v = line.split('=', 1)
        translations[k] = re.sub(r'\\u([0-9A-Fa-f]{4})', lambda m: chr(int(m[1],16)), v)

def simplify(points, epsilon=.7):
    if len(points) < 3: return points
    a,b = points[0],points[-1]
    dx,dy = b[0]-a[0],b[1]-a[1]
    def dist(p):
        t=max(0,min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy or 1)))
        return ((p[0]-a[0]-t*dx)**2+(p[1]-a[1]-t*dy)**2)**.5
    d,i=max((dist(p),i) for i,p in enumerate(points[1:-1],1))
    if d<=epsilon: return [a,b]
    return simplify(points[:i+1],epsilon)[:-1]+simplify(points[i:],epsilon)

im=Image.open(MAPS/'world_map.gif').convert('RGB')
w,h=im.size
pixels=im.load()
edges={i:{} for i in range(1,43)}
for y in range(h):
    for x in range(w):
        n=pixels[x,y][0]
        if n not in edges: continue
        for ox,oy,a,b in [(0,-1,(x,y),(x+1,y)),(1,0,(x+1,y),(x+1,y+1)),(0,1,(x+1,y+1),(x,y+1)),(-1,0,(x,y+1),(x,y))]:
            xx,yy=x+ox,y+oy
            if not (0<=xx<w and 0<=yy<h) or pixels[xx,yy][0]!=n:
                edges[n].setdefault(a,[]).append(b)
paths={}
for n, graph in edges.items():
    parts=[]
    while graph:
        start=next(iter(graph)); p=start; points=[p]
        while True:
            q=graph[p].pop()
            if not graph[p]: del graph[p]
            points.append(q); p=q
            if p==start: break
        if len(points)<10: continue
        points=simplify(points)
        parts.append('M'+'L'.join(f'{x},{y}' for x,y in points)+'Z')
    paths[n]=''.join(parts)

raw=sections(MAPS/'world.map')
borders={int(row[0]):list(map(int,row[1:])) for row in raw['borders']}
countries=[]
for num,name,continent,x,y in raw['countries']:
    n=int(num)
    countries.append(dict(id=n,name=translations.get(name,name),continent=int(continent),x=int(x),y=int(y),neighbors=borders[n],path=paths[n]))
continents=[dict(id=i+1,name=translations.get(row[0],row[0]),bonus=int(row[1])) for i,row in enumerate(raw['continents'])]
cards=[]
for i,row in enumerate(sections(MAPS/'risk.cards')['cards']):
    cards.append(dict(id=i,kind={'Infantry':'infantry','Cavalry':'cavalry','Cannon':'artillery','wildcard':'wild'}[row[0]],territory=int(row[1]) if len(row)>1 else 0))
routes=[[1,38],[6,14],[14,15],[14,17],[15,17],[17,18],[17,19],[19,21],[20,21],[20,22],[12,21],[24,26],[25,26],[33,39],[39,40],[39,41],[40,41],[40,42],[36,37],[37,38]]
data=dict(width=w,height=h,countries=countries,continents=continents,cards=cards,routes=routes)
apply_atlas(data)
(ROOT/'web/assets/board.json').write_text(json.dumps(data,ensure_ascii=False,separators=(',',':')))
for dest,src in {'select':'select1','place':'adding pieces','attack':'attack','card':'receiving card','move':'moving troops1'}.items():
    shutil.copyfile(SOURCE/f'swingUI/game/Domination/sound/medieval/{src}.mp3',ROOT/f'web/assets/sounds/{dest}.mp3')
shutil.copyfile(SOURCE/'gpl.txt',ROOT/'LICENSE')
print(f'Imported {len(countries)} territories, {len(cards)} cards, {sum(len(p) for p in paths.values())} bytes of vector paths.')
