# End-to-end tests

Playwright tests that drive the built app the way a coach does: on a phone
(Pixel 7) and on a tablet, in Chromium.

```sh
npm run test:e2e                       # build, serve and run everything
npx playwright test --ui               # watch and debug interactively
npx playwright test --repeat-each=10   # check for flakiness before pushing
```

The suite runs on pull requests that change app code, the e2e suite,
build or runtime config, or dependencies (`src/`, `public/`, `e2e/`, any
page's `index.html`, `package*.json`, `mise.*`, `vite`/`playwright` config,
`tsconfig.json`). Other PRs (docs, rulesets, unit tests, workflows) skip it,
and the skipped **E2E** check still counts as passed. Release PRs (version
and changelog only) skip it too.

E2E runs only on pull requests. It is not repeated after merging or at
release: the `main` ruleset requires branches to be up to date, so `main`
gets exactly what passed here. CI builds with the GitHub Pages base path
(`/match-planner/`), the same configuration that ships. To do the same
locally, or to test a build you already made:

```sh
BASE_PATH=/match-planner/ npm run test:e2e
BASE_PATH=/match-planner/ npm run build
BASE_PATH=/match-planner/ E2E_USE_EXISTING_BUILD=1 npm run test:e2e
```

## What belongs here

Logic is unit-tested in `tests/`. It is faster and pinpoints failures. An
e2e test is only for what a unit test cannot see:

- the screen shows the right thing (lineup, clock, messages)
- buttons, forms and menus are wired to the right action
- data survives a reload, and files can be saved and loaded
- the page meets WCAG 2.1 A/AA (axe) in light and dark mode

If a check needs to reach into app internals to work, move the logic into
`src/core` and unit-test it instead. If something is hard to test from the
outside, fix the app: give it an accessible name, a label, or its own
element. Do not skip the test.

## Layout

```
e2e/
  fixtures.ts        test + expect: fresh context, fake clock, page objects
  pages/             one class per screen; methods say what the coach does
    SetupPage.ts
    MatchPage.ts
  support/squads.ts  test squad and the lineups the scheduler builds for it
  specs/             one file per user flow
```

## Rules that keep the suite fast and stable

- **Isolated tests.** Each test gets its own browser context, so its own
  `localStorage` and clock, and Playwright disposes of it afterwards. Tests
  share nothing and run fully in parallel.
- **No real waiting.** The fixtures install Playwright's fake clock; use
  `match.play(minutes)` to move match time. Never use `waitForTimeout`.
- **Auto-waiting assertions only.** Use `await expect(locator)...` (and the
  `toHaveInputValues` helper for input lists). Never compare text you read
  earlier.
- **Find elements like a user does.** Prefer roles and labels
  (`getByRole`, `getByLabel`) over CSS ids.
- **No transitions.** Tests run with reduced motion, so assertions and axe
  always see the final state.
- **Flaky means failing.** CI retries once only to detect flakiness, and
  `failOnFlakyTests` fails the run if a retry was needed.
