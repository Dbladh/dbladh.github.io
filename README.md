# Danny Bladh: portfolio

A 3D low-poly landscape portfolio, published with GitHub Pages at https://dbladh.github.io.
Content is organized by *attributes* (creativity, AI, engineering), with experiences as evidence.

## Run it locally

```bash
python3 -m http.server 8765
# open http://localhost:8765
```

## Where things live

| File | What it does |
|---|---|
| `index.html` | **All the content.** Edit the text in each `<section class="stop">`. The billboard teasers are read from `data-title` / `data-teaser`. |
| `css/styles.css` | Look and feel: color blocks, big type, simple view and landscape layouts. |
| `js/world.js` | The landscape: hills, trees, flowers, cottages, clouds, billboards. `STOPS` at the top sets where each billboard sits. |
| `js/sky.js` | Time of day: sky colors, sun/moon, lights, stars. Edit `KEYS` to change the palette per hour. |
| `js/main.js` | Camera moves, navigation, keyboard, simple view, time slider. |

## Accessibility

- All content is real HTML. The **Simple view** button (or reduced-motion preference, or no WebGL) shows it as a plain page.
- Keyboard: Left/Right arrows move between sections, Esc returns to the overview.

## Publish

Push this folder to a repo named `dbladh.github.io` on the `main` branch; Pages serves it automatically.

## To do

- Replace every "Placeholder" in `index.html` with a real story.
- Pick final colors and fonts; add a favicon and social preview image.
- Vendor `three` into the repo (instead of the CDN) if you want zero third-party requests.

## URL options

- `?seed=NN` pins the village's look (theme, house designs, layout). Without it every visit gets a new village; the console prints the seed in use. Billboards, terrain, hills, forest and pond never change.
- `?debug=1` shows a viewport/seed readout.
- `?detail=low|high` forces the detail level.
