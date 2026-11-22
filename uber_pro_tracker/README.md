# Pro Points Planner

A phone-friendly tracker for Uber Pro drivers. It shows how many points you
still need for your target tier this quarter, and what that works out to per
driving day and per week.

## Why it doesn't sync with Uber

Uber has no public API for Uber Pro points or tier status. Its Driver API is
open only to approved partners, and it doesn't cover Uber Pro either. So the
planner uses numbers you copy from the Uber Pro screen in the Driver app. It
takes about ten seconds.

## What it does

- **Points to go**: your target tier's points minus your latest check-in.
- **Per driving day / per week**: the points left, spread across the days left
  in the period (today counts) at the number of days you drive each week.
  Trips are worked out from your average points per trip.
- **Pace and projection**: your points divided by the days so far, carried to
  the end of the period. It shows the day you'd reach your tier at that pace,
  and how far you are ahead of or behind an even pace.
- **Chart**: your check-ins, the projection, an even-pace line and each tier's
  threshold.
- **Status requirements**: your latest star rating, acceptance rate and
  cancellation rate against the limits you set.
- **Past periods**: where you finished each earlier period, judged by the tier
  points that applied then.

Tier points vary by city and Uber changes them, so you enter them yourself.
The rating (4.85) and cancellation (4%) limits come prefilled from Uber's help
pages. They changed in 2026 for some tiers, so check them against your app.

## Files

| File | What it is |
| --- | --- |
| `index.html` | The page. |
| `pro-math.js` | Date and points math. No DOM, so Node can test it. |
| `pro-math.test.js` | Tests: `node --test uber_pro_tracker/pro-math.test.js` |

## Running it

- **Hosted**: the published Claude Artifact saves your check-ins to your Claude
  account, private to you, so they follow you across devices.
- **Locally**: open `index.html` in a browser, keeping `pro-math.js` beside it.
  Your data stays in that browser's local storage.
