"""Rebuild the offline font with fonttools 4.68.0 + brotli.

python scripts/subset-flag-font.py path/to/NotoColorEmoji.ttf
Pinned source: https://fonts.gstatic.com/s/notocoloremoji/v50/Yq6P-KqIXTD0t4D9z1ESnKM3-HpFab4.ttf
License: public/licenses/Noto-Emoji-OFL.txt. No network is used at runtime.
"""
import json
import sys
from pathlib import Path
from fontTools import subset
from fontTools.ttLib import TTFont

root = Path(__file__).resolve().parent.parent
font = TTFont(sys.argv[1])
# Chromium uses COLRv1; OpenType-SVG duplicates must not inflate the subset.
if "SVG " in font:
    del font["SVG "]
flags = [item["e"] for item in json.loads((root / "src/data/emoji.json").read_text("utf-8"))["items"] if item["g"] == "Flags"]
options = subset.Options()
options.layout_features = ["*"]
options.name_IDs = ["*"]
options.name_legacy = True
options.name_languages = ["*"]
subsetter = subset.Subsetter(options)
subsetter.populate(unicodes={ord(c) for emoji in flags for c in emoji})
subsetter.subset(font)
for record in font["name"].names:
    if record.nameID in (1, 3, 4, 6, 16):
        name = "MarkdownDeskFlags-Regular" if record.nameID in (3, 6) else "Markdown Desk Flags"
        record.string = name.encode(record.getEncoding())
font.flavor = "woff2"
font.save(root / "src/assets/fonts/markdown-desk-flags.woff2")
