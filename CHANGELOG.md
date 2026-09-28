# Changelog

All notable changes to this project are documented here, automatically, by
[release-please](https://github.com/googleapis/release-please).

## [0.6.0](https://github.com/aydabd/match-planner/compare/matchplanner-v0.5.0...matchplanner-v0.6.0) (2026-09-28)


### Features

* **clock:** match clock with periods as pure core logic ([#39](https://github.com/aydabd/match-planner/issues/39)) ([b25fcce](https://github.com/aydabd/match-planner/commit/b25fcce7f2893de00b2c79c74aaeb4778ee89d95))
* **goalkeepers:** pick goalkeepers, keep them in goal, change at breaks ([#42](https://github.com/aydabd/match-planner/issues/42)) ([797635f](https://github.com/aydabd/match-planner/commit/797635f119189b03773ce56ad16f9497a170d427))
* **match:** match clock with periods on the match screen ([#41](https://github.com/aydabd/match-planner/issues/41)) ([f5c85b9](https://github.com/aydabd/match-planner/commit/f5c85b92ff77f77b65839d3079d1141140127910))
* **storage:** squad file version 2 with match plan, goalkeepers and audit ([#40](https://github.com/aydabd/match-planner/issues/40)) ([d051d06](https://github.com/aydabd/match-planner/commit/d051d0667b4fa1a0079bf962f9bd45fa992fbc45))
* **swaps:** 30-second swap warning, one-by-one substitutions and a match timeline ([#43](https://github.com/aydabd/match-planner/issues/43)) ([712adad](https://github.com/aydabd/match-planner/commit/712adad89daa73d37e60453fe41e1a68c5ccebfe))

## [0.5.0](https://github.com/aydabd/match-planner/compare/matchplanner-v0.4.0...matchplanner-v0.5.0) (2026-09-28)


### Features

* **setup:** start over or clear all saved data; versioned offline cache ([#35](https://github.com/aydabd/match-planner/issues/35)) ([898f125](https://github.com/aydabd/match-planner/commit/898f1252564e16a6ea6dc820fc65839cb8f46561))

## [0.4.0](https://github.com/aydabd/match-planner/compare/matchplanner-v0.3.1...matchplanner-v0.4.0) (2026-09-28)


### Features

* **formations:** team sizes 5v5–11v11 with quick-pick and custom formations ([#26](https://github.com/aydabd/match-planner/issues/26)) ([7bb7097](https://github.com/aydabd/match-planner/commit/7bb7097e055c45f8e3340641fb588db9cad605e3))
* **setup:** choose team size and formation, including custom formations ([#27](https://github.com/aydabd/match-planner/issues/27)) ([9e33f65](https://github.com/aydabd/match-planner/commit/9e33f6596d9f3b28ff945847c79e82363a51c5e7))


### Bug Fixes

* **scheduler:** build lineups with exact matching so any formation works ([#25](https://github.com/aydabd/match-planner/issues/25)) ([9de7f5b](https://github.com/aydabd/match-planner/commit/9de7f5b061780cdca97eb21421fcfedacd961549))

## [0.3.1](https://github.com/aydabd/match-planner/compare/matchplanner-v0.3.0...matchplanner-v0.3.1) (2026-09-28)


### Bug Fixes

* **match:** restore temporary swaps correctly and unit-test match logic ([#16](https://github.com/aydabd/match-planner/issues/16)) ([ff67e52](https://github.com/aydabd/match-planner/commit/ff67e526bb56d886912258f5f6def482a3c6e5b7))
* **ui:** rest countdown, dark-mode contrast and labels; add Playwright e2e tests ([#17](https://github.com/aydabd/match-planner/issues/17)) ([72576f4](https://github.com/aydabd/match-planner/commit/72576f4e40ca8647f5f0085f7f61acf175c5150a))

## [0.3.0](https://github.com/aydabd/match-planner/compare/matchplanner-v0.2.2...matchplanner-v0.3.0) (2026-09-28)


### Features

* **ui:** redesign setup and match views for sideline use ([#8](https://github.com/aydabd/match-planner/issues/8)) ([2ae25ee](https://github.com/aydabd/match-planner/commit/2ae25ee6f71fa3c742f9e4f6a9ca94be3eb4ddc7))

## [0.2.2](https://github.com/aydabd/match-planner/compare/matchplanner-v0.2.1...matchplanner-v0.2.2) (2026-09-28)


### Bug Fixes

* **ci:** build once, tag after green, deploy the tested build ([#6](https://github.com/aydabd/match-planner/issues/6)) ([e790dd4](https://github.com/aydabd/match-planner/commit/e790dd44ebb9020d2054171c9172d31cd2e27a63))

## [0.2.1](https://github.com/aydabd/match-planner/compare/matchplanner-v0.2.0...matchplanner-v0.2.1) (2026-09-28)


### Bug Fixes

* **ui:** meet WCAG 2.1 AA contrast, focus, and motion requirements ([#4](https://github.com/aydabd/match-planner/issues/4)) ([16f348e](https://github.com/aydabd/match-planner/commit/16f348e2750b69b3ce1806fa8f22481dbb057f46))

## [0.2.0](https://github.com/aydabd/match-planner/compare/matchplanner-v0.1.0...matchplanner-v0.2.0) (2026-09-28)


### Features

* add match planner application ([351a618](https://github.com/aydabd/match-planner/commit/351a618d59e9b57ce752641ae76974e0b404e080))


### Bug Fixes

* configure Release Please signoff identity ([#3](https://github.com/aydabd/match-planner/issues/3)) ([148ead0](https://github.com/aydabd/match-planner/commit/148ead08955e5af5d2532944de876350b1848d4c))
* sign off Release Please commits ([#2](https://github.com/aydabd/match-planner/issues/2)) ([f1711b0](https://github.com/aydabd/match-planner/commit/f1711b06501ee42e481f3a590c0aca8fb7124403))

## 0.1.0

Initial scaffold: fair rotation scheduler (7v7), roster import/export,
PWA shell, CI/CD to GitHub Pages.
