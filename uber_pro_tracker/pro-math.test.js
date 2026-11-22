// Run with: node --test uber_pro_tracker/pro-math.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const PM = require('./pro-math.js');

const settings = (over = {}) => ({
  cycle: 0,
  tiers: { gold: 600, platinum: 1200, diamond: 2000 },
  target: 'platinum',
  daysPerWeek: 5,
  pointsPerTrip: 1,
  reqs: { rating: 4.85, acceptance: 80, cancellation: 4 },
  ...over,
});

test('calendar quarter containing Nov 22, 2026', () => {
  const p = PM.periodFor('2026-11-22', 0);
  assert.equal(p.start, '2026-10-01');
  assert.equal(p.end, '2026-12-31');
  assert.equal(p.totalDays, 92);
  assert.equal(p.label, 'Q4 2026');
  assert.equal(p.nextStart, '2027-01-01');
  assert.equal(p.nextEnd, '2027-03-31');
});

test('offset cycles cross the year boundary', () => {
  const p = PM.periodFor('2026-01-15', 1);
  assert.equal(p.start, '2025-11-01');
  assert.equal(p.end, '2026-01-31');
  assert.equal(p.label, 'Nov 2025 to Jan 2026');
  assert.equal(p.totalDays, 92);

  const q = PM.periodFor('2026-03-31', 2);
  assert.equal(q.start, '2026-03-01');
  assert.equal(q.end, '2026-05-31');
  assert.equal(q.label, 'Mar to May 2026');
});

test('leap-year Q1 has 91 days, a normal one 90', () => {
  assert.equal(PM.periodFor('2024-02-29', 0).totalDays, 91);
  assert.equal(PM.periodFor('2026-02-10', 0).totalDays, 90);
});

test('first and last day of a period map to that period', () => {
  assert.equal(PM.periodFor('2026-10-01', 0).start, '2026-10-01');
  assert.equal(PM.periodFor('2026-12-31', 0).start, '2026-10-01');
  assert.equal(PM.periodFor('2027-01-01', 0).start, '2027-01-01');
});

test('bad dates are rejected', () => {
  assert.equal(PM.isISODate('2026-02-30'), false);
  assert.equal(PM.isISODate('2026-2-3'), false);
  assert.throws(() => PM.periodFor('nope', 0));
});

test('behind pace: 640 points on Nov 22 going for Platinum 1,200', () => {
  const P = PM.plan({ today: '2026-11-22', settings: settings(), checkins: [{ date: '2026-11-22', points: 640 }] });
  assert.equal(P.status, 'behind');
  assert.equal(P.daysElapsed, 53);
  assert.equal(P.daysLeft, 40);
  assert.equal(P.needed, 560);
  assert.equal(P.drivingDaysLeft, 29); // 40 days at 5 a week
  assert.equal(P.perDrivingDay, 20); // ceil(560 / 29)
  assert.equal(P.perWeek, 98); // 560 * 7 / 40, exactly
  assert.equal(P.tripsTotal, 560);
  assert.equal(P.projected, 1111); // 640 + (640 / 53) * 39
  assert.equal(P.projectedTier, 'gold');
  assert.equal(P.vsEven, -51); // even pace by day 53 is 691.3
  assert.equal(P.reachDate, null);
  assert.equal(P.tierNow, 'gold');
});

test('on track: 800 points on Nov 22', () => {
  const P = PM.plan({ today: '2026-11-22', settings: settings(), checkins: [{ date: '2026-11-22', points: 800 }] });
  assert.equal(P.status, 'ontrack');
  assert.equal(P.projected, 1389);
  assert.equal(P.reachDate, '2026-12-19'); // 400 more at 15.09 a day = 27 days
});

test('points per trip changes the trip count, not the points', () => {
  const P = PM.plan({
    today: '2026-11-22',
    settings: settings({ pointsPerTrip: 1.5 }),
    checkins: [{ date: '2026-11-22', points: 640 }],
  });
  assert.equal(P.needed, 560);
  assert.equal(P.tripsTotal, 374); // ceil(560 / 1.5)
  assert.equal(P.tripsPerDrivingDay, 13); // ceil(374 / 29)
});

test('reached: shows the stretch to the next tier', () => {
  const P = PM.plan({
    today: '2026-11-22',
    settings: settings(),
    checkins: [
      { date: '2026-11-10', points: 1180 },
      { date: '2026-11-15', points: 1210 },
      { date: '2026-11-22', points: 1300 },
    ],
  });
  assert.equal(P.status, 'reached');
  assert.equal(P.needed, 0);
  assert.equal(P.perDrivingDay, 0);
  assert.equal(P.reachDate, '2026-11-15');
  assert.equal(P.stretch.tier, 'diamond');
  assert.equal(P.stretch.needed, 700);
});

test('uses the latest check-in and ignores other periods and future dates', () => {
  const P = PM.plan({
    today: '2026-11-22',
    settings: settings(),
    checkins: [
      { date: '2026-09-30', points: 1500 }, // last period
      { date: '2026-11-01', points: 400 },
      { date: '2026-11-20', points: 610 },
      { date: '2026-11-25', points: 9999 }, // future
    ],
  });
  assert.equal(P.checkins.length, 2);
  assert.equal(P.latest.date, '2026-11-20');
  assert.equal(P.points, 610);
});

test('no check-in yet this period', () => {
  const P = PM.plan({ today: '2027-01-02', settings: settings(), checkins: [{ date: '2026-12-31', points: 1250 }] });
  assert.equal(P.status, 'nodata');
  assert.equal(P.period.label, 'Q1 2027');
  assert.equal(P.points, 0);
  assert.equal(P.needed, 1200);
  assert.equal(P.daysLeft, 89);
});

test('setup until the target tier has a points number', () => {
  const P = PM.plan({ today: '2026-11-22', settings: { target: 'gold' }, checkins: [] });
  assert.equal(P.status, 'setup');
  assert.equal(P.daysLeft, 40);
});

test('last day of the period still counts as one day left', () => {
  const P = PM.plan({ today: '2026-12-31', settings: settings(), checkins: [{ date: '2026-12-31', points: 1100 }] });
  assert.equal(P.daysLeft, 1);
  assert.equal(P.drivingDaysLeft, 1);
  assert.equal(P.perDrivingDay, 100);
  assert.equal(P.perWeek, 100);
});

test('quality checks use the most recent value entered for each', () => {
  const P = PM.plan({
    today: '2026-11-22',
    settings: settings(),
    checkins: [
      { date: '2026-11-01', points: 300, rating: 4.9, acceptance: 75, cancellation: 3 },
      { date: '2026-11-20', points: 600, rating: 4.8 },
    ],
  });
  const q = Object.fromEntries(P.quality.map((x) => [x.key, x]));
  assert.equal(q.rating.value, 4.8);
  assert.equal(q.rating.ok, false);
  assert.equal(q.acceptance.value, 75);
  assert.equal(q.acceptance.ok, false);
  assert.equal(q.cancellation.ok, true);
});

test('one check-in per day: saving the same date replaces it', () => {
  let list = PM.upsertCheckin([], { date: '2026-11-22', points: 600 });
  list = PM.upsertCheckin(list, { date: '2026-11-20', points: 580 });
  list = PM.upsertCheckin(list, { date: '2026-11-22', points: 640 });
  assert.deepEqual(list.map((c) => [c.date, c.points]), [['2026-11-20', 580], ['2026-11-22', 640]]);
  assert.throws(() => PM.upsertCheckin(list, { date: '2026-11-22', points: -1 }));
  assert.deepEqual(PM.removeCheckin(list, '2026-11-20').map((c) => c.date), ['2026-11-22']);
});

test('settings are cleaned up', () => {
  const s = PM.normalizeSettings({ cycle: 4, daysPerWeek: 9, pointsPerTrip: 0, target: 'ruby', tiers: { gold: '650', platinum: -3 } });
  assert.equal(s.cycle, 1);
  assert.equal(s.daysPerWeek, 7);
  assert.equal(s.pointsPerTrip, 1);
  assert.equal(s.target, 'platinum');
  assert.deepEqual(s.tiers, { gold: 650, platinum: null, diamond: null });
  assert.equal(s.reqs.rating, 4.85);
});

test('past periods are judged by the tier points saved with them', () => {
  const past = PM.pastPeriods(
    [
      { date: '2026-06-30', points: 1400 },
      { date: '2026-09-29', points: 900 },
      { date: '2026-11-22', points: 640 },
    ],
    0,
    '2026-11-22',
    { '2026-07-01': { tiers: { gold: 500, platinum: 1000, diamond: 1500 }, target: 'platinum' } },
    settings(),
  );
  assert.equal(past.length, 2);
  assert.equal(past[0].period.label, 'Q3 2026');
  assert.equal(past[0].tier, 'gold');
  assert.equal(past[0].hitTarget, false);
  assert.equal(past[1].period.label, 'Q2 2026');
  assert.equal(past[1].tier, 'platinum'); // judged by current settings: 1,400 >= 1,200
});
