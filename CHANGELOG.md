# Changelog

All notable changes to this project are documented here, automatically, by
[release-please](https://github.com/googleapis/release-please).

## [0.27.1](https://github.com/aydabd/match-planner/compare/matchplanner-v0.27.0...matchplanner-v0.27.1) (2026-10-09)


### Bug Fixes

* leave time in goal out of the standing over a period ([#183](https://github.com/aydabd/match-planner/issues/183)) ([8df41c8](https://github.com/aydabd/match-planner/commit/8df41c8fab0e606abd96736a2747d7dfc3b66074))

## [0.27.0](https://github.com/aydabd/match-planner/compare/matchplanner-v0.26.0...matchplanner-v0.27.0) (2026-10-09)


### Features

* compute each player's standing over a chosen period ([#176](https://github.com/aydabd/match-planner/issues/176)) ([1fab2a2](https://github.com/aydabd/match-planner/commit/1fab2a293bc19fd95450078ab34e2d15cd5c5c51))
* plan matches with limited swaps and find rule deviations ([#177](https://github.com/aydabd/match-planner/issues/177)) ([860f1f3](https://github.com/aydabd/match-planner/commit/860f1f31fddb9c3905d9964e99b168121fea167a))
* play matches with limited swaps and explain deviations ([#179](https://github.com/aydabd/match-planner/issues/179)) ([f0baf43](https://github.com/aydabd/match-planner/commit/f0baf43ffad11595df8a697e94cc4e41b9ecdc7e))
* say which substitution rules apply where, quoting SvFF's rules ([#174](https://github.com/aydabd/match-planner/issues/174)) ([2a577e7](https://github.com/aydabd/match-planner/commit/2a577e73a0b2961164ee8b2abb8332f0cc34f386))
* set substitution rules and see the proposal before a match ([#178](https://github.com/aydabd/match-planner/issues/178)) ([719e545](https://github.com/aydabd/match-planner/commit/719e545573bf4cd03978639a9f81c02fcf049eef))
* store substitution rules for the team and each match ([#175](https://github.com/aydabd/match-planner/issues/175)) ([f6f39bc](https://github.com/aydabd/match-planner/commit/f6f39bca588fdf48b0404c27598c661594e1de3a))

## [0.26.0](https://github.com/aydabd/match-planner/compare/matchplanner-v0.25.0...matchplanner-v0.26.0) (2026-10-07)


### Features

* take players off by time in a row, lighter for defenders ([#170](https://github.com/aydabd/match-planner/issues/170)) ([9847583](https://github.com/aydabd/match-planner/commit/9847583f8a1542877cbaad9f2695ff4b956b4446))

## [0.25.0](https://github.com/aydabd/match-planner/compare/matchplanner-v0.24.0...matchplanner-v0.25.0) (2026-10-07)


### Features

* show total rest time and drop the short and long rest warnings ([#168](https://github.com/aydabd/match-planner/issues/168)) ([ec1893f](https://github.com/aydabd/match-planner/commit/ec1893f42206544dae55a893ee8fc0d6360419b9))

## [0.24.0](https://github.com/aydabd/match-planner/compare/matchplanner-v0.23.0...matchplanner-v0.24.0) (2026-10-02)


### Features

* **ui:** add Data to the menu and drop the start header link ([#162](https://github.com/aydabd/match-planner/issues/162)) ([7442f2e](https://github.com/aydabd/match-planner/commit/7442f2e8a202e3a131ad79f3693543aec20eb144))
* **ui:** replace the emoji brand with a drawn mark ([#163](https://github.com/aydabd/match-planner/issues/163)) ([61357b3](https://github.com/aydabd/match-planner/commit/61357b3ee22d5f081bfba41371e80c6b2a3fb281))

## [0.23.0](https://github.com/aydabd/match-planner/compare/matchplanner-v0.22.0...matchplanner-v0.23.0) (2026-10-02)


### Features

* **core:** classify, unlock and place imported files ([#155](https://github.com/aydabd/match-planner/issues/155)) ([25c3b9f](https://github.com/aydabd/match-planner/commit/25c3b9f659d3d07833faf4b5c30007376eb63ed9))
* **ui:** add a Data page and move import, export and Drive onto it ([#156](https://github.com/aydabd/match-planner/issues/156)) ([4f0c527](https://github.com/aydabd/match-planner/commit/4f0c5277b213821885d33b18613a236e09f04fa7))
* **ui:** fetch the start page squad through the shared importer ([c7ed8c2](https://github.com/aydabd/match-planner/commit/c7ed8c23047c290eca39a41a155081b0efb77032))
* **ui:** import any file or folder on the Data page ([#158](https://github.com/aydabd/match-planner/issues/158)) ([700a563](https://github.com/aydabd/match-planner/commit/700a563a94f1e9430bcc828226be4082617953a6))
* **ui:** use the shared importer for the start page squad ([#159](https://github.com/aydabd/match-planner/issues/159)) ([c7ed8c2](https://github.com/aydabd/match-planner/commit/c7ed8c23047c290eca39a41a155081b0efb77032))

## [0.22.0](https://github.com/aydabd/match-planner/compare/matchplanner-v0.21.0...matchplanner-v0.22.0) (2026-10-02)


### Features

* **ui:** add a Content-Security-Policy to every built page ([#151](https://github.com/aydabd/match-planner/issues/151)) ([e2f66ae](https://github.com/aydabd/match-planner/commit/e2f66aedf47b5a7c42ca830169e5a77aef18ddf2))


### Bug Fixes

* **ui:** let teams with different passwords share one Drive root ([#149](https://github.com/aydabd/match-planner/issues/149)) ([f03fd76](https://github.com/aydabd/match-planner/commit/f03fd76b2f67883051ad584c3d889f87731757fd))
* **ui:** refuse Drive ids and files that could harm a request ([#148](https://github.com/aydabd/match-planner/issues/148)) ([1cec75a](https://github.com/aydabd/match-planner/commit/1cec75abf5ceaff698706e8be2e9c71dc50ae59d))

## [0.21.0](https://github.com/aydabd/match-planner/compare/matchplanner-v0.20.0...matchplanner-v0.21.0) (2026-10-02)


### Features

* **core:** name team subfolders and choose which one to restore ([#143](https://github.com/aydabd/match-planner/issues/143)) ([e61f7dd](https://github.com/aydabd/match-planner/commit/e61f7ddc28cee21d2d61208390dcb09db037ff75))
* **ui:** keep each team in its own subfolder of one Drive root folder ([#144](https://github.com/aydabd/match-planner/issues/144)) ([2dd8da4](https://github.com/aydabd/match-planner/commit/2dd8da447a0f61178eeeae335db43979924ab07b))

## [0.20.0](https://github.com/aydabd/match-planner/compare/matchplanner-v0.19.0...matchplanner-v0.20.0) (2026-10-01)


### Features

* **core:** add team-bound Drive payloads, a notes merge and withTeamIdChanged ([#138](https://github.com/aydabd/match-planner/issues/138)) ([19c27ba](https://github.com/aydabd/match-planner/commit/19c27bad5a968f23b902a4e1364e693fc1a43533))
* **core:** deterministic UUIDv5 Drive file names per team ([#137](https://github.com/aydabd/match-planner/issues/137)) ([4253205](https://github.com/aydabd/match-planner/commit/425320521777b5e508b746fb33bfe36bcaa6fa38))
* **ui:** sync matches, squad and notes with team-bound Drive files ([#139](https://github.com/aydabd/match-planner/issues/139)) ([89f722c](https://github.com/aydabd/match-planner/commit/89f722c101077a088b5bc227b7b3c4f6263b7f0b))

## [0.19.0](https://github.com/aydabd/match-planner/compare/matchplanner-v0.18.0...matchplanner-v0.19.0) (2026-10-01)


### Features

* **ui:** add a secondary nav across the statistics pages ([#132](https://github.com/aydabd/match-planner/issues/132)) ([f633b3b](https://github.com/aydabd/match-planner/commit/f633b3b3a80888617314e55cfe980a907ef38785))
* **ui:** split statistics into statistics, season report and player notes pages ([#131](https://github.com/aydabd/match-planner/issues/131)) ([032c1e2](https://github.com/aydabd/match-planner/commit/032c1e2691a22c110da8cbaaa7cae8711ed81343))

## [0.18.0](https://github.com/aydabd/match-planner/compare/matchplanner-v0.17.2...matchplanner-v0.18.0) (2026-10-01)


### Features

* **core:** add teams.ts for the team/squad data boundary ([#123](https://github.com/aydabd/match-planner/issues/123)) ([4c21a64](https://github.com/aydabd/match-planner/commit/4c21a6414091619403cdcdb3111df586216735c0))
* **ui:** add a team switcher to the shared header ([#126](https://github.com/aydabd/match-planner/issues/126)) ([b45b17f](https://github.com/aydabd/match-planner/commit/b45b17fd6fc3c2caa8d2377715d6817e501ba6e1))
* **ui:** add teamScoped() and a teamStorage wrapper ([#124](https://github.com/aydabd/match-planner/issues/124)) ([4c7af3b](https://github.com/aydabd/match-planner/commit/4c7af3be8bab5bdbde51daf92937a05bfd188ed1))


### Bug Fixes

* **ui:** scope per-team storage to the active team ([#125](https://github.com/aydabd/match-planner/issues/125)) ([4688661](https://github.com/aydabd/match-planner/commit/468866146280b756d9ad48f6600c914c3071ae35))

## [0.17.2](https://github.com/aydabd/match-planner/compare/matchplanner-v0.17.1...matchplanner-v0.17.2) (2026-09-30)


### Bug Fixes

* **ui:** let a coach undo a checkpoint level marked by mistake ([#121](https://github.com/aydabd/match-planner/issues/121)) ([2a4ab8f](https://github.com/aydabd/match-planner/commit/2a4ab8f5ada0c38e95ea92f7c3cc4e326fbb8e46))

## [0.17.1](https://github.com/aydabd/match-planner/compare/matchplanner-v0.17.0...matchplanner-v0.17.1) (2026-09-30)


### Bug Fixes

* **ui:** anchor the Drive folder picker to the viewport ([#116](https://github.com/aydabd/match-planner/issues/116)) ([f9dd95e](https://github.com/aydabd/match-planner/commit/f9dd95ea6ccafb43a1d661da66067924503452ee))

## [0.17.0](https://github.com/aydabd/match-planner/compare/matchplanner-v0.16.0...matchplanner-v0.17.0) (2026-09-29)


### Features

* **core:** add development checkpoint mechanism ([#110](https://github.com/aydabd/match-planner/issues/110)) ([ed5e6f1](https://github.com/aydabd/match-planner/commit/ed5e6f1dbad7b60f5f6aaec4b339b4ba47a6ac86))
* **core:** record checkpoint progress in player notes and season report ([#111](https://github.com/aydabd/match-planner/issues/111)) ([2f071da](https://github.com/aydabd/match-planner/commit/2f071daf71180ac9c789b937cd4fc7e21f74923d))
* **ui:** checkpoint ladders in player notes, season report and översikt ([#112](https://github.com/aydabd/match-planner/issues/112)) ([2c69303](https://github.com/aydabd/match-planner/commit/2c6930353cd97f274768bfa9770c5c2538b4b191))

## [0.16.0](https://github.com/aydabd/match-planner/compare/matchplanner-v0.15.1...matchplanner-v0.16.0) (2026-09-29)


### Features

* **github:** add issue templates and issue-based workflow ([#107](https://github.com/aydabd/match-planner/issues/107)) ([8a3403c](https://github.com/aydabd/match-planner/commit/8a3403c5a737aaf35f48e02b5587e05bbf38124e))

## [0.15.1](https://github.com/aydabd/match-planner/compare/matchplanner-v0.15.0...matchplanner-v0.15.1) (2026-09-29)


### Bug Fixes

* **ui:** stop the header nav wrapping into a squeezed sidebar ([#105](https://github.com/aydabd/match-planner/issues/105)) ([149df34](https://github.com/aydabd/match-planner/commit/149df34ca6a3800705948a5fd29b1148dc1dd69f))

## [0.15.0](https://github.com/aydabd/match-planner/compare/matchplanner-v0.14.0...matchplanner-v0.15.0) (2026-09-29)


### Features

* **pages:** move player history and statistics onto /statistics/ ([#100](https://github.com/aydabd/match-planner/issues/100)) ([214ab0c](https://github.com/aydabd/match-planner/commit/214ab0c43a9db7dba50c47742c7007446fcb80fa))
* **pages:** move the live match onto its own /match/ page ([#101](https://github.com/aydabd/match-planner/issues/101)) ([4882ec9](https://github.com/aydabd/match-planner/commit/4882ec9bd8b195e227d1575770d73ff0e97bba64))
* **pages:** move the match report onto its own /report/ page ([#98](https://github.com/aydabd/match-planner/issues/98)) ([dc7cf45](https://github.com/aydabd/match-planner/commit/dc7cf4505784eb0ebe80182821d4e304d26ea8ba))
* **pages:** move the policy explanation onto its own /about/ page ([#99](https://github.com/aydabd/match-planner/issues/99)) ([fbd8e73](https://github.com/aydabd/match-planner/commit/fbd8e7384d92f4dd01c085dfb01518dd0ed99929))
* **pages:** scaffold multi-entry build for the five real page URLs ([#95](https://github.com/aydabd/match-planner/issues/95)) ([a746a92](https://github.com/aydabd/match-planner/commit/a746a924438c27a283ade6bab4e8b3a0c148e0b2))
* **pages:** wire the start page onto the shared page bootstrap ([#96](https://github.com/aydabd/match-planner/issues/96)) ([f7b53f8](https://github.com/aydabd/match-planner/commit/f7b53f87ec49e2bc3051711b1941a5725fa9bb27))


### Bug Fixes

* **pages:** remove dead placeholder code and fix the e2e path filter ([#102](https://github.com/aydabd/match-planner/issues/102)) ([325372a](https://github.com/aydabd/match-planner/commit/325372aa26d58fb20774abe04df627b9abf602c9))

## [0.14.0](https://github.com/aydabd/match-planner/compare/matchplanner-v0.13.0...matchplanner-v0.14.0) (2026-09-29)


### Features

* **history:** encrypt the combined export and the season report download ([#92](https://github.com/aydabd/match-planner/issues/92)) ([7b69077](https://github.com/aydabd/match-planner/commit/7b69077d73ed266a83b1058869b4dbc55596c5de))

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
