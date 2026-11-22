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

  // Everything besides points that Uber Pro checks, in the Driver app's order.
  var CRITERIA = [
    { key: 'acceptance', label: 'Acceptance rate', short: 'Accept', unit: '%', dir: 'min', lo: 0, hi: 100 },
    { key: 'cancellation', label: 'Cancellation rate', short: 'Cancel', unit: '%', dir: 'max', lo: 0, hi: 100 },
    { key: 'rating', label: 'Star rating', short: 'Rating', unit: '', dir: 'min', lo: 1, hi: 5 },
    { key: 'insights', label: 'Driving Insights score', short: 'Insights', unit: '', dir: 'min', lo: 0, hi: 100 },
  ];

  // Which months an Uber Pro period starts in. 1 matches the Driver app as
  // of Nov 2026: Nov to Jan, Feb to Apr, May to Jul, Aug to Oct.
  var CYCLES = [
    { value: 1, label: 'Feb, May, Aug, Nov' },
    { value: 0, label: 'Jan, Apr, Jul, Oct' },
    { value: 2, label: 'Mar, Jun, Sep, Dec' },
  ];

  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  // A trip that starts or ends in extra-point hours earns this many points; others earn 1.
  var BONUS_POINTS = 3;

  // Extra-point hours from the Driver app (Nov 2026), per weekday (0 = Sunday),
  // as [startHour, endHour) with 24 meaning midnight.
  var DEFAULT_BONUS_HOURS = {
    0: [[0, 3], [9, 19], [21, 24]],
    1: [[7, 10], [15, 18], [21, 24]],
    2: [[7, 10], [15, 18], [21, 24]],
    3: [[7, 10], [15, 18], [21, 24]],
    4: [[7, 10], [15, 18], [21, 24]],
    5: [[0, 3], [7, 19], [21, 24]],
    6: [[0, 3], [9, 19], [21, 24]],
  };

  // Tier requirements as the Driver app listed them in Nov 2026. They vary by
  // city and Uber changes them, so the settings form lets the driver edit all of it.
  var DEFAULT_SETTINGS = {
    cycle: 1,
    target: 'platinum',
    currentStatus: null,
    daysPerWeek: 5,
    pointsPerTrip: 1,
    tiers: {
      gold: { points: 25, acceptance: 25, cancellation: 8, rating: 4.85, insights: 75 },
      platinum: { points: 400, acceptance: 70, cancellation: 4, rating: 4.85, insights: 85 },
      diamond: { points: 1000, acceptance: 70, cancellation: 4, rating: 4.85, insights: 85 },
    },
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

  function isTierKey(k) { return TIERS.some(function (t) { return t.key === k; }); }

  function normalizeTier(raw, legacyReqs, fallback) {
    // Older saves kept points as a bare number and one shared set of rate limits.
    if (typeof raw === 'number' || typeof raw === 'string') {
      raw = { points: raw, acceptance: legacyReqs.acceptance, cancellation: legacyReqs.cancellation, rating: legacyReqs.rating, insights: null };
    }
    if (!raw || typeof raw !== 'object') raw = fallback;
    var pts = num(raw.points);
    var out = { points: pts !== null && pts > 0 ? Math.round(pts) : null };
    CRITERIA.forEach(function (c) {
      var v = num(raw[c.key]);
      out[c.key] = v === null ? null : clamp(v, c.lo, c.hi);
    });
    return out;
  }

  function normalizeSettings(raw) {
    raw = raw && typeof raw === 'object' ? raw : {};
    var d = DEFAULT_SETTINGS;
    var tiersIn = raw.tiers && typeof raw.tiers === 'object' ? raw.tiers : d.tiers;
    var legacyReqs = raw.reqs && typeof raw.reqs === 'object' ? raw.reqs : {};
    var tiers = {};
    TIERS.forEach(function (t) {
      tiers[t.key] = normalizeTier(tiersIn[t.key], legacyReqs, raw.tiers ? { points: null } : d.tiers[t.key]);
    });
    var cycle = num(raw.cycle);
    var dpw = num(raw.daysPerWeek);
    var ppt = num(raw.pointsPerTrip);
    return {
      cycle: cycle === null ? d.cycle : ((Math.trunc(cycle) % 3) + 3) % 3,
      target: isTierKey(raw.target) ? raw.target : d.target,
      currentStatus: isTierKey(raw.currentStatus) || raw.currentStatus === 'blue' ? raw.currentStatus : null,
      daysPerWeek: dpw === null ? d.daysPerWeek : clamp(Math.round(dpw), 1, 7),
      pointsPerTrip: ppt === null || ppt <= 0 ? d.pointsPerTrip : Math.min(ppt, BONUS_POINTS),
      tiers: tiers,
    };
  }

  function normalizeCheckin(raw) {
    if (!raw || typeof raw !== 'object' || !isISODate(raw.date)) return null;
    var points = num(raw.points);
    if (points === null || points < 0) return null;
    var trips = num(raw.trips);
    var out = {
      date: raw.date,
      points: Math.round(points),
      trips: trips === null || trips < 0 ? null : Math.round(trips),
    };
    CRITERIA.forEach(function (c) {
      var v = num(raw[c.key]);
      out[c.key] = v === null || v < c.lo || v > c.hi ? null : v;
    });
    return out;
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

  function tierRank(key) {
    for (var i = 0; i < TIERS.length; i++) if (TIERS[i].key === key) return i + 1;
    return 0;
  }

  // Highest tier whose points are met, looking at points alone. 'blue' is the starting tier.
  function tierFor(points, tiers) {
    for (var i = TIERS.length - 1; i >= 0; i--) {
      var v = tiers[TIERS[i].key].points;
      if (v !== null && points >= v) return TIERS[i].key;
    }
    return 'blue';
  }

  // The next tier above `key` that has a points number set.
  function tierAbove(key, tiers) {
    for (var i = tierRank(key); i < TIERS.length; i++) {
      if (tiers[TIERS[i].key].points !== null) return TIERS[i].key;
    }
    return null;
  }

  // Does one stat meet one tier's limit? null when either side is unknown.
  function meets(crit, value, req) {
    if (value === null || value === undefined || req === null || req === undefined) return null;
    return crit.dir === 'min' ? value >= req : value <= req;
  }

  /*
   * Where the driver stands against every tier, like the table in the app.
   * stats: { points, acceptance, cancellation, rating, insights } (null = not entered).
   * A stat the driver hasn't entered doesn't block a tier; it is listed in `unknown`.
   */
  function standing(stats, tiers) {
    var rows = {};
    var best = 'blue';
    TIERS.forEach(function (t) {
      var req = tiers[t.key];
      var cells = { points: req.points === null ? null : stats.points >= req.points };
      var fails = [];
      var unknown = [];
      if (cells.points === false) fails.push('points');
      CRITERIA.forEach(function (c) {
        var ok = meets(c, stats[c.key], req[c.key]);
        cells[c.key] = ok;
        if (ok === false) fails.push(c.key);
        if (ok === null && req[c.key] !== null) unknown.push(c.key);
      });
      var qualifies = req.points !== null && fails.length === 0;
      rows[t.key] = { cells: cells, fails: fails, unknown: unknown, qualifies: qualifies };
      if (qualifies) best = t.key;
    });
    return { tier: best, rows: rows };
  }

  /* ---------- extra-point hours ---------- */

  function windowsFor(hours, day) {
    var list = hours && Array.isArray(hours[day]) ? hours[day] : [];
    return list.filter(function (w) { return Array.isArray(w) && w.length === 2 && w[0] < w[1]; })
      .slice().sort(function (a, b) { return a[0] - b[0]; });
  }

  /*
   * Is `minute` (minutes after midnight) on weekday `day` inside an
   * extra-point window? Windows that run into the next day are joined.
   * Returns { active, endDay, endHour } while active, or
   * { active: false, nextDay, nextHour, nextEndHour } with day offsets from `day`.
   */
  function bonusNow(day, minute, hours) {
    hours = hours || DEFAULT_BONUS_HOURS;
    var h = minute / 60;
    var today = windowsFor(hours, day);
    for (var i = 0; i < today.length; i++) {
      var w = today[i];
      if (h >= w[0] && h < w[1]) {
        var offset = 0, end = w[1];
        // Follow a window that ends at midnight into one that starts at midnight.
        while (end === 24 && offset < 7) {
          var next = windowsFor(hours, (day + offset + 1) % 7)[0];
          if (!next || next[0] !== 0) break;
          offset++;
          end = next[1];
        }
        return { active: true, endDay: offset, endHour: end % 24 === 0 && end === 24 ? 0 : end, endsAtMidnight: end === 24 };
      }
    }
    for (var o = 0; o < 8; o++) {
      var list = windowsFor(hours, (day + o) % 7);
      for (var j = 0; j < list.length; j++) {
        if (o > 0 || list[j][0] > h) return { active: false, nextDay: o, nextHour: list[j][0], nextEndHour: list[j][1] };
      }
    }
    return { active: false, nextDay: null };
  }

  function weeklyBonusHours(hours) {
    var total = 0;
    for (var d = 0; d < 7; d++) windowsFor(hours, d).forEach(function (w) { total += w[1] - w[0]; });
    return total;
  }

  /* ---------- the plan ---------- */

  // What it takes to get from `points` to `goal` in the days left.
  function requirement(points, goal, daysLeft, daysPerWeek, pointsPerTrip) {
    var needed = Math.max(0, goal - points);
    var drivingDaysLeft = Math.max(1, Math.round(daysLeft * daysPerWeek / 7));
    var tripsTotal = Math.ceil(needed / pointsPerTrip - 1e-9);
    // needed * 7 / days avoids the float error of dividing by days / 7
    var weekDivisor = Math.max(7, daysLeft);
    return {
      goal: goal,
      needed: needed,
      drivingDaysLeft: drivingDaysLeft,
      perDrivingDay: Math.ceil(needed / drivingDaysLeft),
      tripsTotal: tripsTotal,
      tripsPerDrivingDay: Math.ceil(tripsTotal / drivingDaysLeft),
      tripsAllBonus: Math.ceil(needed / BONUS_POINTS - 1e-9),
      tripsAllRegular: needed,
      perWeek: Math.ceil(needed * 7 / weekDivisor),
      tripsPerWeek: Math.ceil(tripsTotal * 7 / weekDivisor),
      perCalendarDay: needed / Math.max(1, daysLeft),
    };
  }

  function latestStats(checkins) {
    var stats = { points: checkins.length ? checkins[checkins.length - 1].points : 0 };
    CRITERIA.forEach(function (c) {
      stats[c.key] = null;
      for (var i = checkins.length - 1; i >= 0; i--) {
        if (checkins[i][c.key] !== null) { stats[c.key] = checkins[i][c.key]; break; }
      }
    });
    return stats;
  }

  // Average points per trip: from the latest check-in that has a trip count, else the setting.
  function tripMix(checkins, settings) {
    for (var i = checkins.length - 1; i >= 0; i--) {
      var c = checkins[i];
      if (c.trips && c.points > 0) {
        var avg = clamp(c.points / c.trips, 1, BONUS_POINTS);
        return {
          source: 'trips',
          avg: avg,
          trips: c.trips,
          points: c.points,
          date: c.date,
          // trips = regular + bonus and points = regular + 3 * bonus
          bonusTrips: clamp(Math.round((c.points - c.trips) / (BONUS_POINTS - 1)), 0, c.trips),
        };
      }
    }
    return { source: 'setting', avg: settings.pointsPerTrip };
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
    var stats = latestStats(list);
    var points = stats.points;
    var targetPoints = s.tiers[s.target].points;
    var mix = tripMix(list, s);

    var out = {
      today: today,
      settings: s,
      period: period,
      daysTotal: period.totalDays,
      daysElapsed: tNow - t0 + 1,
      daysLeft: tEnd - tNow + 1,
      checkins: list,
      latest: latest,
      stats: stats,
      points: points,
      mix: mix,
      tierNow: tierFor(points, s.tiers),
      target: s.target,
      targetName: tierName(s.target),
      targetPoints: targetPoints,
      keeping: s.currentStatus === s.target,
      standing: standing(stats, s.tiers),
    };
    out.blockers = out.standing.rows[s.target].fails;

    if (targetPoints === null) {
      out.status = 'setup';
      return out;
    }

    var req = requirement(points, targetPoints, out.daysLeft, s.daysPerWeek, mix.avg);
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
    var projStats = {};
    for (var key in stats) projStats[key] = stats[key];
    projStats.points = out.projected;
    out.projectedStanding = standing(projStats, s.tiers).tier;
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
      if (next && points < s.tiers[next].points) {
        out.stretch = requirement(points, s.tiers[next].points, out.daysLeft, s.daysPerWeek, mix.avg);
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
      var finalStats = latestStats(g.list);
      var goal = m.tiers[m.target].points;
      return {
        period: g.period,
        finalPoints: finalStats.points,
        checkins: g.list.length,
        tier: standing(finalStats, m.tiers).tier,
        target: m.target,
        targetName: tierName(m.target),
        hitTarget: goal === null ? null : finalStats.points >= goal,
      };
    });
  }

  return {
    TIERS: TIERS,
    CRITERIA: CRITERIA,
    CYCLES: CYCLES,
    MONTHS: MONTHS,
    DAYS: DAYS,
    BONUS_POINTS: BONUS_POINTS,
    DEFAULT_BONUS_HOURS: DEFAULT_BONUS_HOURS,
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
    tierRank: tierRank,
    tierFor: tierFor,
    tierAbove: tierAbove,
    standing: standing,
    bonusNow: bonusNow,
    weeklyBonusHours: weeklyBonusHours,
    requirement: requirement,
    plan: plan,
    pastPeriods: pastPeriods,
  };
});
