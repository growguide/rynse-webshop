# Higgsfield — hero production

> **Status (2026-10-06):** the homepage hero now uses the static packshot stage (box + sachets, gold glow, pointer parallax) instead of the scroll-driven frame sequence — the sequence felt heavy in review. The frames are still in `src/web/assets/hero/` and the player in `docs/archive/hero-sequence.js`; to bring it back, restore that file to `src/web/scripts/hero.js`, add `'hero'` back to the asset copy list in `src/web/build.js`, and reinstate the `<canvas>` markup from git history (commit before "Redesign hero + lifestyle").

The hero is a scroll-driven cinematic sequence rendered from a Higgsfield video.
The site streams a WebP frame sequence into a `<canvas>` (poster first, then
coarse keyframes, then the rest), so the page is interactive immediately and the
animation sharpens as frames arrive. Reduced-motion, save-data and low-end devices
get the poster plus a calm vector composition instead.

## What was produced (6 Oct 2026)

| Asset | Model | Notes |
|---|---|---|
| Hero keyframe 16:9 (`hero-poster`) | GPT Image 2.5, 2k | single sachet, navy studio, gold rim light |
| Hero keyframe 9:16 (`hero-poster-mobile`) | GPT Image 2.5, 2k | same, portrait composition |
| Sachet cloud 16:9 (`hero-many`) | GPT Image 2.5, 2k | reference for the mid-animation |
| Packshot 4:5 (`packshot`) | GPT Image 2.5, 2k | box of 40 + loose sachets |
| Sachet cutouts (`sachet-front`, `sachet-angle`) | GPT Image 2.5, transparent | for compositions / ads |
| Lifestyle 4:5 ×6 (`life-1…6`) | GPT Image 2.5, 2k | Amsterdam: canal bridge, Centraal, NDSM festival, cyclist, Jordaan, flat lay |
| Hero video desktop (`hero-desktop`) | Kling 3.0 pro, 8 s, 16:9, 1912×1080 | start = end = hero keyframe |
| Hero video mobile (`hero-mobile`) | Kling 3.0 pro, 8 s, 9:16, 1080×1912 | start = end = mobile keyframe |

Reference inputs: a Montserrat-ExtraBold rendering of the wordmark and a flat
sachet mock were uploaded as style references so every render carries the same
gold wordmark; the website itself uses the real vector logo (`assets/brand`).

All source URLs live in `assets-src/manifest.json`. `tools/process-assets.py`
(run locally or by the "Process brand assets" GitHub Action) converts them into
`src/web/assets/img/*` (WebP + AVIF, responsive sizes), `src/web/assets/hero/{d,m}/NNN.webp`
and `src/web/assets/hero/manifest.json`.

## Replacing the hero asset (no code changes)

1. Generate a new clip (prompt below) or export one from Higgsfield.
2. Put the file at `assets-src/hero-desktop.mp4` (and/or `assets-src/hero-mobile.mp4`), or change the URL in `assets-src/manifest.json`.
3. Run `python3 tools/process-assets.py` (needs Pillow + ffmpeg) or push the manifest change and let the Action commit the frames.
4. Deploy. The hero reads `assets/hero/manifest.json` at runtime; frame count, size and path are all data.

Frame budget: desktop 96 frames @ 1440 px (~5 MB, streamed progressively, desktop only),
mobile 64 frames @ 720 px (~2 MB). Lower `frames`/`width`/`quality` in the manifest to trade quality for weight.

## Production prompt — hero (desktop 16:9)

Keyframe (image model):

> Luxury commercial product photograph, hero shot. One single-use cleansing wipe sachet floating in the center of a very dark navy blue studio void. The sachet is a compact flat rectangular foil packet with crimped serrated edges, slightly wider than tall (about 7 × 6 cm proportions), matte deep navy blue laminate with a subtle soft-touch sheen and gentle creases of real foil packaging. On the front: a bold metallic gold wordmark reading exactly "RYNSE" in heavy geometric sans-serif capitals, centered, with the small gold line "CLEANSING WIPE" underneath, matching the attached reference design. Metallic gold foil lettering catches warm light. Lighting: controlled studio lighting, a warm golden rim light from the top-right edge, a soft cool fill from the left, a faint gold reflection on the glossy dark floor beneath, soft realistic shadow. Cinematic depth, shallow depth of field, premium fragrance-advertising aesthetic, 85 mm lens, ultra-detailed macro texture, photorealistic. Background pure deep navy (#0A1428) with a very subtle warm vignette, no props, no hands, no people, no text other than the packaging.

Video (image-to-video, start frame = end frame = keyframe, 8 s, no audio):

> Premium luxury commercial for a personal-care brand, continuous single shot, locked camera with a very slow subtle push-in. The hero navy foil sachet with the metallic gold RYNSE wordmark hangs perfectly still in the center of a dark navy studio void, floating above a glossy dark floor with a warm gold reflection. After a beat, a dozen identical navy sachets glide in gracefully from the far edges and from deep in the background, drifting through the space on different depth layers, slowly rotating, some passing close to the camera softly out of focus, some sweeping behind the hero sachet, catching warm golden rim light and metallic reflections as they turn, with subtle elegant motion blur. The movement is slow, weightless, controlled and choreographed like a high-end fragrance commercial. In the final second all floating sachets drift out of frame or settle behind the hero, and the hero sachet returns to the exact original centered, sharp and dominant position. Dark navy background stays clean, no dust, no sparkles, no confetti, no text, no hands, no people, no camera shake.

Mobile 9:16: identical, with "upper-center of the frame leaving empty dark space at the bottom third" for the keyframe and "glide in from above, below and from deep in the background" for the video.

Scroll mapping: frame 0 = page top (hero sachet alone) → frames 20–70 = sachets in motion →
last frame = hero sachet alone again, which is exactly when the purchase panel slides over the hero.

## Lifestyle prompt pattern (4:5)

> Editorial lifestyle photograph, moody and premium, unmistakably Amsterdam: [scene — canal bridge after a run / Amsterdam Centraal platform at dusk / NDSM-wharf night festival / cycling home along a canal / cobbled Jordaan street before a date / pocket flat lay with canal lights]. [Subject] holds a small navy foil sachet with a metallic gold "RYNSE" wordmark, matching the attached reference design. Cinematic lighting with warm golden highlights and deep navy shadows, shallow depth of field, 50 mm lens, film-like grain, fashion-campaign aesthetic, no other visible brand logos, no extra text.

Keep: navy + gold palette, one sachet in frame, no competing logos, elegant not sexual, unisex casting across the set.

## Consistent lettering on multi-sachet images

Generators drift on repeated text. Fix after the fact with an image edit (GPT Image 2.5, two `image_references`: the shot + the clean `sachet-front` render) and this prompt:

> Edit the first image. Keep the composition, camera, lighting and every sachet position exactly as they are. Change ONLY the printed artwork: every sachet must carry the identical print shown on the second image — the bold metallic gold wordmark reading exactly "RYNSE" in heavy geometric sans-serif capitals, centered, with the small gold line "CLEANSING WIPE" directly underneath, same font, same proportions and gold tone on every sachet. No other text, no misspellings, no variations between sachets.

Used on 2026-10-06 for `packshot` and `hero-many`. Review candidates with the "Fetch images for review" workflow (`asset-review` branch) when the CDN is not reachable from the build session.

## Light design (2026-10-08)

The site moved to an off-white base. New slot `packshot-light` (box + sachets on white marble, soft daylight) made with GPT Image 2.5 from the navy packshot as reference: "Recreate this exact packshot on a bright, clean set: white Carrara marble surface, warm off-white backdrop (#F6F4EF), soft diffused daylight from the left, a folded white towel far in the background out of focus; keep the navy packaging and gold lettering exactly as in the reference." The navy hero clip stays as the one dark, high-contrast element in the hero.

## Reference-design rebuild (2026-10-08)

Home: `hero-light` (16:9) / `hero-light-portrait` (4:5) sachets on marble with towels; clip `hero-light` (FLUX 3 Video, start = end = the still, slow push-in, plays once and holds); `banner-pocket` (hand slipping a sachet into a jeans pocket, light grey backdrop); `moment-sport|travel|work|date` (object stills, 1:1); `routine-sink` (box + sachet by a brass tap). Product page gallery: `packshot-light`, `hero-light-portrait`, `hand-sachet`, `wipe-macro`. All GPT Image 2.5 with the clean sachet render as lettering reference; sachet/box text re-edited where a render dropped the sub-line.
