# Scheduling and capacity model

CronCrowd is a forward-looking capacity simulation, not a scheduler or a production monitoring service. It never executes commands or changes another scheduler.

## Matching

Five fields are minute (0–59), hour (0–23), day of month (1–31), month (1–12), and day of week (0–7; 0 and 7 both mean Sunday). Lists, non-wrapping ranges, and steps are accepted. Month and weekday fields accept three-letter names, case-insensitively. A value with a step, such as `10/20`, spans from that value to the end of its field.

`*/n` steps reset inside their field. For example, `*/40 * * * *` means minutes 0 and 40 of each hour, with a 20-minute gap across the hour boundary; it is not an elapsed interval of 40 minutes.

When both day fields are restricted, either may match. If either begins with `*`, including a stepped wildcard, both must match. This follows the [Cronie/Vixie matching rule](https://github.com/cronie-crond/cronie/blob/master/man/crontab.5) and its wildcard flags; the ordering of mixed wildcard lists can therefore matter. Unsupported dialects are rejected rather than guessed.

Calendar aliases: `@yearly`, `@annually`, `@monthly`, `@weekly`, `@daily`, `@midnight`, and `@hourly`.

## Time zones and DST

Each candidate UTC minute is converted using the runtime's `Intl.DateTimeFormat` and its IANA timezone database, then tested against the cron fields. Gaps during spring transitions have no matching UTC instant. During a fall fold, both UTC instants representing a repeated local minute match. The current release deliberately uses this wall-clock policy; it does not emulate every daemon's daylight-saving compensation behavior. Verify the target scheduler's policy independently.

Timezone database changes can change far-future results. Use the same runtime and an explicit start timestamp for reproducible reviews. Charts display UTC; jobs match in their individual configured zones.

## Execution intervals

Each run occupies `[start, end)`, with `end = start + durationMinutes`. A run ending at 02:10 and another starting at 02:10 do not overlap. `delayMinutes` is an elapsed launch delay after the matching UTC minute, not a rewrite of the cron expression. Work launched before the window is included when its interval intersects the window.

The simulation scans enough history to cover the longest allowed duration plus delay for each job. Each start is counted as a new launch only if it begins inside the window; earlier launches are reported separately as carried-in work.

## Capacity

Every active instance contributes its weight. Overload occurs when total weight exceeds configured capacity by more than a small floating-point tolerance. Equal demand and capacity is within capacity. Self-overlapping instances contribute separately. Hourly heatmap cells use the maximum load in the corresponding hour; histogram bins use the maximum in each 30-minute interval.

Weights must share a meaningful unit. The model has no resource feedback, queue, cancellation, retry, lock, or missed-start behavior. Actual execution duration and start jitter may change the real overlap pattern.

## Limits

- 1–100 jobs, 1–31 whole days per simulation.
- Durations: 1–1440 whole minutes; launch delays: 0–1440 whole minutes.
- Weights: 0.1–1000; capacity: 0.1–100000, both may be fractional.
- At most 200000 run intervals intersecting the window, including carry-in.
- Imported JSON files are limited to 1 MB by the CLI and UI.
- Start timestamps need an explicit offset; the start is rounded upward to the next minute.
- No starts inside a window is a window-level observation, not proof of an impossible expression.

JSON exports include each interval's scheduled time, delayed start, end, weight, and carry-in flag. They omit full minute arrays to keep reports smaller.
