# Generates build/icon.png and public/icon.png (512x512). Needs:  pip install pillow
from PIL import Image, ImageDraw

S = 512
img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
d = ImageDraw.Draw(img)
d.rounded_rectangle((16, 16, S - 16, S - 16), radius=110, fill=(245, 158, 11, 255))
d.rounded_rectangle((120, 110, 392, 402), radius=28, fill=(255, 251, 235, 255))
for i, y in enumerate((190, 250, 310)):
    d.rounded_rectangle((160, y, 352 if i < 2 else 290, y + 22), radius=11, fill=(180, 83, 9, 255))
d.rounded_rectangle((160, 140, 300, 162), radius=11, fill=(120, 53, 15, 255))
img.save('build/icon.png')
img.save('public/icon.png')
print('icons written')
