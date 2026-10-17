# Danny Bladh: portfolio

A 3D low-poly landscape portfolio, published with GitHub Pages at https://dbladh.github.io.
Content is organized by *attributes* (creativity, AI, about), with experiences as evidence.

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
- `?look=classic` shows the original, dimmer look (no grade, haze, bloom or rim light) for A/B comparison.
- `?perf=1` / `?debug=1` show a viewport, seed and frame-cost readout.
- `?detail=low|high` forces the detail level.

## Colour scheme

The town's colours live in `js/palette.js` (cream, sage, gold, blue-green, soft blue, coral plus supporting stone, roof and wood tones). The six village themes in `js/houses.js` are different arrangements of that palette; edit a hex in `palette.js` and it changes everywhere.

## Dirt bike easter egg

A small dirt bike rides across the sign hills now and then (first pass about 8 s after load, then every 40-60 s). Click or tap it
(or Tab to the hidden "Play the dirt bike game" button) to start a one-button game that continues the real terrain to the right.

- **Controls:** on the ground hold (click, touch, Space or Enter) to crouch, build speed and charge a jump (about 1.1 s to full); release to jump, higher the longer you held. In the air the nose tips backward on its own: tap to kick it forward, hold to dive (front flips). Two bars show where you will land: cream along the slope, and your nose angle (green when it matches). A press in the last ~0.14 s before touchdown is held over, so releasing just before you land jumps the moment the wheels touch. Esc or the Back pill leaves.
- **Scoring:** coins, landings and flips build a groove multiplier (x1 to x5). A crash ends the run (ragdoll rider); the best score is kept in `localStorage`.
- **Test switches:** `?bike=1` sends a bike straight away and keeps them coming, `?game=1` starts the game, `?course=NN` fixes the generated course.
- The bike and game are off when the visitor prefers reduced motion and in Simple View.
- Code: `js/bike.js` (models), `js/ride.js` (ambient pass), `js/bikegame.js` (shell, physics, scoring), `js/track.js` (ground), `js/coins.js`, `js/ragdoll.js`.
