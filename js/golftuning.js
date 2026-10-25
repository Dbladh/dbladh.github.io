// The numbers the machine recipes (golfrecipes.js) are built from. They are chosen by measurement: `node tools/golf/check.mjs --tune` tries other values and reports which work best over many courses.
export const TUNING = {
  runup: { boostAt: 0.8, boostLen: 1.6, rampAt: 2.2, ramp: 1.8, rampH: 0.7, gap: 2.2 },
  vault: { padAt: 0.7, fence1: 2.4, fence2: 4.0 },
  door: { buttonAt: 0.7, wall1: 2.6, wall2: 4.2 },
};
