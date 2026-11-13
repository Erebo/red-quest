import os
from PIL import Image

sc_dir = 'docs/screenshots'
files = [
    '01-briefing.png',
    '02-analyze-routes.png',
    '03-candidate-table.png',
    '04-terrain-lens.png',
    '05-minerals-lens.png',
    '06-heat-lens.png',
    '07-sun-power-lens.png',
    '08-radiation-lens.png',
    '09-survey-kit.png',
    '10-choose-lockin.png',
    '11-explore-hud.png',
    '12-debrief-score.png',
    '13-research-overview.png',
    '14-research-layers.png',
    '15-research-inspector.png'
]

print('Optimizing screenshots...')
for f in files:
    fpath = os.path.join(sc_dir, f)
    if not os.path.exists(fpath):
        print(f'Warning: {f} not found.')
        continue

    orig_sz = os.path.getsize(fpath) / 1024
    if orig_sz <= 390.0:
        print(f'{f}: already under limit ({orig_sz:.1f} KB)')
        continue

    img = Image.open(fpath).convert('RGB')
    
    # Try full resolution with MAXCOVERAGE (keeps colors rich and gradients smooth)
    saved = False
    for colors in [256, 224, 192, 160]:
        q = img.quantize(colors=colors, method=Image.Quantize.MAXCOVERAGE, dither=Image.Dither.FLOYDSTEINBERG)
        tmp = os.path.join(sc_dir, 'tmp_' + f)
        q.save(tmp, optimize=True)
        sz = os.path.getsize(tmp) / 1024
        if sz <= 390.0:
            os.replace(tmp, fpath)
            print(f'{f}: {orig_sz:.1f} KB -> {sz:.1f} KB (colors={colors}, 1440x900)')
            saved = True
            break
        else:
            if os.path.exists(tmp): os.remove(tmp)

    if not saved:
        # Fallback to FASTOCTREE or slight scale 0.9 if needed
        for scale in [0.95, 0.9, 0.85]:
            nw = int(img.width * scale)
            nh = int(img.height * scale)
            r = img.resize((nw, nh), Image.Resampling.LANCZOS)
            q = r.quantize(colors=256, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.FLOYDSTEINBERG)
            tmp = os.path.join(sc_dir, 'tmp_' + f)
            q.save(tmp, optimize=True)
            sz = os.path.getsize(tmp) / 1024
            if sz <= 390.0:
                os.replace(tmp, fpath)
                print(f'{f}: {orig_sz:.1f} KB -> {sz:.1f} KB (scale={scale}, {nw}x{nh})')
                saved = True
                break
            else:
                if os.path.exists(tmp): os.remove(tmp)

print('Optimization complete.')
