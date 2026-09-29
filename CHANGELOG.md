# Changelog

All notable changes to this project are documented here, automatically, by
[release-please](https://github.com/googleapis/release-please).

## [0.13.0](https://github.com/aydabd/match-planner/compare/matchplanner-v0.12.0...matchplanner-v0.13.0) (2026-09-29)


### Features

* **history:** recognise players by a stable uuidv5 id, not their name ([#90](https://github.com/aydabd/match-planner/issues/90)) ([1f1d6af](https://github.com/aydabd/match-planner/commit/1f1d6afc7a5b484e31e17b57b3672387b3c20ff3))

## [0.12.0](https://github.com/aydabd/match-planner/compare/matchplanner-v0.11.0...matchplanner-v0.12.0) (2026-09-29)


### Features

* **core:** add WebCrypto-based secure package and UUIDv5 identity ([#85](https://github.com/aydabd/match-planner/issues/85)) ([4744ca2](https://github.com/aydabd/match-planner/commit/4744ca216542590cac1a2483359c756b969f8d86))
* **history:** pick a shared Drive folder and encrypt what's backed up ([#87](https://github.com/aydabd/match-planner/issues/87)) ([1b9c326](https://github.com/aydabd/match-planner/commit/1b9c326e8319ce7e140f364ee9abe4bcd5f9310a))


### Bug Fixes

* **ui:** back up and restore by listing the Drive folder ([#86](https://github.com/aydabd/match-planner/issues/86)) ([e611f05](https://github.com/aydabd/match-planner/commit/e611f05fa0443d54f4f75447c8cf44b1ae023b7f))

## [0.11.0](https://github.com/aydabd/match-planner/compare/matchplanner-v0.10.0...matchplanner-v0.11.0) (2026-09-29)


### Features

* **history:** add season report export ([#83](https://github.com/aydabd/match-planner/issues/83)) ([b2c9531](https://github.com/aydabd/match-planner/commit/b2c95316964fbb9aefbecf1bfaecaec3af26ec39))
* **history:** add season visualizations ([#82](https://github.com/aydabd/match-planner/issues/82)) ([f611b42](https://github.com/aydabd/match-planner/commit/f611b42d5ff60e0ce6aa12f94a8929df1787bad8))

## [0.10.0](https://github.com/aydabd/match-planner/compare/matchplanner-v0.9.0...matchplanner-v0.10.0) (2026-09-29)


### Features

* **setup:** allow half-minute rotation intervals ([#77](https://github.com/aydabd/match-planner/issues/77)) ([e4716d5](https://github.com/aydabd/match-planner/commit/e4716d52291bae2e2ffce61dd5f60811dad137c7))
* **setup:** let a coach pick their region, and flag policy overrides ([#78](https://github.com/aydabd/match-planner/issues/78)) ([cc0d8c0](https://github.com/aydabd/match-planner/commit/cc0d8c0f78506273065d6d029b768e539a616209)), closes [#69](https://github.com/aydabd/match-planner/issues/69)


### Bug Fixes

* **report:** don't count a keeper's guaranteed time against outfield fairness ([#79](https://github.com/aydabd/match-planner/issues/79)) ([9865124](https://github.com/aydabd/match-planner/commit/9865124244db433a2b54620117eef44aa4fbf2c4))

## [0.9.0](https://github.com/aydabd/match-planner/compare/matchplanner-v0.8.0...matchplanner-v0.9.0) (2026-09-29)


### Features

* **history:** let a coach record availability and development notes ([#67](https://github.com/aydabd/match-planner/issues/67)) ([aec94ba](https://github.com/aydabd/match-planner/commit/aec94ba9df2490693cbec04b33ac2225dbb47fc8)), closes [#58](https://github.com/aydabd/match-planner/issues/58)


### Bug Fixes

* **match:** don't record an inconsistent lineup on a period-break keeper change ([#75](https://github.com/aydabd/match-planner/issues/75)) ([4a356a2](https://github.com/aydabd/match-planner/commit/4a356a27ebb111c881148609999d5d580abbb0a3)), closes [#68](https://github.com/aydabd/match-planner/issues/68)

## [0.8.0](https://github.com/aydabd/match-planner/compare/matchplanner-v0.7.0...matchplanner-v0.8.0) (2026-09-29)


### Features

* **history:** a player-notes model for availability and development ([#65](https://github.com/aydabd/match-planner/issues/65)) ([b55c300](https://github.com/aydabd/match-planner/commit/b55c300c843724f0f7ad30862e20d46ad51b29c6))
* **history:** back up and restore match files via Google Drive ([#66](https://github.com/aydabd/match-planner/issues/66)) ([6df3fb2](https://github.com/aydabd/match-planner/commit/6df3fb248fc35b37ead3063a1c422c375d782e5e))
* **history:** plan Google Drive backup and restore of match files ([#61](https://github.com/aydabd/match-planner/issues/61)) ([f3c7c95](https://github.com/aydabd/match-planner/commit/f3c7c9520b9236edcdbd3a2a8e3793d303595906))
* **policy:** region-aware policy and a squad file's region ([#60](https://github.com/aydabd/match-planner/issues/60)) ([4f8f34e](https://github.com/aydabd/match-planner/commit/4f8f34e4b8c790b6cf8331ed219fcd8313f6ff46)), closes [#55](https://github.com/aydabd/match-planner/issues/55)

## [0.7.0](https://github.com/aydabd/match-planner/compare/matchplanner-v0.6.0...matchplanner-v0.7.0) (2026-09-28)


### Features

* **history:** match files and a season history for players ([#49](https://github.com/aydabd/match-planner/issues/49)) ([fb7f2c2](https://github.com/aydabd/match-planner/commit/fb7f2c212d15816d5d1ffaf32885528a42f9139d)), closes [#38](https://github.com/aydabd/match-planner/issues/38)
* **policy:** one policy source and a page that explains where the rules come from ([#47](https://github.com/aydabd/match-planner/issues/47)) ([26c9142](https://github.com/aydabd/match-planner/commit/26c9142bed4ef5d25fc6f1a58ce566965465c17b)), closes [#23](https://github.com/aydabd/match-planner/issues/23)
* **report:** post-match report with substitution deviation and fairness feedback ([#48](https://github.com/aydabd/match-planner/issues/48)) ([42ae148](https://github.com/aydabd/match-planner/commit/42ae14878cc068a7b318bfb80b57c4189fc503ac)), closes [#13](https://github.com/aydabd/match-planner/issues/13)
* **rest:** show and audit how long players rest on the bench ([#52](https://github.com/aydabd/match-planner/issues/52)) ([df93017](https://github.com/aydabd/match-planner/commit/df93017f03620a5a24fc061f556e846ac564b3c2))


### Bug Fixes

* **match:** the clock follows the device clock and survives a reload ([#51](https://github.com/aydabd/match-planner/issues/51)) ([3913cf0](https://github.com/aydabd/match-planner/commit/3913cf07fe3c92222aceabc074d0a74f656d80ce))
* **ui:** one footer with the version and copyright on every screen ([#53](https://github.com/aydabd/match-planner/issues/53)) ([c6b9f90](https://github.com/aydabd/match-planner/commit/c6b9f907175a9dfde69017019dfe34a412be0591))

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
