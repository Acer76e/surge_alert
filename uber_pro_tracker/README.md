# Pro Points Planner

A phone-friendly tracker for Uber Pro drivers. It shows how many points you
still need for your target tier this period, what that works out to per
driving day and per week, and whether your other numbers qualify.

## Why it doesn't sync with Uber

Uber has no public API for Uber Pro points or tier status. Its Driver API is
open only to approved partners, and it doesn't cover Uber Pro either. So the
planner uses numbers you copy from **How Uber Pro works** in the Driver app
(Menu, then Uber Pro). It takes about ten seconds.

## What it does

- **Points to go**: your target tier's points minus your latest check-in, with
  the days left in the period (today counts).
- **What to drive**: points per driving day and per week, at the number of
  days you drive each week. Trips use your own mix of 1-point and 3-point
  trips, worked out from the points and trips you enter. It also shows the
  range: every trip in extra-point hours, or none.
- **Extra-point hours**: whether a trip right now earns 3 points, when the
  current window ends or the next one starts, and the weekly schedule.
- **Status requirements**: the same table as the app. Acceptance,
  cancellation, star rating, points and Driving Insights score, per tier,
  with the tier you'd hold if the period ended today. Status is the highest
  tier where you meet every requirement.
- **Pace and projection**: your points divided by the days so far, carried to
  the end of the period, and how far you are ahead of or behind an even pace.
- **Chart, check-in history and past periods.**

## Defaults

These come from the Driver app as of November 2026. They vary by city and
Uber changes them, so every value can be edited in settings.

| Tier | Accept | Cancel | Rating | Points | Insights |
| --- | --- | --- | --- | --- | --- |
| Gold | 25% | 8% | 4.85 | 25 | 75 |
| Platinum | 70% | 4% | 4.85 | 400 | 85 |
| Diamond | 70% | 4% | 4.85 | 1000 | 85 |

- Periods: Nov to Jan, Feb to Apr, May to Jul, Aug to Oct. Points reset each
  period, and what you earn in one period sets your status for the next.
- Points: 1 per trip, 3 for a trip that starts or ends in extra-point hours.
- Extra-point hours: Mon to Thu 7 to 10 AM, 3 to 6 PM, 9 PM to midnight.
  Friday 12 to 3 AM, 7 AM to 7 PM, 9 PM to midnight. Sat and Sun 12 to 3 AM,
  9 AM to 7 PM, 9 PM to midnight. The schedule is in `pro-math.js`
  (`DEFAULT_BONUS_HOURS`); it isn't editable in the page yet.

## Files

| File | What it is |
| --- | --- |
| `index.html` | The page. |
| `pro-math.js` | Dates, plan, requirements and extra-point hours. No DOM, so Node can test it. |
| `pro-math.test.js` | Tests: `node --test uber_pro_tracker/pro-math.test.js` |

## Running it

- **Hosted**: the published Claude Artifact saves your check-ins to your Claude
  account, private to you, so they follow you across devices.
- **Locally**: open `index.html` in a browser, keeping `pro-math.js` beside it.
  Your data stays in that browser's local storage.
