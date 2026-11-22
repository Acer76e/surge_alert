// Run with: node --test uber_pro_tracker/pro-math.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const PM = require('./pro-math.js');

// The tier table from the Driver app, Nov 2026.
const APP_TIERS = {
  gold: { points: 25, acceptance: 25, cancellation: 8, rating: 4.85, insights: 75 },
  platinum: { points: 400, acceptance: 70, cancellation: 4, rating: 4.85, insights: 85 },
  diamond: { points: 1000, acceptance: 70, cancellation: 4, rating: 4.85, insights: 85 },
};

// A simpler table for the arithmetic tests.
const settings = (over = {}) => ({
  cycle: 0,
  target: 'platinum',
  daysPerWeek: 5,
  pointsPerTrip: 1,
  tiers: {
    gold: { points: 600, rating: 4.85, cancellation: 4 },
    platinum: { points: 1200, rating: 4.85, acceptance: 80, cancellation: 4 },
    diamond: { points: 2000, rating: 4.85, acceptance: 80, cancellation: 4 },
  },
  ...over,
});

/* ---------- periods ---------- */

test('calendar quarter containing Nov 22, 2026', () => {
  const p = PM.periodFor('2026-11-22', 0);
  assert.equal(p.start, '2026-10-01');
  assert.equal(p.end, '2026-12-31');
  assert.equal(p.totalDays, 92);
  assert.equal(p.label, 'Q4 2026');
});

test("Uber's Nov to Jan period, the default", () => {
  assert.equal(PM.normalizeSettings({}).cycle, 1);
  const p = PM.periodFor('2026-11-22', 1);
  assert.equal(p.start, '2026-11-01');
  assert.equal(p.end, '2027-01-31');
  assert.equal(p.totalDays, 92);
  assert.equal(p.label, 'Nov 2026 to Jan 2027');
  assert.equal(p.nextStart, '2027-02-01');
  assert.equal(p.nextEnd, '2027-04-30');
});

test('offset cycles cross the year boundary both ways', () => {
  const p = PM.periodFor('2026-01-15', 1);
  assert.equal(p.start, '2025-11-01');
  assert.equal(p.end, '2026-01-31');
  const q = PM.periodFor('2026-03-31', 2);
  assert.equal(q.start, '2026-03-01');
  assert.equal(q.end, '2026-05-31');
  assert.equal(q.label, 'Mar to May 2026');
});

test('leap-year February is counted', () => {
  assert.equal(PM.periodFor('2024-02-29', 0).totalDays, 91);
  assert.equal(PM.periodFor('2024-02-29', 1).totalDays, 90); // Feb 29 + Mar 31 + Apr 30
});

test('bad dates are rejected', () => {
  assert.equal(PM.isISODate('2026-02-30'), false);
  assert.equal(PM.isISODate('2026-2-3'), false);
  assert.throws(() => PM.periodFor('nope', 0));
});

/* ---------- the plan ---------- */

test('your numbers on Nov 22: 34 points, 12 trips, keeping Diamond', () => {
  const P = PM.plan({
    today: '2026-11-22',
    settings: { cycle: 1, target: 'diamond', currentStatus: 'diamond', daysPerWeek: 5, tiers: APP_TIERS },
    checkins: [{ date: '2026-11-22', points: 34, trips: 12, acceptance: 78, cancellation: 1, rating: 5, insights: 92 }],
  });
  assert.equal(P.keeping, true);
  assert.equal(P.daysElapsed, 22);
  assert.equal(P.daysLeft, 71);
  assert.equal(P.needed, 966);
  assert.equal(P.drivingDaysLeft, 51); // 71 days at 5 a week
  assert.equal(P.perDrivingDay, 19); // ceil(966 / 51)
  assert.equal(P.perWeek, 96); // ceil(966 * 7 / 71)
  assert.equal(P.mix.source, 'trips');
  assert.equal(P.mix.bonusTrips, 11); // 1 regular trip + 11 three-point trips = 34
  assert.ok(Math.abs(P.mix.avg - 34 / 12) < 1e-9);
  assert.equal(P.tripsTotal, 341); // ceil(966 / 2.833)
  assert.equal(P.tripsPerDrivingDay, 7);
  assert.equal(P.tripsAllBonus, 322);
  assert.equal(P.tripsAllRegular, 966);
  assert.equal(P.projected, 142); // 34 + (34 / 22) * 70
  assert.equal(P.status, 'behind');
  // Points are the only thing between you and Diamond today.
  assert.equal(P.standing.tier, 'gold');
  assert.deepEqual(P.blockers, ['points']);
  assert.equal(P.standing.rows.diamond.cells.insights, true);
});

test('behind pace: 640 points on Nov 22 going for Platinum 1,200', () => {
  const P = PM.plan({ today: '2026-11-22', settings: settings(), checkins: [{ date: '2026-11-22', points: 640 }] });
  assert.equal(P.status, 'behind');
  assert.equal(P.daysElapsed, 53);
  assert.equal(P.daysLeft, 40);
  assert.equal(P.needed, 560);
  assert.equal(P.drivingDaysLeft, 29);
  assert.equal(P.perDrivingDay, 20);
  assert.equal(P.perWeek, 98);
  assert.equal(P.mix.source, 'setting');
  assert.equal(P.tripsTotal, 560);
  assert.equal(P.projected, 1111);
  assert.equal(P.projectedTier, 'gold');
  assert.equal(P.vsEven, -51);
  assert.equal(P.reachDate, null);
});

test('on track: 800 points on Nov 22', () => {
  const P = PM.plan({ today: '2026-11-22', settings: settings(), checkins: [{ date: '2026-11-22', points: 800 }] });
  assert.equal(P.status, 'ontrack');
  assert.equal(P.projected, 1389);
  assert.equal(P.reachDate, '2026-12-19');
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
  assert.equal(P.reachDate, '2026-11-15');
  assert.equal(P.stretch.tier, 'diamond');
  assert.equal(P.stretch.needed, 700);
});

test('uses the latest check-in and ignores other periods and future dates', () => {
  const P = PM.plan({
    today: '2026-11-22',
    settings: settings(),
    checkins: [
      { date: '2026-09-30', points: 1500 },
      { date: '2026-11-01', points: 400 },
      { date: '2026-11-20', points: 610 },
      { date: '2026-11-25', points: 9999 },
    ],
  });
  assert.equal(P.checkins.length, 2);
  assert.equal(P.latest.date, '2026-11-20');
  assert.equal(P.points, 610);
});

test('no check-in yet this period', () => {
  const P = PM.plan({ today: '2027-02-02', settings: { ...settings(), cycle: 1 }, checkins: [{ date: '2027-01-31', points: 1250 }] });
  assert.equal(P.status, 'nodata');
  assert.equal(P.period.label, 'Feb to Apr 2027');
  assert.equal(P.points, 0);
  assert.equal(P.needed, 1200);
});

test('setup until the target tier has a points number', () => {
  const P = PM.plan({ today: '2026-11-22', settings: { target: 'gold', tiers: { gold: {} } }, checkins: [] });
  assert.equal(P.status, 'setup');
});

test('last day of the period still counts as one day left', () => {
  const P = PM.plan({ today: '2026-12-31', settings: settings(), checkins: [{ date: '2026-12-31', points: 1100 }] });
  assert.equal(P.daysLeft, 1);
  assert.equal(P.perDrivingDay, 100);
  assert.equal(P.perWeek, 100);
});

/* ---------- requirements ---------- */

test('status is the highest tier where every requirement is met', () => {
  const stats = { points: 1200, acceptance: 60, cancellation: 2, rating: 4.9, insights: 90 };
  const s = PM.standing(stats, PM.normalizeSettings({ tiers: APP_TIERS }).tiers);
  // Enough points for Platinum and more, but 60% acceptance only clears Gold's 25%.
  assert.equal(s.tier, 'gold');
  assert.deepEqual(s.rows.platinum.fails, ['acceptance']);
  assert.deepEqual(s.rows.diamond.fails, ['acceptance']);
});

test('a stat not entered yet does not block a tier', () => {
  const s = PM.standing({ points: 500, acceptance: null, cancellation: null, rating: null, insights: null }, PM.normalizeSettings({ tiers: APP_TIERS }).tiers);
  assert.equal(s.tier, 'platinum');
  assert.deepEqual(s.rows.platinum.unknown, ['acceptance', 'cancellation', 'rating', 'insights']);
});

test('requirements use the most recent value entered for each stat', () => {
  const P = PM.plan({
    today: '2026-11-22',
    settings: { cycle: 1, target: 'platinum', tiers: APP_TIERS },
    checkins: [
      { date: '2026-11-01', points: 300, rating: 4.9, acceptance: 75, insights: 80 },
      { date: '2026-11-20', points: 600, rating: 4.8 },
    ],
  });
  assert.equal(P.stats.rating, 4.8);
  assert.equal(P.stats.acceptance, 75);
  assert.deepEqual(P.blockers, ['rating', 'insights']);
});

/* ---------- extra-point hours ---------- */

test('extra-point hours: Sunday noon is inside the 9 AM to 7 PM window', () => {
  const b = PM.bonusNow(0, 12 * 60 + 20);
  assert.equal(b.active, true);
  assert.equal(b.endDay, 0);
  assert.equal(b.endHour, 19);
});

test('extra-point hours: Saturday 10 PM runs through to 3 AM Sunday', () => {
  const b = PM.bonusNow(6, 22 * 60);
  assert.deepEqual([b.active, b.endDay, b.endHour], [true, 1, 3]);
});

test('extra-point hours: Thursday 11 PM runs into Friday 3 AM', () => {
  const b = PM.bonusNow(4, 23 * 60);
  assert.deepEqual([b.active, b.endDay, b.endHour], [true, 1, 3]);
});

test('extra-point hours: Monday 11 PM ends at midnight', () => {
  const b = PM.bonusNow(1, 23 * 60);
  assert.equal(b.active, true);
  assert.equal(b.endsAtMidnight, true);
});

test('outside extra-point hours: the next window', () => {
  assert.deepEqual(PM.bonusNow(1, 11 * 60), { active: false, nextDay: 0, nextHour: 15, nextEndHour: 18 });
  assert.deepEqual(PM.bonusNow(1, 1 * 60), { active: false, nextDay: 0, nextHour: 7, nextEndHour: 10 });
  assert.deepEqual(PM.bonusNow(0, 20 * 60), { active: false, nextDay: 0, nextHour: 21, nextEndHour: 24 });
});

test('86 extra-point hours a week', () => {
  assert.equal(PM.weeklyBonusHours(PM.DEFAULT_BONUS_HOURS), 86);
});

/* ---------- check-ins and settings ---------- */

test('one check-in per day: saving the same date replaces it', () => {
  let list = PM.upsertCheckin([], { date: '2026-11-22', points: 600 });
  list = PM.upsertCheckin(list, { date: '2026-11-20', points: 580, trips: 200, insights: 92 });
  list = PM.upsertCheckin(list, { date: '2026-11-22', points: 640 });
  assert.deepEqual(list.map((c) => [c.date, c.points]), [['2026-11-20', 580], ['2026-11-22', 640]]);
  assert.equal(list[0].trips, 200);
  assert.equal(list[0].insights, 92);
  assert.throws(() => PM.upsertCheckin(list, { date: '2026-11-22', points: -1 }));
  assert.deepEqual(PM.removeCheckin(list, '2026-11-20').map((c) => c.date), ['2026-11-22']);
});

test('settings are cleaned up', () => {
  const s = PM.normalizeSettings({ cycle: 4, daysPerWeek: 9, pointsPerTrip: 0, target: 'ruby', currentStatus: 'gold', tiers: { gold: { points: '650', rating: 9 } } });
  assert.equal(s.cycle, 1);
  assert.equal(s.daysPerWeek, 7);
  assert.equal(s.pointsPerTrip, 1);
  assert.equal(s.target, 'platinum');
  assert.equal(s.currentStatus, 'gold');
  assert.equal(s.tiers.gold.points, 650);
  assert.equal(s.tiers.gold.rating, 5);
  assert.equal(s.tiers.platinum.points, null);
});

test('older saves with bare tier points still load', () => {
  const s = PM.normalizeSettings({ tiers: { gold: 600, platinum: 1200, diamond: null }, reqs: { rating: 4.85, cancellation: 4, acceptance: null } });
  assert.deepEqual(s.tiers.gold, { points: 600, acceptance: null, cancellation: 4, rating: 4.85, insights: null });
  assert.equal(s.tiers.diamond.points, null);
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
    { '2026-07-01': { tiers: { gold: { points: 500 }, platinum: { points: 1000 }, diamond: { points: 1500 } }, target: 'platinum' } },
    settings(),
  );
  assert.equal(past.length, 2);
  assert.equal(past[0].period.label, 'Q3 2026');
  assert.equal(past[0].tier, 'gold');
  assert.equal(past[0].hitTarget, false);
  assert.equal(past[1].period.label, 'Q2 2026');
  assert.equal(past[1].tier, 'platinum');
});
