// The mini-golf's themes as plain data (no THREE): what a hole looks like (the colour of the lawn, the wall round it, the cup patch, the sand), what stands beside it (a landmark and scattered props), and
// what is special about its ground (ice, mud, quicksand, lava). golfvis.js reads the colours, golfscenery.js the landmark and props, golfgen.js and golfphys.js the surface and the hazard.
import { mulberry32 } from './golfhero.js?v=20261030223324';

const BRICKS = ['#d3694a', '#bd5a3e', '#dc7d58', '#ad5039', '#c96348', '#c9a58a'], ROCKS = ['#a39d92', '#b8b1a3', '#8c8780', '#b0a698', '#c4bba8', '#968d7f'], WOODS = ['#ffffff', '#f0dcc0', '#e0c49c', '#ffe9cc'];

/** key: { name, rough (the colour of the rough: long grass, deep snow, loose sand...), border ('brick' | 'stone' | 'wood'), pal (the colours of the wall pieces), fair [stripe 1, stripe 2, crest, shade] (the lawn), rock (steep faces), sand, landmark, props, surface, hazard } */
export const THEMES = {
  pirate: { ground: 'sand', name: 'Beach & Pirate', border: 'wood', pal: ['#f4e3c1', '#e6c88f', '#d9ad6a', '#fff1d6'], fair: ['#f1dc9b', '#e7cf88', '#fff0b8', '#c9a55e'], rock: '#a89578', sand: '#fff6dc', landmark: 'pirate', props: ['palm', 'shells', 'bench'], rough: '#b9c97a', roughName: 'dune grass', surface: 'mud', hazard: 'water' },
  jungle: { ground: 'grass', name: 'Jungle', border: 'stone', pal: ROCKS, fair: ['#5fcf6a', '#4fbf5c', '#a9ee7e', '#2f7a43'], rock: '#7a7566', sand: '#ffffff', landmark: 'jungle', props: ['palm', 'fern', 'statue'], rough: '#2f9a4a', roughName: 'tall grass', surface: 'mud', hazard: 'water' },
  castle: { ground: 'grass', name: 'Castle & Medieval', border: 'brick', pal: ['#c9c4d6', '#b3aec4', '#d8d3e4', '#a39fb6'], fair: ['#6fcf79', '#62bf6d', '#b3f08c', '#3a8a52'], rock: '#8d8a99', sand: '#ffffff', landmark: 'castle', props: ['banner', 'torch', 'statue'], rough: '#2f8f48', roughName: 'long grass', surface: 'ice', hazard: 'water' },
  space: { ground: 'rock', name: 'Space & UFO', border: 'stone', pal: ['#6c5ce0', '#8a63ff', '#4fe3ff', '#ff4fd8'], fair: ['#5b4fd0', '#4f44bd', '#8f86ff', '#2c2468'], rock: '#3d3480', sand: '#cdbbff', landmark: 'space', props: ['crystal', 'ufo', 'statue'], rough: '#8a7be8', roughName: 'moon dust', surface: 'ice', hazard: 'water' },
  garden: { ground: 'grass', name: 'Garden', border: 'brick', pal: BRICKS, fair: ['#78e075', '#68d06b', '#b6f58a', '#3f9a55'], rock: '#8d8579', sand: '#ffffff', landmark: 'garden', props: ['fountain', 'bench', 'parasol'], rough: '#3f9f4f', roughName: 'long grass', surface: 'mud', hazard: 'water' },
  desert: { ground: 'sand', name: 'Desert', border: 'brick', pal: ['#d9a566', '#c98f50', '#e6bb7e', '#b97c44'], fair: ['#e7c98a', '#ddbd7a', '#f6e0a8', '#b88a4a'], rock: '#a9743f', sand: '#ffe8b0', landmark: 'desert', props: ['cactus', 'dune', 'bench'], rough: '#f2d48f', roughName: 'loose sand', surface: 'quicksand', hazard: 'water' },
  ice: { ground: 'snow', name: 'Ice & Snow', border: 'stone', pal: ['#e6f2ff', '#cfe4ff', '#bcd8f5', '#f6fbff'], fair: ['#eaf4ff', '#dcecfb', '#ffffff', '#9fc3e6'], rock: '#8fb3d6', sand: '#d8ecff', landmark: 'ice', props: ['snowman', 'pine', 'iceberg'], rough: '#ffffff', roughName: 'deep snow', surface: 'ice', hazard: 'water' },
  candy: { ground: 'candy', name: 'Candy Land', border: 'wood', pal: ['#ff8ab8', '#ffd1e6', '#8ee0ff', '#ffe58a', '#b98cff'], fair: ['#ffc2dc', '#ffb0d2', '#ffe3f0', '#e68ab4'], rock: '#c97fa8', sand: '#fff0b0', landmark: 'candy', props: ['lollipop', 'gumdrop', 'cane'], rough: '#ff9ccf', roughName: 'sprinkles', surface: 'caramel', hazard: 'water' },
  volcano: { ground: 'rock', name: 'Volcano', border: 'stone', pal: ['#4a4046', '#5a4f57', '#3b3338', '#6a5a58'], fair: ['#6f5f66', '#625259', '#8f7d82', '#3b2f36'], rock: '#2f2428', sand: '#b09a8a', landmark: 'volcano', props: ['rockspire', 'ember', 'statue'], rough: '#8a7a78', roughName: 'ash', surface: 'ice', hazard: 'lava' },
  haunted: { ground: 'moss', name: 'Haunted Manor', border: 'brick', pal: ['#6a5f78', '#574d66', '#7d7090', '#473f55'], fair: ['#7d7396', '#716788', '#a99fc4', '#463e5d'], rock: '#3d3650', sand: '#c8bede', landmark: 'haunted', props: ['deadtree', 'gravestone', 'lamp'], rough: '#58704a', roughName: 'moss', surface: 'mud', hazard: 'water' },
};
export const THEME_KEYS = Object.keys(THEMES);
export const THEME_NAMES = Object.fromEntries(THEME_KEYS.map((k) => [k, THEMES[k].name]));
export const themeOf = (key) => THEMES[key] || THEMES.garden;
export const brickPalette = (key) => themeOf(key).pal;
export { BRICKS, ROCKS, WOODS };

/** The theme of each of the nine holes this month: the ten themes shuffled with the course seed, nine of them used, so a course never repeats one. */
export function themeOrder(cs) {
  const a = THEME_KEYS.slice(), r = mulberry32((cs + 0x7a3c19d) >>> 0);
  for (let i = a.length - 1; i > 0; i--) { const j = (r() * (i + 1)) | 0; const x = a[i]; a[i] = a[j]; a[j] = x; }
  return a.slice(0, 9);
}
