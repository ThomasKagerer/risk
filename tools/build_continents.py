"""Precompute continent outlines for the SVG map, without runtime GIS work.

Only presentation metadata is added. Country borders, IDs and connections stay
untouched. Called by each map generator; can also refresh the existing assets.
"""
import json
import re
from pathlib import Path
from shapely import geometry as G, ops, make_valid
from shapely.ops import polylabel


def parts(shape):
    if shape.geom_type == 'Polygon':
        yield shape
    elif hasattr(shape, 'geoms'):
        for child in shape.geoms:
            yield from parts(child)


def country_shape(country, classic=False):
    if classic:
        from atlas_geometry import LANDS
        return G.Polygon([tuple(map(float, p.split(','))) for p in LANDS[country['id']][1].split()])
    # Geographic assets contain straight M/L/Z rings; preserve holes via XOR.
    shape = G.GeometryCollection()
    for ring in re.findall(r'M([^Z]+)Z', country['path']):
        numbers = list(map(float, re.findall(r'-?\d+(?:\.\d+)?', ring)))
        polygon = make_valid(G.Polygon(list(zip(numbers[::2], numbers[1::2]))))
        shape = shape.symmetric_difference(polygon)
    return shape


def path(shape):
    rings = []
    for polygon in parts(shape):
        for ring in [polygon.exterior, *polygon.interiors]:
            rings.append('M' + 'L'.join(f'{x:.2f},{y:.2f}' for x, y in list(ring.coords)[:-1]) + 'Z')
    return ''.join(rings)


# Overview callouts keep the dense European troop counters unobscured.
EUROPE_LABELS = {
    1: (397, 113), 2: (171, 198), 3: (450, 213), 4: (638, 415),
    5: (334, 454), 6: (677, 264), 7: (661, 366), 8: (185, 328),
}
MINI_WORLD_LABELS = {
    1: (150, 30), 2: (225, 499), 3: (430, 64),
    4: (440, 480), 5: (620, 45), 6: (640, 480),
}


def add_continents(board):
    classic = board.get('artwork') == 'atlas-02'
    for continent in board['continents']:
        countries = [c for c in board['countries'] if c['continent'] == continent['id']]
        shape = ops.unary_union([country_shape(c, classic) for c in countries])
        # Close subpixel rounding seams between adjoining source polygons only.
        shape = make_valid(shape.buffer(.025, join_style=2).buffer(-.025, join_style=2)).simplify(.08, preserve_topology=True)
        main = max(parts(shape), key=lambda p: p.area)
        center = polylabel(main, tolerance=.25)
        x, y = center.x, center.y
        if board.get('id') == 'europe1871':
            x, y = EUROPE_LABELS[continent['id']]
        elif board.get('id') == 'simple-world':
            x, y = MINI_WORLD_LABELS[continent['id']]
        else:
            # Center labels on the main landmass. Avoiding every troop counter
            # pushed Africa to the coast and Europe into its eastern border.
            if main.contains(main.centroid):
                x, y = main.centroid.x, main.centroid.y
        continent['outline'] = path(shape)
        left, top, right, bottom = shape.bounds
        continent['bounds'] = [round(v,2) for v in (left, top, right-left, bottom-top)]
        continent['labelPosition'] = [round(x, 2), round(y, 2)]
        # A short leader ties labels outside the landmass to the correct region.
        label = G.Point(x, y)
        continent['labelAnchor'] = None if shape.contains(label) else [round(center.x,2), round(center.y,2)]
        if board.get('id') == 'simple-world' and continent['labelAnchor']:
            anchor = ops.nearest_points(shape.boundary, label)[0]
            continent['labelAnchor'] = [round(anchor.x,2), round(anchor.y,2)]
    return board


if __name__ == '__main__':
    root = Path(__file__).resolve().parents[1] / 'web/assets'
    for name in ['board', 'world120', 'europe1871', 'simple-world']:
        target = root.parent / 'dlcs/world-1700/world120.json' if name == 'world120' else root.parent / 'dlcs/mini-world/simple-world.json' if name == 'simple-world' else root / f'{name}.json'
        data = add_continents(json.loads(target.read_text()))
        target.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')))
        print(f"{name}: {len(data['continents'])} continent outlines")
