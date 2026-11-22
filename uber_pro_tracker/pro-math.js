/*
 * Pro Points Planner: the math behind the tracker.
 *
 * Pure functions only (no DOM, no storage), so the same file runs in the
 * browser (as window.ProMath) and in Node for the tests (require()).
 *
 * Dates are plain 'YYYY-MM-DD' strings in the driver's local calendar.
 * All day arithmetic goes through UTC so daylight saving never shifts a day.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ProMath = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var TIERS = [
    { key: 'gold', name: 'Gold' },
    { key: 'platinum', name: 'Platinum' },
    { key: 'diamond', name: 'Diamond' },
  ];

  // Which months an Uber Pro period starts in. 0 = calendar quarters.
  var CYCLES = [
    { value: 0, label: 'Jan, Apr, Jul, Oct' },
    { value: 1, label: 'Feb, May, Aug, Nov' },
    { value: 2, label: 'Mar, Jun, Sep, Dec' },
  ];

  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  // Tier points are left empty on purpose: they differ by city and Uber
  // changes them, so the driver copies them from the Driver app.
  // Rating and cancellation limits are the ones Uber's help pages list.
  var DEFAULT_SETTINGS = {
    cycle: 0,
    tiers: { gold: null, platinum: null, diamond: null },
    target: 'platinum',
    daysPerWeek: 5,
    pointsPerTrip: 1,
    reqs: { rating: 4.85, acceptance: null, cancellation: 4 },
  };

  /* ---------- dates ---------- */

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  // Month is 0-based and may overflow (month 12 = next January, day 0 = last day of previous month).
  function toISO(y, m, d) {
    var t = new Date(Date.UTC(y, m, d));
    return t.getUTCFullYear() + '-' + pad(t.getUTCMonth() + 1) + '-' + pad(t.getUTCDate());
  }

  function parseISO(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso == null ? '' : iso));
    if (!m) return null;
    var y = +m[1], mo = +m[2] - 1, d = +m[3];
    if (toISO(y, mo, d) !== iso) return null; // rejects 2026-02-30
    return { y: y, m: mo, d: d };
  }

  function isISODate(iso) { return parseISO(iso) !== null; }

  function dayNumber(iso) {
    var p = parseISO(iso);
    if (!p) throw new RangeError('Not a YYYY-MM-DD date: ' + iso);
    return Math.round(Date.UTC(p.y, p.m, p.d) / 86400000);
  }

  function addDays(iso, n) {
    var p = parseISO(iso);
    if (!p) throw new RangeError('Not a YYYY-MM-DD date: ' + iso);
    return toISO(p.y, p.m, p.d + n);
  }

  function localToday(now) {
    now = now || new Date();
    return toISO(now.getFullYear(), now.getMonth(), now.getDate());
  }

  function fmtDate(iso, withYear) {
    var p = parseISO(iso);
    if (!p) return '';
    return MONTHS[p.m] + ' ' + p.d + (withYear ? ', ' + p.y : '');
  }

  function periodLabel(start, end) {
    var s = parseISO(start), e = parseISO(end);
    if (s.m % 3 === 0) return 'Q' + (s.m / 3 + 1) + ' ' + s.y;
    return MONTHS[s.m] + (s.y !== e.y ? ' ' + s.y : '') + ' to ' + MONTHS[e.m] + ' ' + e.y;
  }

  // The three-month Uber Pro period that contains `iso`.
  function periodFor(iso, cycle) {
    var c = ((Math.trunc(Number(cycle)) || 0) % 3 + 3) % 3;
    var p = parseISO(iso);
    if (!p) throw new RangeError('Not a YYYY-MM-DD date: ' + iso);
    var startM = p.m - ((((p.m - c) % 3) + 3) % 3);
    var start = toISO(p.y, startM, 1);
    var end = toISO(p.y, startM + 3, 0);
    return {
      id: start,
      start: start,
      end: end,
      nextStart: toISO(p.y, startM + 3, 1),
      nextEnd: toISO(p.y, startM + 6, 0),
      totalDays: dayNumber(end) - dayNumber(start) + 1,
      label: periodLabel(start, end),
    };
  }

  /* ---------- inputs ---------- */

  function num(v) {
    if (v === null || v === undefined || v === '') return null;
    var n = Number(v);
    return isFinite(n) ? n : null;
  }

  function clamp(n, lo, hi) { return Math.min(hi, Math.max(lo, n)); }

  function normalizeSettings(raw) {
    raw = raw && typeof raw === 'object' ? raw : {};
    var d = DEFAULT_SETTINGS;
    var tiersIn = raw.tiers && typeof raw.tiers === 'object' ? raw.tiers : {};
    var reqsIn = raw.reqs && typeof raw.reqs === 'object' ? raw.reqs : d.reqs;
    var tiers = {};
    TIERS.forEach(function (t) {
      var v = num(tiersIn[t.key]);
      tiers[t.key] = v !== null && v > 0 ? Math.round(v) : null;
    });
    var cycle = num(raw.cycle);
    var dpw = num(raw.daysPerWeek);
    var ppt = num(raw.pointsPerTrip);
    var target = TIERS.some(function (t) { return t.key === raw.target; }) ? raw.target : d.target;
    function req(key, lo, hi) {
      var v = num(reqsIn[key]);
      return v === null ? null : clamp(v, lo, hi);
    }
    return {
      cycle: cycle === null ? d.cycle : ((Math.trunc(cycle) % 3) + 3) % 3,
      tiers: tiers,
      target: target,
      daysPerWeek: dpw === null ? d.daysPerWeek : clamp(Math.round(dpw), 1, 7),
      pointsPerTrip: ppt === null || ppt <= 0 ? d.pointsPerTrip : Math.min(ppt, 50),
      reqs: { rating: req('rating', 1, 5), acceptance: req('acceptance', 0, 100), cancellation: req('cancellation', 0, 100) },
    };
  }

  function normalizeCheckin(raw) {
    if (!raw || typeof raw !== 'object' || !isISODate(raw.date)) return null;
    var points = num(raw.points);
    if (points === null || points < 0) return null;
    function opt(key, lo, hi) {
      var v = num(raw[key]);
      return v === null || v < lo || v > hi ? null : v;
    }
    return {
      date: raw.date,
      points: Math.round(points),
      rating: opt('rating', 1, 5),
      acceptance: opt('acceptance', 0, 100),
      cancellation: opt('cancellation', 0, 100),
    };
  }

  function sortCheckins(list) {
    return (Array.isArray(list) ? list : [])
      .map(normalizeCheckin)
      .filter(Boolean)
      .sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
  }

  // One check-in per day: saving the same date again replaces it.
  function upsertCheckin(list, checkin) {
    var c = normalizeCheckin(checkin);
    if (!c) throw new RangeError('A check-in needs a date and a points number of 0 or more.');
    var rest = sortCheckins(list).filter(function (x) { return x.date !== c.date; });
    rest.push(c);
    return sortCheckins(rest);
  }

  function removeCheckin(list, date) {
    return sortCheckins(list).filter(function (x) { return x.date !== date; });
  }

  /* ---------- tiers ---------- */

  function tierName(key) {
    for (var i = 0; i < TIERS.length; i++) if (TIERS[i].key === key) return TIERS[i].name;
    return 'Blue';
  }

  // Highest tier whose points are met. 'blue' is the starting tier.
  function tierFor(points, tiers) {
    for (var i = TIERS.length - 1; i >= 0; i--) {
      var v = tiers[TIERS[i].key];
      if (v !== null && v !== undefined && points >= v) return TIERS[i].key;
    }
    return 'blue';
  }

  // The next tier above `key` that has a points number set.
  function tierAbove(key, tiers) {
    var i = 0;
    while (i < TIERS.length && TIERS[i].key !== key) i++;
    for (i = i + 1; i < TIERS.length; i++) {
      if (tiers[TIERS[i].key] !== null && tiers[TIERS[i].key] !== undefined) return TIERS[i].key;
    }
    return null;
  }

  /* ---------- the plan ---------- */

  // What it takes to get from `points` to `goal` in the days left.
  function requirement(points, goal, daysLeft, settings) {
    var needed = Math.max(0, goal - points);
    var drivingDaysLeft = Math.max(1, Math.round(daysLeft * settings.daysPerWeek / 7));
    var tripsTotal = Math.ceil(needed / settings.pointsPerTrip - 1e-9);
    // needed * 7 / days avoids the float error of dividing by days / 7
    var weekDivisor = Math.max(7, daysLeft);
    return {
      goal: goal,
      needed: needed,
      drivingDaysLeft: drivingDaysLeft,
      perDrivingDay: Math.ceil(needed / drivingDaysLeft),
      tripsTotal: tripsTotal,
      tripsPerDrivingDay: Math.ceil(tripsTotal / drivingDaysLeft),
      perWeek: Math.ceil(needed * 7 / weekDivisor),
      tripsPerWeek: Math.ceil(tripsTotal * 7 / weekDivisor),
      perCalendarDay: needed / Math.max(1, daysLeft),
    };
  }

  function quality(checkins, reqs) {
    function lastValue(key) {
      for (var i = checkins.length - 1; i >= 0; i--) if (checkins[i][key] !== null) return checkins[i][key];
      return null;
    }
    return [
      { key: 'rating', label: 'Star rating', unit: '', dir: 'min' },
      { key: 'acceptance', label: 'Acceptance rate', unit: '%', dir: 'min' },
      { key: 'cancellation', label: 'Cancellation rate', unit: '%', dir: 'max' },
    ].map(function (q) {
      q.value = lastValue(q.key);
      q.req = reqs[q.key];
      q.ok = q.value === null || q.req === null ? null : q.dir === 'min' ? q.value >= q.req : q.value <= q.req;
      return q;
    });
  }

  /*
   * Everything the page shows, worked out from today's date, the settings
   * and every saved check-in. Check-ins outside the current period, or
   * dated after today, are ignored.
   *
   * status: 'setup'   no points number for the target tier yet
   *         'nodata'  no check-in this period yet
   *         'reached' points already at or past the target
   *         'ontrack' current pace finishes at or past the target
   *         'behind'  current pace finishes short of the target
   */
  function plan(input) {
    var today = input.today;
    var s = normalizeSettings(input.settings);
    var period = periodFor(today, s.cycle);
    var t0 = dayNumber(period.start);
    var tEnd = dayNumber(period.end);
    var tNow = dayNumber(today);
    var list = sortCheckins(input.checkins).filter(function (c) {
      return c.date >= period.start && c.date <= today;
    });
    var latest = list.length ? list[list.length - 1] : null;
    var points = latest ? latest.points : 0;
    var targetPoints = s.tiers[s.target];

    var out = {
      today: today,
      settings: s,
      period: period,
      daysTotal: period.totalDays,
      daysElapsed: tNow - t0 + 1,
      daysLeft: tEnd - tNow + 1,
      checkins: list,
      latest: latest,
      points: points,
      tierNow: tierFor(points, s.tiers),
      target: s.target,
      targetName: tierName(s.target),
      targetPoints: targetPoints,
      quality: quality(list, s.reqs),
    };

    if (targetPoints === null) {
      out.status = 'setup';
      return out;
    }

    var req = requirement(points, targetPoints, out.daysLeft, s);
    for (var k in req) out[k] = req[k];
    out.reached = points >= targetPoints;

    if (!latest) {
      out.status = 'nodata';
      return out;
    }

    var tLatest = dayNumber(latest.date);
    var elapsedAtLatest = tLatest - t0 + 1;
    var pace = points / elapsedAtLatest; // points per calendar day so far
    var daysAfterLatest = tEnd - tLatest;
    out.elapsedAtLatest = elapsedAtLatest;
    out.pacePerDay = pace;
    out.projected = Math.round(points + pace * daysAfterLatest);
    out.projectedTier = tierFor(out.projected, s.tiers);
    out.evenPace = targetPoints * elapsedAtLatest / period.totalDays;
    out.vsEven = Math.round(points - out.evenPace);
    out.early = elapsedAtLatest < 7;

    if (out.reached) {
      var first = null;
      for (var i = 0; i < list.length; i++) {
        if (list[i].points >= targetPoints) { first = list[i]; break; }
      }
      out.reachDate = first.date;
    } else if (pace > 0) {
      var reachIso = addDays(latest.date, Math.ceil((targetPoints - points) / pace - 1e-9));
      out.reachDate = reachIso <= period.end ? reachIso : null;
    } else {
      out.reachDate = null;
    }

    if (out.reached) {
      out.status = 'reached';
      var next = tierAbove(s.target, s.tiers);
      if (next && points < s.tiers[next]) {
        out.stretch = requirement(points, s.tiers[next], out.daysLeft, s);
        out.stretch.tier = next;
        out.stretch.tierName = tierName(next);
      }
    } else {
      out.status = out.projected >= targetPoints ? 'ontrack' : 'behind';
      // The projection is rounded, so it can just meet the target while the
      // exact day lands a hair past the end. Call that the last day.
      if (out.status === 'ontrack' && !out.reachDate) out.reachDate = period.end;
    }
    return out;
  }

  /*
   * Finished periods, newest first, from the full check-in log.
   * meta maps a period start date to the {tiers, target} saved with it,
   * so a past period is judged by the numbers that applied at the time.
   */
  function pastPeriods(allCheckins, cycle, today, meta, fallbackSettings) {
    var current = periodFor(today, cycle).start;
    var groups = {};
    sortCheckins(allCheckins).forEach(function (c) {
      if (c.date > today) return;
      var p = periodFor(c.date, cycle);
      if (p.start === current) return;
      (groups[p.start] = groups[p.start] || { period: p, list: [] }).list.push(c);
    });
    var fb = normalizeSettings(fallbackSettings);
    return Object.keys(groups).sort().reverse().map(function (start) {
      var g = groups[start];
      var m = meta && meta[start] ? normalizeSettings(meta[start]) : fb;
      var finalPoints = g.list[g.list.length - 1].points;
      var goal = m.tiers[m.target];
      return {
        period: g.period,
        finalPoints: finalPoints,
        checkins: g.list.length,
        tier: tierFor(finalPoints, m.tiers),
        target: m.target,
        targetName: tierName(m.target),
        hitTarget: goal === null ? null : finalPoints >= goal,
      };
    });
  }

  return {
    TIERS: TIERS,
    CYCLES: CYCLES,
    MONTHS: MONTHS,
    DEFAULT_SETTINGS: DEFAULT_SETTINGS,
    toISO: toISO,
    parseISO: parseISO,
    isISODate: isISODate,
    dayNumber: dayNumber,
    addDays: addDays,
    localToday: localToday,
    fmtDate: fmtDate,
    periodFor: periodFor,
    normalizeSettings: normalizeSettings,
    normalizeCheckin: normalizeCheckin,
    sortCheckins: sortCheckins,
    upsertCheckin: upsertCheckin,
    removeCheckin: removeCheckin,
    tierName: tierName,
    tierFor: tierFor,
    tierAbove: tierAbove,
    requirement: requirement,
    plan: plan,
    pastPeriods: pastPeriods,
  };
});
