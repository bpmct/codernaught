# `</>` Codernaught

The Coder mascot robot — a 3D-printable model **and** an embeddable, walking
[Three.js](https://threejs.org) animation built straight from the print geometry.

<p align="center">
  <img src="public/2d/codernaught-walk3d.gif" alt="Codernaught walking" height="260" />
</p>

**[▶ Live viewer](https://bpmct.github.io/codernaught/)** ·
**[Embed &amp; download](https://bpmct.github.io/codernaught/embed.html)**

- 3D-printable model (`Single_Coder_Bot.3mf`) by [@tracyjohnsonux](https://github.com/tracyjohnsonux)
- Web animation, rigging, and embeds generated from that exact `.3mf` — same
  geometry, same filament colors, real joints.

## What's in here

| File | What it is |
|------|------------|
| `codernaught.glb` | **Canonical portable asset** — rigged 3D model + `Walk` animation. Drop into `<model-viewer>`, Spline, Rive (3D), Blender, Unity, or any Three.js / AI-generated site. |
| `Single_Coder_Bot.3mf` | The printable multi-body, multi-color model. |
| `codernaught-embed.js` | A `<codernaught-bot>` Web Component (wraps `<model-viewer>`). |
| `codernaught_meshes.json` | Raw extracted geometry + colors + joint pivots. |
| `skills/threemf-geometry/` | The agent skill + scripts that turn the `.3mf` into all of the above. |

## Embed it anywhere

**Web Component** (plain HTML, React, Vue, Astro, …):
```html
<script type="module" src="https://bpmct.github.io/codernaught/codernaught-embed.js"></script>
<codernaught-bot walk auto-rotate style="width:400px;height:400px"></codernaught-bot>
```

**iframe** (zero setup):
```html
<iframe src="https://bpmct.github.io/codernaught/?embed=1" width="400" height="400"
  frameborder="0" style="border:0;border-radius:12px"></iframe>
```

**GLB directly** (hand this to Claude / Claude Code to add to a site):
```html
<script type="module" src="https://unpkg.com/@google/model-viewer"></script>
<model-viewer src="https://bpmct.github.io/codernaught/codernaught.glb"
  autoplay animation-name="Walk" camera-controls style="width:400px;height:400px"></model-viewer>
```

**Google Slides / Docs / Notion** — download the transparent looping
[`codernaught-walk3d.gif`](public/2d/codernaught-walk3d.gif) and paste it straight in.

## Run locally

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # -> dist/  (also builds embed.html)
```

The interactive viewer has a control panel: **Render** (Flat / Lit), **Shadows**,
**Walk**, **Speed**, and **Light** intensity. `?embed=1` hides the chrome for iframes.

## How it was made (geometry → animation)

Everything is **geometry-driven** from the `.3mf` — no hand-drawn art. The pipeline
(documented as a reusable agent skill in [`skills/threemf-geometry/`](skills/threemf-geometry/SKILL.md)):

1. **Extract** vertices/triangles + filament colors from the 3MF zip.
2. **Detect joints** by fitting circles to the mesh (the arm's ball joint and the
   body's socket have matching radii → confirmed mating pair).
3. **Mate** each arm into its socket; orient so claws face forward and arms hang down.
4. **Split** the legs off the body shell with a clean plane-cut at the hip (interpolated
   edge, head/screen kept whole → no holes or shading glitches).
5. **Rig &amp; animate** — limb pivot groups + a walk cycle (alternating legs,
   counter-swinging arms, body bob), baked into `codernaught.glb`.

Regenerate the assets:
```bash
python3 skills/threemf-geometry/scripts/build_codernaught.py   # -> public/codernaught_meshes.json
python3 skills/threemf-geometry/scripts/build_glb.py           # -> public/codernaught.glb
```

## Credits

- **3D-printable model:** [@tracyjohnsonux](https://github.com/tracyjohnsonux)
- **Web animation / rigging / embeds:** built with an AI coding agent
- **License:** [MIT](LICENSE)

Coder purple is `#7000F4`.
