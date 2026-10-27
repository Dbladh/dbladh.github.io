// Builds a mini-golf course off the main thread. A course nobody has worked out ahead of time (a random one) has to be searched for, which can take seconds; here it happens in the background
// while the page stays smooth. golf.js starts this worker, shows the progress, and uses the holes it sends back.
import { holeSeed, makeHole } from './golfgen.js?v=20261026220027';
import { themeOf } from './golfthemes.js?v=20261026220027';

onmessage = (e) => {
  const { seed, order, shapes, themes, fx, more, n } = e.data;
  try {
    for (let i = 0; i < n; i++) { const h = makeHole(holeSeed(seed, i), i, order[i], shapes[i], fx ? { surface: themeOf(themes[i]).surface, theme: themes[i], more } : null); h.theme = themes[i]; postMessage({ i, h }); }
    postMessage({ done: true });
  } catch (err) { postMessage({ error: String(err && err.message || err) }); }
};
