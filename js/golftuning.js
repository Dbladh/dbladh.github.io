// The numbers the machine recipes (golfrecipes.js) are built from. They are chosen by measurement: `node tools/golf/check.mjs --tune` tries other values and reports, for each, how many machines get placed, how forgiving
// they are (share of the test powers that work) and how much the machine matters (a weak putt only works with it). The gaps below are the sweep's best trade-offs.
export const TUNING = {
  runup: { boostAt: 0.6, boostLen: 1.4, rampAt: 1.8, ramp: 1.6, rampH: 0.7, gap: 2.4 },
  bridge: { buttonAt: 0.7, gapAt: 2.6, gap: 2.4 },
  secret: { padAt: 0.6, frontAt: 2.0, len: 3.2, lat: 1.2, fenceLat: 0.1 },
  rail: { mouthAt: 0.7, gapAt: 2.2, gap: 2.8, exitAt: 5.0, h: 0.9 },
  vault: { padAt: 0.7, fence1: 2.4, fence2: 4.0 },
  door: { buttonAt: 0.7, wall1: 2.6, wall2: 4.2 },
};
