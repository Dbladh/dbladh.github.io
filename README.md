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

- **Controls:** on the ground hold (click, touch, Space or Enter) to crouch, build speed and charge a jump (about 1.1 s to full); release to jump, higher the longer you held. In the air the nose tips backward on its own: tap to kick it forward, hold to dive (front flips). A pulsing circle shows where you will land and how it would go if nothing changes: green perfect, gold clean, orange rough, coral crash. A press in the last ~0.14 s before touchdown is held over, so releasing just before you land jumps the moment the wheels touch. While you hold, the bike stays glued to the ground (bumps and lips cannot lift it), so a charge is never interrupted. Esc or the Back pill leaves; P or the pause button pauses (it also pauses by itself when the window loses focus). The first run shows short coaching tips (skippable, remembered in `localStorage`; `?guide=1` forces them, `?guide=0` hides them).
- **Scoring:** tricks and perfect landings build a combo multiplier (x1 to x5: each one adds a step, a clean landing keeps it alive, and a ring around the badge shows the time left; about 6 s without any of them and it drops a step). It multiplies coin, trick and landing points. A crash ends the run (ragdoll rider); the best score is kept in `localStorage`.
- **Test switches:** `?bike=1` sends a bike straight away and keeps them coming, `?game=1` starts the game, `?course=NN` fixes the generated course, `?fx=0` turns off the speed and feedback effects (speed lines, sparks, rings, flashes, hit-stop, camera shake) in the game.
- The bike and game are off when the visitor prefers reduced motion and in Simple View.
- Code: `js/bike.js` (models), `js/ride.js` (ambient pass), `js/bikegame.js` (shell, physics, scoring), `js/track.js` (ground), `js/coins.js`, `js/ragdoll.js`.

The game's ground continues the real terrain: the same terrain material and colour function, and trees, bushes, rocks, wildflowers and grass built by the same plant builders as the main scene (`world.scatter` / `world.terrainColor` in `js/world.js`). The village in front of the bike's lane is sliced away with a clipping plane; the terrain itself is left whole, so green hills fall away toward the camera.

**Hazards (the generated stretch):** gaps (pits between a lip and a far bank: fall in and the run is over) and mud patches (they drag the bike down to a crawl; jump them or slow down). A heads-up toast appears before each. Hold to charge on the approach: holding at the lip of a gap releases the charge for you. Bigger kickers throw you up a little extra even with no jump. A crash is always final (no extra lives).

**Coins** now trace the paths of jumps: each kicker gets an arc along the line a no-jump launch flies, and often a higher one for a fully charged jump; each gap gets the line of a well-charged jump across it. Coins are evenly spaced (about 3 units along the arc, never closer than 2.7) and only the odd short line sits on the ground.

**Tricks:** double-tap in the air. Each double-tap performs the next trick in a cycle: backflip, 360 spin (the bike turns sideways a full circle), front flip, 360 spin the other way (a flip is skipped for the next trick when there is not enough air left). Every trick takes the same time (0.75 s); flips are worth 400, spins 300, times your groove.

**Steering the landing:** holding in the air pulls the bike down about 4.6 times as hard as gravity (ramping in over about 0.06 s) and eases the nose forward, so you choose where it lands. A hold started just after take-off cut a 1.12 s, 19-unit flight to 0.49 s and 8.6 units in testing.

**Sound** (`js/audio.js`, files in `audio/`): the engine is two looping recordings (idle and high revs) that are pitch-shifted and crossfaded by one smooth "rev" value (speed, the held charge, free-revving in the air) and softened when the camera is far; a throttle blip on the jump, a crash and a rider bounce are recordings; coins, landings, tricks, combo, wind, tyres on dirt and mud are synthesised. Sound starts with the game (browsers need a tap first) and the speaker button under the pause button mutes it (remembered). The raw downloads live in `audio/raw/` and `python3 audio/tools/make_audio.py` cuts them into the game's files.

`?engine=synth` plays a synthesised engine (`audio/engine-worklet.js`: firing pulses with random strength and timing through the exhaust's resonances, so it never repeats) instead of the recording, for comparing by ear.

**Trail and dirt:** a worn dirt-bike trail (`js/trail.js`: a soft-edged ribbon with two tyre ruts, draped over the real hills and the generated ground, broken at gaps, faded in as the game starts) runs along the lane. The wheels throw clods of dirt (`js/dirt.js`): earthy and modest on the trail, bigger, darker and more of them in mud.

**Obstacles** (`js/obstacles.js`, generated in `js/track.js`): logs, stumps, rocks, log piles and boulders lie on the trail and must be jumped. Hit one at cruising pace and you stumble (lose speed, boost and a combo step); hit one while boosted (or any boulder-sized one at speed) and you crash. They ramp up with distance (how often, how many in a row, how big), but never in how little time you get: before every obstacle the ground is flat for (1 s to see and react + the charge time its jump needs + a margin) at the fastest speed possible there, and obstacles close together are either far enough apart for a jump each or tight enough for one bigger jump to clear them all. A coin arc over each shows the jump line.
