# Contributing

CronCrowd needs Node.js 20+ and has no runtime dependencies.

Run `node --test`, edit the pure core or web sources, run `node scripts/build.mjs`, and check `node scripts/build.mjs --check`. Keep the generated `web/index.html` in the same commit.

For schedule bugs, provide a minimal config, explicit timestamp, window length, runtime version, expected intervals, and the scheduler dialect you intend. Synthetic job names and schedules are enough; never include credentials or real commands.

Useful contribution areas: runtime distribution modeling, reviewed configuration importers, performance on many timezone groups, accessible timeline details, and additional translations. Discuss new scheduler dialects before implementing them so their day and DST policies remain explicit.

Keep the core deterministic and the UI usable from a single offline HTML file. Avoid telemetry, remote fonts, accounts, and hosted-service requirements.
