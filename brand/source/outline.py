# Spline Sans Mono as outlines, for the files that can't load a font: the lockups' word and the social card's lines.
# Each glyph of printable ASCII, instanced at each weight the files use, as its path in font units (y up), its advance
# and its ink box, with the font's units per em and cap height. Run it again only if the face or a weight changes:
#   pip install fonttools brotli
#   python3 brand/source/outline.py node_modules/@fontsource-variable/spline-sans-mono/files/spline-sans-mono-latin-wght-normal.woff2 brand/source/outlines.json
import json
import sys

from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

src, out = sys.argv[1], sys.argv[2]
WEIGHTS = [400, 540]
data = {"face": "Spline Sans Mono", "weights": {}}
for w in WEIGHTS:
    font = instantiateVariableFont(TTFont(src), {"wght": w})
    glyphs = font.getGlyphSet()
    cmap = font.getBestCmap()
    hmtx = font["hmtx"]
    data["unitsPerEm"] = font["head"].unitsPerEm
    data["capHeight"] = font["OS/2"].sCapHeight
    data["xHeight"] = font["OS/2"].sxHeight
    table = {}
    for code in range(32, 127):
        ch = chr(code)
        name = cmap.get(code)
        if not name:
            continue
        pen = SVGPathPen(glyphs, ntos=lambda v: f"{round(v, 2):g}")
        glyphs[name].draw(pen)
        bounds = BoundsPen(glyphs)
        glyphs[name].draw(bounds)
        table[ch] = {"d": pen.getCommands(), "advance": hmtx[name][0], "box": [round(v, 2) for v in bounds.bounds] if bounds.bounds else None}
    data["weights"][str(w)] = table
# The cap height as drawn at the wordmark's weight: the L's ink top.
data["capInk"] = data["weights"]["540"]["L"]["box"][3]
with open(out, "w") as f:
    json.dump(data, f, separators=(",", ":"))
print({k: v for k, v in data.items() if k != "weights"}, {w: len(t) for w, t in data["weights"].items()})
