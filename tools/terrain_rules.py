"""Compile terrain rules once; the server only reads a boolean per country.

Historical regions receive the bonus when at least 25% of their schematic land
area intersects the existing Natural Earth mountain-range layer. This is a game
classification of that map, not a precision elevation or political dataset.
The distorted classic board uses a curated equivalent for its broad regions.
"""
import gzip
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CLASSIC_MOUNTAINS = {1, 3, 4, 5, 11, 13, 15, 20, 29, 30, 37, 38, 40}


def classic_terrain(data):
    for country in data['countries']:
        country['mountainous'] = country['id'] in CLASSIC_MOUNTAINS


def mountain_ranges(project):
    from shapely import geometry, ops, make_valid
    with gzip.open(ROOT / 'tools/data/terrain-source.json.gz', 'rt') as f:
        source = json.load(f)
    return ops.transform(project, ops.unary_union([
        make_valid(geometry.shape(f['geometry'])) for f in source['ranges']
    ]))


def mountain_bonus(shape, ranges):
    return shape.intersection(ranges).area / shape.area >= .25


if __name__ == '__main__':
    import re
    from shapely import geometry, make_valid
    from build_world120 import project
    ranges = mountain_ranges(project)
    for filename in ['board.json', 'world120.json']:
        path = ROOT / 'web/assets' / filename
        data = json.loads(path.read_text())
        if filename == 'board.json':
            classic_terrain(data)
        else:
            for country in data['countries']:
                shape = geometry.GeometryCollection()
                for ring in re.findall(r'M([^Z]+)Z', country['path']):
                    points = [list(map(float, point.split(','))) for point in ring.split('L')]
                    shape = shape.symmetric_difference(make_valid(geometry.Polygon(points)))
                country['mountainous'] = mountain_bonus(shape, ranges)
        path.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')))
        print(filename, sum(c['mountainous'] for c in data['countries']), 'mountainous regions')
