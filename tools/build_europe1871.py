"""Europe in 1871, after Frankfurt. Reproducible, schematic game regions.

Sovereign outlines adapted from Historical Basemaps (1878, GPL-3.0), with
explicit pre-1878 Balkan corrections. Internal subdivisions are game regions,
not a reconstruction of every administrative boundary. See docs/europe1871.md.
"""
import gzip, json, math, sys
from pathlib import Path
from shapely import geometry as G, ops, make_valid, voronoi_polygons
from shapely.ops import polylabel
from build_world120 import ROOT, polygons, svg_path
from build_terrain import TOWNS, forest_tiles, lines, assign_settlement_territories
from terrain_rules import mountain_ranges, mountain_bonus

EXTENT = G.box(-25, 34, 45, 72)
CONTINENTS = [('Nordeuropa', 4), ('Großbritannien', 3), ('Deutsches Reich', 7),
              ('Balkan', 5), ('Südeuropa', 6), ('Russisches Reich', 6),
              ('Österreich-Ungarn', 5), ('Westeuropa', 5)]
# Political affiliation is separate from the geographical reinforcement groups.
REGIONS = [
 ('Iceland',1,'Dänemark',[('Island',-19,65)]),
 ('United Kingdom of Great Britain and Ireland',2,'Vereinigtes Königreich',[('Irland',-8,53),('Schottland',-4,57),('Wales',-4,52),('England',0,52)]),
 ('Sweden–Norway',1,'Schweden-Norwegen',[('Südnorwegen',8,61),('Nordnorwegen',18,68),('Svealand',16,59),('Norrland',19,65)]),
 ('Denmark',1,'Dänemark',[('Dänemark',10,56)]),
 ('Portugal',5,'Portugal',[('Portugal',-8,39)]),
 ('Spain',5,'Spanien',[('Galicien',-7,42),('Kastilien',-4,40),('Aragonien',0,41),('Andalusien',-4,37)]),
 ('France',8,'Frankreich',[('Bretagne',-3,48),('Île-de-France',2.4,48.8),('Aquitanien',0,44.5),('Provence',5.5,44),('Korsika',9,42)]),
 ('Belgium',8,'Belgien',[('Belgien',4.5,50.6)]),
 ('Netherlands',8,'Niederlande',[('Niederlande',5.5,52.5)]),
 ('Luxembourg',8,'Luxemburg',[('Luxemburg',6.1,49.8)]),
 ('Germany',3,'Deutsches Reich',[('Rheinprovinz',8,51),('Hannover',9.5,52.5),('Schleswig-Holstein',9.7,54.5),('Brandenburg',13,52),('Pommern',16,54),('Ostpreußen',21,54.5),('Posen',17.5,52),('Schlesien',17,50.5),('Sachsen',13,51),('Hessen',8.6,50.3),('Baden und Württemberg',8.5,48.5),('Bayern',11.5,48.5),('Elsass-Lothringen',7.2,48.7)]),
 ('Austria Hungary',7,'Österreich-Ungarn',[('Tirol',11.3,46.8),('Österreich',14.5,47.5),('Böhmen',14.4,50),('Mähren',17,49.5),('Galizien',23,49.5),('Ungarn',19.5,47),('Siebenbürgen',24.5,46.5),('Kroatien-Slawonien',16.5,45.5)]),
 ('Switzerland',8,'Schweiz',[('Schweiz',8,47)]),
 ('Italy',5,'Königreich Italien',[('Piemont-Lombardei',8.5,45),('Venetien',12,45.5),('Mittelitalien',12,43),('Süditalien',16,40),('Sizilien',14,37.5),('Sardinien',9,40)]),
 ('Romania1871',4,'Fürstentum Rumänien · osmanische Oberhoheit',[('Walachei',25,44.5),('Moldau',27,47)]),
 ('Serbia1871',4,'Fürstentum Serbien · osmanische Oberhoheit',[('Serbien',20.7,44)]),
 ('Montenegro1871',4,'Fürstentum Montenegro',[('Montenegro',18.9,42.7)]),
 ('Greece',4,'Königreich Griechenland',[('Griechenland',22.5,38)]),
 ('Ottoman1871',4,'Osmanisches Reich',[('Bosnien',17.5,44),('Albanien',20,41.3),('Makedonien',23,41),('Bulgarien',25.5,43),('Thrakien',27,41.7),('Kreta',25,35.2)]),
 ('Russian Empire',6,'Russisches Reich',[('Finnland',26,64),('Baltikum',25,57),('Kongresspolen',21.5,52.5),('Weißrussland',28,54),('Sankt Petersburg',32,60),('Moskau',38,56),('Ukraine',31,49),('Krim',35,45),('Nordrussland',40,67)]),
]

def project(x,y,z=None): return 20+(x+25)*760/70, 20+(72-y)*460/38

def prepare(path):
    raw=json.loads(Path(path).read_text()); shapes={}
    names={r[0] for r in REGIONS}|{'Romania','Serbia','Montenegro','Bulgaria','Bosnia-Herzegovina','Ottoman Empire'}
    for f in raw['features']:
        n=f['properties']['NAME']
        if n not in names: continue
        shape=make_valid(G.shape(f['geometry'])).intersection(EXTENT)
        if not shape.is_empty: shapes[n]=ops.unary_union([shapes.get(n,G.GeometryCollection()),shape])
    # Keep only the European side of the Ottoman Empire, including Crete.
    europe=G.Polygon([(13,34),(26,34),(26,40.4),(27.3,40.9),(28.95,41.04),(29.15,41.23),(29.1,42),(31,42),(31,45),(13,45)])
    ottoman=ops.unary_union([shapes['Ottoman Empire'].intersection(europe),shapes['Bulgaria'],shapes['Bosnia-Herzegovina']])
    # Remove the Serbian and Montenegrin gains of 1878. These corrections are
    # deliberately generalised at game-map scale, following the 1871 atlas.
    serbia=shapes['Serbia'].intersection(G.Polygon([(18,46),(24,46),(24,43.75),(21.7,43.65),(21.2,43.3),(20.4,43.2),(19.2,43.6),(18,43.6)]))
    montenegro=shapes['Montenegro'].intersection(G.Polygon([(18.45,43.3),(19.25,43.3),(19.3,42.55),(18.8,42.3),(18.45,42.5)]))
    ottoman=ops.unary_union([ottoman,shapes['Serbia'].difference(serbia),shapes['Montenegro'].difference(montenegro)])
    # Dobrudja was Ottoman in 1871; southern Bessarabia belonged to Romania.
    dobrudja=shapes['Romania'].intersection(G.Polygon([(28,44.2),(28,45.45),(29.7,45.45),(31,44.9),(31,43),(28,43)]))
    bessarabia=shapes['Russian Empire'].intersection(G.Polygon([(28.05,45.45),(28.25,45.8),(28.65,46.3),(29.1,46.5),(29.7,46.1),(30.35,45.85),(29.7,45.15)]))
    shapes['Romania1871']=ops.unary_union([shapes['Romania'].difference(dobrudja),bessarabia])
    shapes['Russian Empire']=shapes['Russian Empire'].difference(bessarabia).intersection(G.box(-25,43,45,72))
    shapes['Serbia1871']=serbia;shapes['Montenegro1871']=montenegro
    shapes['Ottoman1871']=ops.unary_union([ottoman,dobrudja])
    # Ensure hand-corrected outlines form a nonoverlapping partition; small
    # source overlaps otherwise draw conflicting ownership and create slivers.
    occupied=G.GeometryCollection(); result={}
    for name,*_ in REGIONS:
        shape=make_valid(shapes[name]).difference(occupied)
        shape=ops.unary_union([p for p in polygons(shape) if p.area>.012])
        result[name]=G.mapping(shape);occupied=ops.unary_union([occupied,shape])
    out={'source':'https://github.com/aourednik/historical-basemaps/blob/master/geojson/world_1878.geojson','license':'GPL-3.0','note':'Europe only; Balkan outlines adapted to 1871, generalised. See generator and docs/europe1871.md.','polities':result}
    with gzip.GzipFile(filename=str(ROOT/'tools/data/europe1871-source.json.gz'),mode='wb',mtime=0) as f:f.write(json.dumps(out,separators=(',',':')).encode())

def build():
    with gzip.open(ROOT/'tools/data/europe1871-source.json.gz','rt') as f:source=json.load(f)
    shapes=[];entries=[]
    for name,continent,polity,regions in REGIONS:
        land=ops.transform(project,G.shape(source['polities'][name]))
        anchors=[project(x,y) for _,x,y in regions]
        cells=[land] if len(anchors)==1 else list(voronoi_polygons(G.MultiPoint(anchors),extend_to=G.box(0,0,800,500),ordered=True).geoms)
        for (title,lon,lat),cell in zip(regions,cells):
            shape=cell.intersection(land)
            shape=ops.unary_union([p for p in polygons(shape) if p.area>.15])
            assert not shape.is_empty,title
            shapes.append(shape);entries.append(dict(name=title,continent=continent,polity=polity,anchor=project(lon,lat)))
    neighbors=[set() for _ in entries];routes=[]
    # Historical source borders can differ by metres after digitising; a tiny
    # tolerance joins these lines but never jumps genuine channels or straits.
    for i,a in enumerate(shapes):
        for j,b in enumerate(shapes[:i]):
            if a.distance(b)<.08 and a.buffer(.06).intersection(b.buffer(.06)).area>.08:
                neighbors[i].add(j+1);neighbors[j].add(i+1)
    by_name={e['name']:i for i,e in enumerate(entries)}
    def connect(a,b):
        i,j=by_name[a],by_name[b]
        if j+1 not in neighbors[i]:neighbors[i].add(j+1);neighbors[j].add(i+1);routes.append([i+1,j+1])
    for a,b in [('Island','Schottland'),('Island','Südnorwegen'),('Irland','Schottland'),('Irland','Wales'),('England','Île-de-France'),('England','Niederlande'),('Südnorwegen','Dänemark'),('Dänemark','Svealand'),('Dänemark','Schleswig-Holstein'),('Svealand','Finnland'),('Korsika','Provence'),('Korsika','Piemont-Lombardei'),('Korsika','Sardinien'),('Sardinien','Mittelitalien'),('Sizilien','Süditalien'),('Süditalien','Griechenland'),('Griechenland','Kreta'),('Kreta','Thrakien')]:connect(a,b)
    reached={1};queue=[1]
    for i in queue:
        for j in neighbors[i-1]-reached:reached.add(j);queue.append(j)
    assert len(reached)==len(entries),[e['name'] for i,e in enumerate(entries,1) if i not in reached]
    ranges=mountain_ranges(project);countries=[]
    for i,(e,s) in enumerate(zip(entries,shapes),1):
        main=max(polygons(s),key=lambda p:p.area);p=polylabel(main,tolerance=.15)
        anchor=G.Point(e.pop('anchor'))
        if main.contains(anchor) and main.boundary.distance(anchor)>3:p=anchor
        x,y,xx,yy=s.bounds
        countries.append(dict(id=i,**e,label=e['name'],era=1871,x=round(p.x,2),y=round(p.y,2),neighbors=sorted(neighbors[i-1]),path=svg_path(s),bounds=[round(v,2) for v in (x,y,xx-x,yy-y)],armyScale=round(min(1,max(.25,math.sqrt(main.area)/18)),2),small=main.area<150,mountainous=mountain_bonus(s,ranges)))
    cards=[dict(id=i,kind=['infantry','cavalry','artillery'][i%3],territory=i+1) for i in range(len(countries))]
    cards += [dict(id=len(countries)+i,kind='wild',territory=0) for i in range(2)]
    land=ops.unary_union(shapes)
    data=dict(id='europe1871',name='Europa um 1871',era=1871,width=800,height=500,maxZoom=18,artwork='historical-1871',description=f'{len(countries)} Spielregionen in Europa nach der Reichsgründung. Historisch angenäherte Staatsgrenzen, vereinfachte innere Gebiete.',countries=countries,continents=[dict(id=i,name=n,bonus=b) for i,(n,b) in enumerate(CONTINENTS,1)],cards=cards,routes=routes,wrapRoute=[],coastPath=svg_path(land.simplify(.15)))
    from build_continents import add_continents
    add_continents(data)
    (ROOT/'web/dlcs/europe-1871/europe1871.json').write_text(json.dumps(data,ensure_ascii=False,separators=(',',':')))
    terrain(data,land)
    print(f'Built Europe: {len(countries)} regions, {len(cards)} cards, {sum(map(len,neighbors))//2} borders, {len(routes)} sea routes.')

def terrain(board,land):
    with gzip.open(ROOT/'tools/data/terrain-source.json.gz','rt') as f:source=json.load(f)
    forest=ops.unary_union([make_valid(G.shape(f['geometry'])).intersection(EXTENT) for f in source['forests']])
    forest=ops.transform(project,forest).intersection(land).simplify(.25,preserve_topology=True)
    mountains=[]
    for f in source['ranges']:
        shape=ops.transform(project,make_valid(G.shape(f['geometry'])).intersection(EXTENT)).intersection(land)
        if shape.is_empty:continue
        x,y,xx,yy=shape.bounds;points=[]
        for col in range(math.ceil((xx-x)/4)):
            for row in range(math.ceil((yy-y)/3.5)):
                p=G.Point(x+col*4+1,y+row*3.5+1)
                if shape.contains(p):points.append([round(p.x,2),round(p.y,2)])
        mountains.append(dict(name=f['properties'].get('NAME_DE') or f['properties']['NAME'],points=points))
    rivers=[]
    for f in source['rivers']:
        shape=ops.transform(project,G.shape(f['geometry']).intersection(EXTENT)).intersection(land).simplify(.12)
        path=''.join('M'+'L'.join(f'{x:.2f},{y:.2f}' for x,y in p.coords) for p in lines(shape) if len(p.coords)>1)
        if path:rivers.append(dict(name=f['properties']['name'],path=path))
    towns=TOWNS+[('Budapest',19.04,47.5),('Bukarest',26.1,44.43),('Belgrad',20.46,44.82),('Sofia',23.32,42.7),('Athen',23.73,37.98),('Helsinki',24.94,60.17),('Sankt Petersburg',30.32,59.94),('Christiania',10.75,59.91),('Straßburg',7.75,48.58),('Königsberg',20.51,54.71),('Reykjavík',-21.94,64.15),('Sarajevo',18.41,43.86)]
    settlements=[dict(name=n,x=round(project(x,y)[0],2),y=round(project(x,y)[1],2)) for n,x,y in towns if EXTENT.contains(G.Point(x,y)) and land.distance(G.Point(project(x,y)))<2]
    assign_settlement_territories(settlements,board)
    data=dict(forestTiles=forest_tiles(forest),mountains=mountains,rivers=rivers,settlements=settlements)
    (ROOT/'web/dlcs/europe-1871/terrain-europe1871.json').write_text(json.dumps(data,ensure_ascii=False,separators=(',',':')))

if __name__=='__main__':
    if len(sys.argv)>1:prepare(sys.argv[1])
    build()
