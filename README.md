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

**Sound language** (`js/audio.js`): good things are rounded, rising and major, played through a soft low-pass (`soft`); setbacks are short, falling and muffled (`dull`) and never louder than the rewards. Coins are a warm sine with a soft bell and still climb a scale through a streak. A landed trick plays a chime that climbs a major scale for each trick in a row (within 4 s of the last) and fills out from one note to a triad to an arpeggio. Also: combo up/lost/dropped, stumble, low fuel (two quiet beeps, repeating under 15%), out of fuel (the whine falls away and the engine coughs and dies), a near-miss whoosh, a charge whine with a click at full charge, a tone that climbs with air time, a chime every 500 m, a new-best fanfare, and soft UI ticks. Everything is synthesised; the no-Web-Audio stub lists every method so a missing one can never throw.

**Landscape sound:** off until the player turns it on (the speaker button beside "Simple view"; the choice is remembered). Clicking the bike to start the game turns it on for that visit unless it was switched off on purpose, with a rising chime for the easter egg. Loops cut by `audio/tools/make_ambient.py` from the long recordings in `audio/raw/` (`amb_day`, `amb_night`, `amb_windmill`, loaded only once sound is on): day and night crossfade with the sky's night amount, the windmill is a faint loop panned toward it, and the ambient bike is heard far off (the engine recording, muffled, louder the nearer it is) as it rides through. Buttons tick on hover and chime on click, and flying into or out of a billboard plays a whoosh. The game turns the ambience down while it runs.

**Lamp flicker:** hovering a billboard plays the first part of `audio/raw/light_flicker.mp3` (its first cluster of flickers, cut by `audio/tools/make_flicker.py` with the low mains hum and the steady high whine filtered out), pitched a little differently for each billboard, while the lamps stutter on in the sign's colour exactly when the flickers are heard (those times are `FLICKER_EVENTS` in `js/audio.js`) and then settle, and a small click as they go off.

**House song (easter egg):** click a village house and it plays a song as if from inside (`audio/song.mp3`, cut from `audio/raw/soft_melody.mp3` by `audio/tools/make_song.py`: mono, evened out, with a long fade at the end). It starts far away (high- and low-passed, with a faint room echo, panned toward the house) and over its first minute comes forward: the filters open, the echo drains, it gets louder, and the landscape's own ambience gives way, so by about a minute in it is the main thing you hear. It plays once (it does not loop). While it plays the house's windows glow in time and notes drift up from its roof, and an **aurora** fills the sky (`js/aurora.js`, a full-sky shader behind the scene) that is driven by the song's spectrum (`audio.songSpectrum`): bass gives glow, height and a pulse on each beat; mids make the curtains fold and sway and add rays; treble adds fine streaks; the colour follows how bright and loud the sound is, from green through teal, blue and violet to magenta and red. The aurora also tints the scene's lights and fog and washes the ground and the pond with its colour (a few uniforms, no extra lights), paler by day. While it plays the scene goes almost completely dark (the sky is shown at a later hour, so by day it passes through sunset; the sky, ambient and moon light are dimmed to a fraction, the billboard faces go nearly black, and the clouds, sun, moon and stars fade away) so only the aurora, the lit windows and the aurora-coloured edges of the hills and trees (a strong rim light from behind) remain. It is all eased in and out together with the aurora, so when the song stops everything returns to the real time of day. Between 1:10 and 1:26 of the song the mood turns warm, strictly inside that window (fading in over 1:10–1:12 and out over 1:24–1:26): the aurora, the fireflies, the village lights and the sky's glow shift from cool blues, greens and magentas to yellows, oranges and reds (`songWarm` in `js/main.js`, `setWarm` in `js/aurora.js`, still night), while the camera very slowly dollies in, as far as it can while all three billboards stay in view (`boardsInView`), then, from 1:26, slowly eases back out for the rest of the song. The fireflies join in: they gather one after another into three slow rings (near, middle and far) that turn, rise and fall in a travelling wave and breathe with the bass, and they brighten in a pulse that travels around each ring with the beat (`dance` in `js/world.js`; all motion is added up frame by frame, so it glides). The village's own lights go almost out while it plays, except the singing house. The fireflies' speed follows the music closely: they speed up on the bass, surge on every beat (and hop up on it), their spacing ripples with the mids, and over the song their path drifts between a ring and a figure of eight. The three billboards light up one at a time on the beats of the song's 3/4 bar (left, middle, right; the left one, on the downbeat, is the brightest), using the beat times found by `audio/tools/find_beats.py` (`SONG_BEATS` in `js/audio.js`). The houses' windows and lamps and the street lamps run a light show: a chase that runs at the music's tempo (faster with the bass, an extra flash on each beat) in colours taken from the aurora's palette, each light a step further along it (`lightShow` in `js/world.js`). The camera has a film-style drift while the song plays: a slow, heavily smoothed sway and tiny roll, and a very gentle swell once a bar (smooth curves, no sharp hits; the 1:10 push-in is eased at both ends too), all counted in beats so it slows with the song's closing ritardando (it gives way to the 1:10 push-in so the billboards stay in view). Music mode also gets a film look from plain CSS (the `#cine` overlay, driven by `--cine` and `--cine-v` in `js/main.js`): thin letterbox bars slide in at the top and bottom, a vignette breathes with the song's loudness, and a faint film grain is added on desktop only. The edge light behind the village drifts slowly across the sky so the rims of hills and roofs sweep, the warm passage adds a golden haze to the air, and the lights sink a little over the closing slowdown (`songFade` in `js/main.js`). A soft haze of dust motes drifts through the air in front of the camera for depth (`dust` in `js/world.js`, positions worked out in the shader), and now and then a shooting star crosses the upper sky (`starTick` in `js/aurora.js`). On desktop the existing bloom in `js/dof.js` is made softer and wider while the song plays (`setGlow`: a lower threshold and larger reach on the same taps, so no extra cost; off wherever bloom is off, i.e. phones, slow machines and the game). Click the same house again to stop it; clicking the bike (starting the game), turning sound off or the song ending also stops it. The song downloads on the first click.

**Trail and dirt:** a worn dirt-bike trail (`js/trail.js`: a soft-edged ribbon with two tyre ruts, draped over the real hills and the generated ground, broken at gaps, faded in as the game starts) runs along the lane. The wheels throw clods of dirt (`js/dirt.js`): earthy and modest on the trail, bigger, darker and more of them in mud.

**Fuel** (`js/fuel.js`, tank in `js/bikegame.js`): the tank (about 40 s) always drains, about 1.9 times faster while the button is held, and a little faster with distance; a fuel can gives back 25 s. At 25% the bar goes red and pulses (and the engine coughs); at empty the engine dies, the bike coasts to a stop and the run ends ("Out of fuel!"). Cans are red spinning jerry cans, placed from the course seed: early ones sit on the trail, then they float above the trail, hang at the top of a jump over an obstacle, sit just behind one (a jump that is too long flies over) or at the peak of a kicker's arc, and they get further apart (about 130 units apart at first, about 190 later). Every candidate spot is "flown on paper" first with the game's own jump numbers over a range of speeds, charges and take-off points, and is only used if enough of those flights reach it, so no can is ever impossible (the pickup radius also shrinks with distance). The gap between cans is always less than one can's worth of fuel at the speed you can have there.

**Obstacles** (`js/obstacles.js`, generated in `js/track.js`): logs, stumps, rocks, log piles and boulders lie on the trail and must be jumped. Hit one at cruising pace and you stumble (lose speed, boost and a combo step); hit one while boosted (or any boulder-sized one at speed) and you crash. They ramp up with distance (how often, how many in a row, how big), but never in how little time you get: before every obstacle the ground is flat for (1 s to see and react + the charge time its jump needs + a margin) at the fastest speed possible there, and obstacles close together are either far enough apart for a jump each or tight enough for one bigger jump to clear them all. A coin arc over each shows the jump line.

**Mud on the bike** (`js/mudcoat.js`): riding through mud builds a coat on the bike and rider (painted on by a small shader patch, thickest low down: wheels, forks, boots) that stays put as the bike tilts, dries from dark and wet to pale and dusty, drops lumps, and is gone about 20 s after you leave the mud. Jumping the mud keeps you clean.

**Performance** (the game): load the page with `?perf=1` for a profiler readout (average, p95 and worst frame time, fps, CPU split, draw calls, the track builder's slowest sections, the render scale). What keeps it smooth: only the bike casts shadows while riding; the nine point lights are switched off by day (both shader variants are pre-compiled at idle); village objects that are sliced away or far off are not drawn; the bike, the windmill rotors and the trail use far fewer draw calls (about 270 per frame instead of 380); track upkeep does no per-frame allocation and builds ground in about 1 ms steps; the sky is drawn smaller; and an automatic resolution controller (`dynTick` in `js/main.js`) lowers the drawing resolution a little when the frame time rises above ~19 ms and raises it again slowly when it has been smooth.

**Loading:** when the scene view will run, a sky-and-hills splash ("Danny Bladh / Loading the landscape") covers the page from the very first paint (a tiny inline script in `index.html` adds `html.boot`; rules in `css/styles.css`), so the plain page never flashes; `js/main.js` fades it out once the first scene frame has been drawn. With Simple view chosen (or `?simple=1`, reduced motion, or no WebGL) it is skipped, and a 12 s safety timer lifts it if anything stalls. If the bike is clicked before the game's background preparation has finished (about 4 s after the page loads), a small "Getting the ride ready" card shows until it has (`game.whenReady()`), then the ride starts.
