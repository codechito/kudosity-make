# Builds assets/icon.png for Make from assets/logo-source.png. Make draws app icons in two
# colours (transparent/white -> theme colour, black -> white), so the Kudosity bubble and
# smile are made black on transparent. Needs Pillow:
#   python3 scripts/make-icon.py assets/logo-source.png assets/icon.png /tmp/icon-preview.png

import sys
from PIL import Image
src, out, preview = sys.argv[1], sys.argv[2], sys.argv[3]
im = Image.open(src).convert('RGBA')
w, h = im.size
mono = Image.new('RGBA', (w, h), (0, 0, 0, 0))
px, mp = im.load(), mono.load()
for y in range(h):
    for x in range(w):
        r, g, b, a = px[x, y]
        white = r > 200 and g > 200 and b > 200            # speech bubble
        pink = r > 200 and 140 < g < 215 and 140 < b < 215  # smile
        if white or pink:
            mp[x, y] = (0, 0, 0, 255)
bbox = mono.getbbox()
pad = int(max(bbox[2] - bbox[0], bbox[3] - bbox[1]) * 0.12)
side = max(bbox[2] - bbox[0], bbox[3] - bbox[1]) + 2 * pad
cx, cy = (bbox[0] + bbox[2]) // 2, (bbox[1] + bbox[3]) // 2
crop = mono.crop((cx - side // 2, cy - side // 2, cx + side // 2, cy + side // 2)).resize((512, 512), Image.LANCZOS)
crop.save(out)
# Preview as Make renders it: transparent -> theme colour, black -> white.
theme = (0x4C, 0x23, 0xCC, 255)
bg = Image.new('RGBA', (512, 512), theme)
white = Image.new('RGBA', (512, 512), (255, 255, 255, 255))
bg.paste(white, (0, 0), crop.split()[3])
bg.save(preview)
print('icon written', crop.size, 'mark bbox', bbox)
