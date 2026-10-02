"""Compile small, static physical layers; no GIS or map service at runtime.

Inputs: Natural Earth 5.1.2 ranges / 50m rivers; RESOLVE Ecoregions 2017 forest
biomes (CC BY 4.0). Forest biomes are natural distribution zones, not a claim
about precise tree cover in 1700 or today. Settlements are cartographic symbols
at real locations of places already inhabited by ca. 1700, not building footprints.
"""
import gzip,json,sys,re
from pathlib import Path
from shapely import geometry as G,ops,make_valid
from shapely.prepared import prep
from build_world120 import ROOT,project,svg_path,polygons

TOWNS=[
 ('London',-.13,51.51),('Edinburgh',-3.19,55.95),('Dublin',-6.26,53.35),
 ('Paris',2.35,48.86),('Madrid',-3.7,40.42),('Lissabon',-9.14,38.72),
 ('Amsterdam',4.9,52.37),('Hamburg',9.99,53.55),('Köln',6.96,50.94),
 ('München',11.58,48.14),('Berlin',13.41,52.52),('Wien',16.37,48.21),('Prag',14.42,50.09),
 ('Bern',7.45,46.95),('Zürich',8.54,47.38),('Genf',6.14,46.2),
 ('Rom',12.5,41.9),('Venedig',12.32,45.44),('Neapel',14.27,40.85),
 ('Warschau',21.01,52.23),('Krakau',19.94,50.06),('Kiew',30.52,50.45),
 ('Moskau',37.62,55.75),('Nowgorod',31.28,58.52),('Kasan',49.12,55.79),
 ('Stockholm',18.06,59.33),('Kopenhagen',12.57,55.68),('Konstantinopel',28.98,41.01),
 ('Kairo',31.24,30.04),('Alexandria',29.92,31.2),('Fès',-5,34.03),
 ('Algier',3.06,36.75),('Tunis',10.18,36.81),('Timbuktu',-3,16.77),
 ('Kano',8.52,12),('Gondar',37.47,12.61),('Mogadischu',45.34,2.05),
 ('Sansibar',39.19,-6.16),('Mbanza Kongo',14.25,-6.27),('Sofala',34.73,-20.16),
 ('Kapstadt',18.42,-33.93),('Bagdad',44.37,33.32),('Damaskus',36.29,33.51),
 ('Jerusalem',35.21,31.77),('Mekka',39.83,21.42),('Sanaa',44.21,15.35),
 ('Maskat',58.59,23.61),('Isfahan',51.68,32.65),('Buchara',64.42,39.77),
 ('Samarkand',66.96,39.65),('Delhi',77.21,28.61),('Lahore',74.34,31.55),
 ('Agra',78.01,27.18),('Surat',72.83,21.17),('Dhaka',90.41,23.81),
 ('Madras',80.27,13.08),('Colombo',79.86,6.93),('Lhasa',91.13,29.65),
 ('Peking',116.41,39.9),('Nanjing',118.8,32.06),('Kanton',113.26,23.13),
 ('Hangzhou',120.16,30.27),('Xi’an',108.94,34.34),('Seoul',126.98,37.57),
 ('Kyoto',135.77,35.01),('Edo',139.69,35.69),('Ava',95.98,21.86),
 ('Ayutthaya',100.58,14.35),('Hanoi',105.85,21.03),('Huế',107.59,16.46),
 ('Malakka',102.25,2.19),('Singapura',103.82,1.35),('Aceh',95.32,5.55),
 ('Batavia',106.85,-6.21),('Banten',106.15,-6.12),('Manila',120.98,14.6),
 ('Mexiko',-99.13,19.43),('Acoma',-107.58,34.9),('Taos',-105.57,36.44),
 ('Havanna',-82.37,23.11),('Santo Domingo',-69.9,18.49),('Panama',-79.5,8.98),
 ('Quebec',-71.21,46.81),('Montreal',-73.57,45.5),('Boston',-71.06,42.36),
 ('New York',-74.01,40.71),('Biloxi',-88.89,30.4),('Cartagena',-75.48,10.39),
 ('Bogotá',-74.07,4.71),('Quito',-78.47,-.18),('Lima',-77.04,-12.05),
 ('Cuzco',-71.97,-13.53),('Potosí',-65.75,-19.57),('Salvador',-38.5,-12.97),
 ('Recife',-34.88,-8.05),('Asunción',-57.58,-25.26),('Buenos Aires',-58.38,-34.6),
 ('Santiago',-70.67,-33.45),('Nukuʻalofa',-175.2,-21.14),
]

def assign_settlement_territories(settlements, board):
    """Match the actual game regions, including coast simplification and Singapura."""
    regions=[]
    for country in board['countries']:
        shape=G.GeometryCollection()
        for ring in re.findall(r'M([^Z]+)Z',country['path']):
            points=[tuple(map(float,p.split(','))) for p in ring.split('L')]
            shape=shape.symmetric_difference(make_valid(G.Polygon(points)))
        regions.append((country,shape))
    for town in settlements:
        point=G.Point(town['x'],town['y'])
        if town['name']=='Singapura':
            country=next(c for c,_ in regions if c['name']=='Singapura')
        else:
            # Offshore/coastal points use the nearest drawn shoreline, not the
            # nearest country label, which can lie far away on a large region.
            country=min(regions,key=lambda entry:entry[1].distance(point))[0]
        town['territory']=country['id']

def forest_tiles(forest):
    tiles={}
    for y in range(0,500,40):
        for x in range(0,800,40):
            shape=forest.intersection(G.box(x,y,x+40,y+40))
            if shape.is_empty:continue
            path=svg_path(shape)
            if path:tiles[(x,y)]=dict(x=x,y=y,width=40,height=40,path=path,trees=[])
    # Compile the previous repeating tree lattice into ordinary geometry.
    # SVG patterns clipped by intricate biome paths are expensive while zooming.
    prepared=prep(forest)
    for row in range(132):
        for col in range(191):
            for dx,dy,scale in [(1,1,1),(3.08,2.66,.8)]:
                x,y=round(col*4.2+dx,2),round(row*3.8+dy,2)
                tile=tiles.get((int(x//40)*40,int(y//40)*40))
                if tile and prepared.contains(G.Point(x,y)):
                    tile['trees'].append([x,y,scale])
    return list(tiles.values())

def prepare():
    def read(path,keep,props):
        out=[]
        for f in json.loads(Path(path).read_text())['features']:
            if keep(f['properties']):out.append({'geometry':f['geometry'],'properties':{k:f['properties'].get(k) for k in props}})
        return out
    source={
      'ranges':read('/tmp/domination-georegions.geojson',lambda p:p['FEATURECLA']=='Range/mtn',['NAME','NAME_DE','SCALERANK']),
      'rivers':read('/tmp/domination-rivers.geojson',lambda p:p['featurecla']=='River',['name','scalerank']),
      'forests':read('/tmp/domination-forests.geojson',lambda p:True,['ECO_NAME','BIOME_NUM']),
    }
    with gzip.GzipFile(filename=str(ROOT/'tools/data/terrain-source.json.gz'),mode='wb',mtime=0) as out:
        out.write(json.dumps(source,separators=(',',':')).encode())

def lines(shape):
    if shape.geom_type=='LineString':return [shape]
    return [p for g in getattr(shape,'geoms',[]) for p in lines(g)]

def build():
    with gzip.open(ROOT/'tools/data/terrain-source.json.gz','rt') as f:source=json.load(f)
    coast=json.loads((ROOT/'tools/data/coastline.json').read_text())
    land=ops.transform(project,G.shape(coast['coast']))
    forest=ops.unary_union([make_valid(G.shape(f['geometry'])) for f in source['forests']])
    forest=ops.transform(project,forest).intersection(land).simplify(.32,preserve_topology=True)
    # Small polygons are invisible at map scale but retain the principal forest
    # zones. Tree glyphs will be clipped to these measured biome polygons.
    forest=ops.unary_union([p for p in polygons(forest) if p.area>.18])
    mountains=[]
    for f in source['ranges']:
        shape=ops.transform(project,make_valid(G.shape(f['geometry']))).intersection(land)
        if shape.is_empty:continue
        points=[]
        a,b,c,d=shape.bounds
        # Sample only inside the actual range polygon, never scatter decorations
        # over unrelated countries. Deduplicate overlapping named ranges below.
        x=a+1
        while x<c:
            y=b+1
            while y<d:
                if shape.contains(G.Point(x,y)):points.append([round(x,2),round(y,2)])
                y+=3.5
            x+=4
        if not points:
            p=shape.representative_point();points=[[round(p.x,2),round(p.y,2)]]
        mountains.append(dict(name=f['properties'].get('NAME_DE') or f['properties']['NAME'],points=points))
    rivers=[]
    for f in source['rivers']:
        if f['properties']['name'] in ['Suez Canal','Panama Canal']:continue
        shape=ops.transform(project,G.shape(f['geometry'])).intersection(land).simplify(.12)
        path=''.join('M'+'L'.join(f'{x:.2f},{y:.2f}' for x,y in p.coords) for p in lines(shape) if len(p.coords)>1)
        if path:rivers.append(dict(name=f['properties']['name'],path=path))
    settlements=[dict(name=n,x=round(project(x,y)[0],2),y=round(project(x,y)[1],2)) for n,x,y in TOWNS]
    assign_settlement_territories(settlements,json.loads((ROOT/'web/assets/world120.json').read_text()))
    data=dict(forestTiles=forest_tiles(forest),mountains=mountains,rivers=rivers,settlements=settlements)
    (ROOT/'web/assets/terrain.json').write_text(json.dumps(data,ensure_ascii=False,separators=(',',':')))
    print(len(rivers),'rivers;',len(mountains),'mountain ranges;',sum(len(m['points']) for m in mountains),'mountain glyphs;',len(settlements),'settlements')

if __name__=='__main__':
    if '--prepare' in sys.argv:prepare()
    build()
