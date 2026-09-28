# Contributing

## Local workflow

```sh
npm ci
npm run check
npm run typecheck
npm run test:coverage   # unit tests with coverage thresholds
npm run build
npx playwright install chromium   # once
npm run test:e2e        # end-to-end tests, see e2e/README.md
```

Put logic in `src/core` and cover it with unit tests in `tests/`. Use e2e tests only for what a
unit test cannot see: what the screen shows, how it is wired, reloads and files, and accessibility.

Use Conventional Commit messages, for example `fix: preserve fair rotation`. Every commit must
include a `Signed-off-by` trailer:

```sh
git commit -s -m "fix: preserve fair rotation"
```

Commits merged to `main` and release tags must also have a cryptographically verified signature.
Use an SSH or GPG signing key configured in GitHub, and keep the matching public key in
`.github/allowed_signers` for local verification.

## Working with agents and stacked PRs

People and coding agents use the same flow: see `AGENTS.md` (work in a git worktree under
`.worktrees/`, ship stacked PRs with `gh stack`).

## Pull requests

- Use a Conventional Commit-style PR title (`feat:`, `fix:`, `chore:`, and so on).
- Explain the user-visible effect and include the validation commands you ran.
- Keep changes focused and resolve all review threads.
- Do not bypass branch rulesets or commit-policy checks.

## Dependency updates

Renovate is the sole dependency-update service for this repository. It manages npm packages, mise,
GitHub Actions, and Renovate configuration. Do not add Dependabot configuration or manually
duplicate Renovate updates.
