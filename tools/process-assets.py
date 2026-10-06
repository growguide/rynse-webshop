#!/usr/bin/env python3
"""
Asset pipeline: turns the source images/videos listed in assets-src/manifest.json
into optimized web assets.

  python3 tools/process-assets.py            # download sources (if missing) + process everything
  python3 tools/process-assets.py --local    # only use files already in assets-src/ (no downloads)

Outputs
  src/web/assets/img/<slot>-<w>.webp (+ .avif when supported) and images.json (srcset manifest)
  src/web/assets/img/og.jpg                      social preview (1200x630)
  src/web/assets/hero/<set>/NNN.webp + manifest.json   scroll-scrub frame sequences
  src/web/assets/brand/icon-192.png, icon-512.png, apple-touch-icon.png, logo-512.png

Requirements: Python 3.10+, Pillow (pip install pillow), ffmpeg on PATH.
Swapping an asset = replace the file in assets-src/ (same slot name) or its URL in the manifest, re-run, commit.
"""
import json, os, subprocess, sys, urllib.request, shutil
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, features

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'assets-src'
IMG_OUT = ROOT / 'src/web/assets/img'
HERO_OUT = ROOT / 'src/web/assets/hero'
BRAND = ROOT / 'src/web/assets/brand'
LOCAL_ONLY = '--local' in sys.argv
AVIF = features.check('avif')

manifest = json.loads((SRC / 'manifest.json').read_text())
IMG_OUT.mkdir(parents=True, exist_ok=True)
HERO_OUT.mkdir(parents=True, exist_ok=True)


def fetch(url, dest: Path):
    if dest.exists():
        return dest
    if LOCAL_ONLY:
        print(f'  skip (missing locally): {dest.name}')
        return None
    print(f'  downloading {dest.name}')
    with urllib.request.urlopen(url, timeout=120) as r, open(dest, 'wb') as f:
        shutil.copyfileobj(r, f)
    return dest


def ratio(aspect):
    a, b = aspect.split(':')
    return int(a) / int(b)


def cover_crop(im: Image.Image, target_ratio: float, focus='center'):
    w, h = im.size
    cur = w / h
    if abs(cur - target_ratio) < 0.01:
        return im
    if cur > target_ratio:  # too wide
        nw = int(h * target_ratio)
        x = {'left': 0, 'right': w - nw}.get(focus, (w - nw) // 2)
        return im.crop((x, 0, x + nw, h))
    nh = int(w / target_ratio)
    y = {'top': 0, 'bottom': h - nh}.get(focus, (h - nh) // 2)
    return im.crop((0, y, w, y + nh))


images_json = {}
print('Images')
for slot, spec in manifest['images'].items():
    ext = os.path.splitext(spec['url'].split('?')[0])[1] or '.png'
    src = fetch(spec['url'], SRC / f'{slot}{ext}')
    if not src:
        continue
    im = Image.open(src)
    keep_alpha = spec.get('keepAlpha') and im.mode in ('RGBA', 'LA')
    im = im.convert('RGBA' if keep_alpha else 'RGB')
    im = cover_crop(im, ratio(spec['aspect']), spec.get('crop', 'center'))
    entries = []
    for w in spec['widths']:
        if w > im.width:
            continue
        h = round(im.height * w / im.width)
        r = im.resize((w, h), Image.LANCZOS)
        webp = IMG_OUT / f'{slot}-{w}.webp'
        r.save(webp, 'WEBP', quality=82, method=6)
        entry = {'w': w, 'h': h, 'webp': f'/assets/img/{webp.name}'}
        if AVIF and not keep_alpha:
            avif = IMG_OUT / f'{slot}-{w}.avif'
            r.save(avif, 'AVIF', quality=60, speed=4)
            entry['avif'] = f'/assets/img/{avif.name}'
        entries.append(entry)
    if not entries:
        w, h = im.size
        webp = IMG_OUT / f'{slot}-{w}.webp'
        im.save(webp, 'WEBP', quality=82, method=6)
        entries.append({'w': w, 'h': h, 'webp': f'/assets/img/{webp.name}'})
    largest = entries[-1]
    images_json[slot] = {
        'src': largest['webp'],
        'srcset': ', '.join(f"{e['webp']} {e['w']}w" for e in entries),
        'srcsetAvif': ', '.join(f"{e['avif']} {e['w']}w" for e in entries if 'avif' in e) or None,
        'width': largest['w'], 'height': largest['h'], 'alt': spec.get('alt', ''),
    }
    print(f'  {slot}: {[e["w"] for e in entries]} {"(+avif)" if AVIF and not keep_alpha else ""}')

# Social preview (1200x630) from the hero poster
if 'hero-poster' in images_json:
    src = SRC / 'hero-poster.png'
    if src.exists():
        im = cover_crop(Image.open(src).convert('RGB'), 1200 / 630).resize((1200, 630), Image.LANCZOS)
        im.save(IMG_OUT / 'og.jpg', 'JPEG', quality=84, optimize=True, progressive=True)
        images_json['og'] = {'src': '/assets/img/og.jpg', 'width': 1200, 'height': 630}
        # Also a JPEG copy of the hero for structured data / non-webp consumers
        Image.open(src).convert('RGB').resize((1600, 900), Image.LANCZOS).save(IMG_OUT / 'product-hero.jpg', 'JPEG', quality=84, optimize=True, progressive=True)
        print('  og.jpg, product-hero.jpg')

(IMG_OUT / 'images.json').write_text(json.dumps(images_json, indent=2))

# Brand icons from the vector wordmark: a navy tile with the gold "R" (rendered via the original logo PNG for fidelity)
print('Icons')
logo_png = BRAND / 'rynse-logo-original.png'
if logo_png.exists():
    logo = Image.open(logo_png).convert('RGBA')
    # crop the "R" (first glyph) from the original bitmap
    bbox = logo.getbbox()
    glyph = logo.crop((88, 90, 300, 330))
    for size, name in [(512, 'icon-512.png'), (192, 'icon-192.png'), (180, 'apple-touch-icon.png')]:
        tile = Image.new('RGBA', (size, size), (10, 20, 40, 255))
        g = glyph.copy(); g.thumbnail((int(size * 0.56), int(size * 0.56)), Image.LANCZOS)
        tile.alpha_composite(g, ((size - g.width) // 2, (size - g.height) // 2))
        tile.convert('RGB').save(BRAND / name, 'PNG', optimize=True)
    full = Image.new('RGBA', (512, 512), (10, 20, 40, 255))
    l = logo.copy(); l.thumbnail((440, 440), Image.LANCZOS)
    full.alpha_composite(l, ((512 - l.width) // 2, (512 - l.height) // 2))
    full.convert('RGB').save(BRAND / 'logo-512.png', 'PNG', optimize=True)
    print('  icon-192/512, apple-touch-icon, logo-512')

# Hero frame sequences
print('Hero frames')
hero_manifest = {}
for key, spec in manifest.get('videos', {}).items():
    src = fetch(spec['url'], SRC / f'{key}.mp4')
    if not src:
        continue
    out_dir = HERO_OUT / spec['out']
    if out_dir.exists():
        shutil.rmtree(out_dir)
    out_dir.mkdir(parents=True)
    probe = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-count_frames', '-show_entries', 'stream=nb_read_frames,width,height', '-of', 'json', str(src)], capture_output=True, text=True, check=True)
    st = json.loads(probe.stdout)['streams'][0]
    total = int(st['nb_read_frames']); vw, vh = int(st['width']), int(st['height'])
    n = min(spec['frames'], total)
    w = spec['width']; h = round(vh * w / vw / 2) * 2
    # select n evenly spaced frames, scale, encode webp
    sel = '+'.join(f'eq(n\\,{round(i * (total - 1) / (n - 1))})' for i in range(n))
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(src), '-vf', f"select='{sel}',scale={w}:{h}:flags=lanczos", '-vsync', 'vfr', '-c:v', 'libwebp', '-quality', str(spec['quality']), '-compression_level', '6', '-preset', 'photo', str(out_dir / '%03d.webp')], check=True)
    count = len(list(out_dir.glob('*.webp')))
    size = sum(f.stat().st_size for f in out_dir.glob('*.webp'))
    set_key = 'desktop' if spec['out'] == 'd' else 'mobile'
    hero_manifest[set_key] = {'path': f'/assets/hero/{spec["out"]}/', 'count': count, 'width': w, 'height': h, 'ext': 'webp'}
    print(f'  {key}: {count} frames {w}x{h}, {size / 1e6:.1f} MB')
if hero_manifest:
    hero_manifest['generated'] = manifest.get('generated')
    (HERO_OUT / 'manifest.json').write_text(json.dumps(hero_manifest, indent=2))

# Short clips played once in the page (hero drop-in). H.264 MP4 (universal) + WebM/VP9 (smaller), no audio.
VIDEO_OUT = ROOT / 'src/web/assets/video'
clips = manifest.get('clips', {})
if clips:
    VIDEO_OUT.mkdir(parents=True, exist_ok=True)
    print('Clips')
for key, spec in clips.items():
    src = fetch(spec['url'], SRC / f'{key}-clip.mp4')
    if not src:
        continue
    w = spec.get('width', 1080)
    vf = f"scale='min({w},iw)':-2:flags=lanczos"
    mp4 = VIDEO_OUT / f'{key}.mp4'; webm = VIDEO_OUT / f'{key}.webm'
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(src), '-an', '-vf', vf, '-c:v', 'libx264', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-crf', str(spec.get('crf', 22)), '-preset', 'slow', '-movflags', '+faststart', str(mp4)], check=True)
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(src), '-an', '-vf', vf, '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', str(spec.get('crf_webm', 34)), '-row-mt', '1', '-deadline', 'good', '-cpu-used', '2', str(webm)], check=True)
    # Last frame as a JPEG/WebP poster so the page can hold the exact final image.
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-sseof', '-0.05', '-i', str(mp4), '-frames:v', '1', '-update', '1', str(VIDEO_OUT / f'{key}-last.webp')], check=True)
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(mp4), '-frames:v', '1', '-update', '1', '-vf', 'scale=720:-2', '-quality', '70', str(VIDEO_OUT / f'{key}-first.webp')], check=True)
    print(f'  {key}: mp4 {mp4.stat().st_size / 1e6:.1f} MB, webm {webm.stat().st_size / 1e6:.1f} MB')
print('Done.')
