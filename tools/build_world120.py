"""Build the historical board from coastlines and curated regional anchors.

Development dependency: Shapely >= 2.1. No GIS dependency in the game server.
Borders are schematic game regions, NOT reconstructed sovereign borders of 1700.
The coastline input is derived from Natural Earth 5.1.2 (public domain).
"""
import json
from pathlib import Path
from math import sqrt
from shapely import geometry as G, ops, voronoi_polygons

ROOT = Path(__file__).resolve().parents[1]
# Names, geographic anchors, and modern search aliases where useful.
REGIONS = [
 ('Nordamerika', 9, [
  ('Aleuten',-151,62),('Athabaska',-127,63),('Nordwestküste',-126,49),
  ('Kalifornien',-119,36),('Neumexiko',-105,34),('Neuspanien',-101,23),
  ('Maya-Lande',-87,17),('Antillen',-75,20),('Neuengland',-73,42),
  ('Neufrankreich',-72,49),('Louisiana',-91,32),('Prärien',-106,46),
  ('Rupertland',-93,56),('Inuit-Lande',-97,72),('Grönland',-42,72),('Neufundland',-56,52),
 ]),
 ('Südamerika', 7, [
  ('Neugranada',-74,6),('Venezuela',-66,9),('Guayana',-57,5),('Amazonien',-64,-5),
  ('Pernambuco',-39,-9),('Bahia',-45,-18),('Peru',-76,-11),('Charcas',-65,-19),
  ('Chile',-72,-31),('Río de la Plata',-59,-34),('Patagonien',-69,-46),('Paraguay',-57,-24),
 ]),
 ('Europa', 12, [
  ('Portugal',-8,39),('Kastilien',-4,40),('Aragon',0,41),('Frankreich',2,47),
  ('Niederlande',5,52),('England',-1,52),('Schottland',-4,57),('Irland',-8,53),
  ('Island',-19,65),('Norwegen',8,62),('Schweden',16,62),('Finnland',26,64),
  ('Dänemark',10,56),('Deutsche Reichslande',10,51,'Deutschland'),
  ('Schweizer Eidgenossenschaft',8,47,'Schweiz'),('Kurfürstentum Bayern',11.58,48.14,'Bayern'),('Italien',12,44),
  ('Neapel',16,40),('Österreich',14,47),('Böhmen',15,50),('Polen',20,52),
  ('Litauen',26,54),('Livland',25,58),('Ungarn',21,47),('Rumelien',23,41),
  ('Krim',34,45),('Kosaken-Hetmanat',32,51,'Ukraine'),('Moskowien',38,56,'Moskau Russland'),
  ('Nowgorod',31,59),('Wologda',44,62),
 ]),
 ('Afrika', 11, [
  ('Marokko',-7,31),('Algier',3,33),('Tunis',10,34),('Tripolitanien',18,29),
  ('Ägypten',30,28),('Nubien',30,17),('Abessinien',39,10),('Somali-Küste',47,6),
  ('Swahili-Küste',40,-7),('Große Seen',29,-3),('Kongo',23,-5),('Loango',12,-3),
  ('Angola',17,-14),('Mutapa',31,-18),('Kapland',24,-31),('Madagaskar',47,-20),
  ('Kalahari',22,-22),('Sambesi',27,-12),('Bornu',17,13),('Hausaland',8,11),
  ('Goldküste',-2,7),('Senegambien',-14,14),('Timbuktu',-3,20),('Sahara',7,23),
 ]),
 ('Asien', 14, [
  ('Kasan',49,55),('Ural',59,62),('Westsibirien',80,61),('Jakutien',122,64),
  ('Kamtschatka',158,61),('Mongolei',105,47),('Mandschurei',128,47),('Korea',127,38),
  ('Japan',138,37),('China',112,31),('Tibet',88,31),('Dschungarei',83,46),
  ('Buchara',65,40),('Persien',53,32),('Kaukasus',46,42),('Anatolien',33,39),
  ('Levante',37,32),('Arabien',44,23),('Oman',56,21),('Hindustan',77,28),
  ('Bengalen',89,24),('Dekkan',78,16),('Ceylon',81,7),('Ava',96,22),
  ('Siam',101,16),('Đại Việt',107,18,'Vietnam'),('Malakka',102,5),
  ('Singapura',103.82,1.35,'Singapur'),('Sumatra',101,-1),('Philippinen',123,12),
 ]),
 ('Inselwelten', 5, [
  ('Java',110,-7),('Borneo',114,1),('Neuguinea',145,-5),('Arnhemland',134,-14),
  ('Westaustralien',120,-27),('Ostaustralien',148,-29),('Neuseeland',173,-41),('Fidschi',178,-18),
 ]),
]

def project(x, y, z=None):
    return 20+(x+180)*760/360, 20+(84-y)*450/144

def polygons(shape):
    if shape.geom_type == 'Polygon': return [shape]
    return [p for g in getattr(shape,'geoms',[]) for p in polygons(g)]

def svg_path(shape):
    parts=[]
    for p in polygons(shape):
        for ring in [p.exterior,*p.interiors]:
            parts.append('M'+'L'.join(f'{x:.2f},{y:.2f}' for x,y in list(ring.coords)[:-1])+'Z')
    return ''.join(parts)

def prepare_source(source):
    """Keep coastlines only: current country borders never define game regions."""
    raw=json.loads(Path(source).read_text())
    countries={f['properties']['ADM0_A3']:G.shape(f['geometry']) for f in raw['features'] if f['properties']['ADM0_A3']!='ATA'}
    coast=ops.unary_union(list(countries.values())).simplify(.09,preserve_topology=True)
    # Remove microscopic fragments while retaining Singapore separately.
    coast=G.MultiPolygon([p for p in polygons(coast) if p.area>.012])
    out=ROOT/'tools/data/coastline.json';out.parent.mkdir(exist_ok=True)
    out.write_text(json.dumps({'coast':G.mapping(coast),'singapura':G.mapping(countries['SGP'])},separators=(',',':')))

def build():
    source=json.loads((ROOT/'tools/data/coastline.json').read_text())
    land=ops.transform(project,G.shape(source['coast']))
    entries=[]
    for continent,(name,bonus,regions) in enumerate(REGIONS,1):
        for region in regions:
            title,lon,lat,*aliases=region
            entries.append(dict(name=title,continent=continent,anchor=project(lon,lat),aliases=aliases))
    assert len(entries)==120, len(entries)
    sg=next(i for i,e in enumerate(entries) if e['name']=='Singapura')
    seeds=[e['anchor'] for i,e in enumerate(entries) if i!=sg]
    cells=list(voronoi_polygons(G.MultiPoint(seeds),extend_to=G.box(0,0,800,500),ordered=True).geoms)
    # Enlarge Singapore around its real position at the peninsula's southern
    # tip. Moving it offshore would misplace both its army and attack routes.
    from shapely.affinity import scale
    sg_real=ops.transform(project,G.shape(source['singapura']))
    sg_shape=scale(sg_real,10,10,origin='centroid')
    shapes=[];cell=0
    for i,e in enumerate(entries):
        if i==sg:
            shape=sg_shape
        else:
            shape=cells[cell].intersection(land).difference(sg_real).difference(sg_shape);cell+=1
            # Keep a country's main body and substantial islands, not remote
            # specks that would create invisible accidental game connections.
            pp=polygons(shape);big=max(p.area for p in pp)
            shape=ops.unary_union([p for p in pp if p.area>max(.025,big*.0004)])
        shapes.append(shape)
    neighbors=[set() for _ in entries]
    for i,a in enumerate(shapes):
        for j in range(i):
            b=shapes[j]
            # A shared point alone is not a playable land border.
            if a.boundary.intersection(b.boundary).length>.12:
                neighbors[i].add(j+1);neighbors[j].add(i+1)
    routes=[]
    by_name={e['name']:i for i,e in enumerate(entries)}
    def connect(a,b):
        i,j=by_name[a],by_name[b]
        if j+1 not in neighbors[i]:
            neighbors[i].add(j+1);neighbors[j].add(i+1);routes.append([i+1,j+1])
    # Explicit crossings keep the board readable and the world connected.
    for a,b in [
      ('Aleuten','Kamtschatka'),('Grönland','Inuit-Lande'),('Grönland','Neufundland'),
      ('Grönland','Island'),('Island','Norwegen'),('Island','Schottland'),
      ('Irland','Schottland'),('Irland','England'),('England','Frankreich'),
      ('England','Niederlande'),('Dänemark','Schweden'),('Dänemark','Deutsche Reichslande'),
      ('Antillen','Neuspanien'),('Antillen','Louisiana'),('Antillen','Venezuela'),
      ('Maya-Lande','Neugranada'),('Pernambuco','Senegambien'),('Kastilien','Marokko'),
      ('Italien','Tunis'),('Neapel','Rumelien'),('Rumelien','Anatolien'),
      ('Madagaskar','Swahili-Küste'),('Madagaskar','Mutapa'),('Ceylon','Dekkan'),
      ('Ceylon','Bengalen'),('Japan','Korea'),('Japan','Mandschurei'),
      ('Philippinen','China'),('Philippinen','Borneo'),('Malakka','Singapura'),
      ('Singapura','Sumatra'),('Singapura','Borneo'),('Sumatra','Java'),('Java','Borneo'),
      ('Java','Westaustralien'),('Borneo','Neuguinea'),('Neuguinea','Arnhemland'),
      ('Neuguinea','Fidschi'),('Fidschi','Neuseeland'),('Neuseeland','Ostaustralien'),
    ]: connect(a,b)
    # Validate connectivity rather than silently inventing arbitrary extra links.
    reached={1};queue=[1]
    for i in queue:
        for j in neighbors[i-1]-reached: reached.add(j);queue.append(j)
    assert len(reached)==120, [entries[i-1]['name'] for i in range(1,121) if i not in reached]
    from terrain_rules import mountain_ranges, mountain_bonus
    ranges=mountain_ranges(project)
    countries=[]
    short={'Kurfürstentum Bayern':'Bayern','Deutsche Reichslande':'Reichslande','Schweizer Eidgenossenschaft':'Schweiz','Kosaken-Hetmanat':'Hetmanat'}
    for i,(e,shape) in enumerate(zip(entries,shapes),1):
        main=max(polygons(shape),key=lambda p:p.area)
        from shapely.ops import polylabel
        p=polylabel(main,tolerance=.1)
        # Keep the Moscow label near Moscow instead of at the centre of a far
        # northern island belonging to the same schematic cell.
        anchor=G.Point(e['anchor'])
        if shape.contains(anchor) and shape.boundary.distance(anchor)>2: p=anchor
        if i==sg+1:p=main.centroid
        x,y=p.x,p.y;lowx,lowy,highx,highy=shape.bounds
        countries.append(dict(id=i,name=e['name'],label=short.get(e['name'],e['name']),aliases=e['aliases'],continent=e['continent'],
            x=round(x,2),y=round(y,2),neighbors=sorted(neighbors[i-1]),path=svg_path(shape),
            bounds=[round(v,2) for v in [lowx,lowy,highx-lowx,highy-lowy]],
            armyScale=round(min(1,max(.25,sqrt(main.area)/18)),2),small=main.area<150,
            mountainous=mountain_bonus(shape,ranges)))
    classic=json.loads((ROOT/'web/assets/board.json').read_text())
    symbols=[c['kind'] for c in classic['cards'] if c['kind']!='wild']
    cards=[dict(id=i,kind=symbols[i%len(symbols)],territory=i+1) for i in range(120)]
    cards += [dict(id=120+i,kind='wild',territory=0) for i in range(2)]
    data=dict(id='world120',name='Welt um 1700',width=800,height=500,maxZoom=18,artwork='historical-1700',
              description='120 historisch inspirierte Spielregionen. Vereinfachte Grenzen, keine exakte politische Karte des Jahres 1700.',
              coastPath=svg_path(ops.unary_union(shapes).simplify(.3)),countries=countries,continents=[dict(id=i,name=n,bonus=b) for i,(n,b,_) in enumerate(REGIONS,1)],
              cards=cards,routes=routes,wrapRoute=[by_name['Aleuten']+1,by_name['Kamtschatka']+1],
              singaporeOrigin=list(project(103.82,1.35)))
    from build_continents import add_continents
    add_continents(data)
    (ROOT/'web/dlcs/world-1700/world120.json').write_text(json.dumps(data,ensure_ascii=False,separators=(',',':')))
    print('Built 120 regions, 122 cards,',sum(map(len,neighbors))//2,'connections.')

if __name__=='__main__':
    import sys
    if len(sys.argv)>1: prepare_source(sys.argv[1])
    build()
