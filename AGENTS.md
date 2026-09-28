# Agent guide

This file is read by coding agents (Codex, Copilot, Claude and others). Follow it without being
reminded. Human contributors: see `CONTRIBUTING.md`.

## Project

MatchPlanner is a static PWA for fair substitutions in Swedish youth football. Vanilla TypeScript,
no runtime dependencies. The UI text is Swedish.

- `src/core/` holds all logic: no DOM, fully unit tested in `tests/`.
- `src/ui/` renders and wires events. All UI sentences live in `src/ui/text.ts`.
- `e2e/` holds Playwright tests, only for what a unit test cannot see.

## Commands

```sh
npm run check       # biome
npm run typecheck
npm run test:coverage   # unit tests with the coverage thresholds CI enforces
npm run build
npm run test:e2e    # needs: npx playwright install chromium
```

Run all of them before you push.

## How to work here

1. **Never work in the main checkout.** It stays on `main`. Work in a git worktree under
   `.worktrees/` (already git-ignored):

   ```sh
   git fetch
   git worktree add .worktrees/<name> -b <first-branch> origin/main
   cd .worktrees/<name> && npm ci
   ```

2. **One worktree per stack**, not per branch. Git refuses to rebase a branch that is checked out
   in another worktree. Remove the worktree and its branches once the PRs merge.
3. **Ship as stacked PRs with `gh stack`** (GitHub stacked PRs). Split a change into small layers
   that each build on the one below, and put shared fixes in the lowest layer that needs them,
   because each PR's CI runs only its own layer.

   ```sh
   gh stack init <first-branch>     # once
   gh stack add <next-branch>       # start a new layer on top
   gh stack view
   gh stack submit                  # push and create or update the PRs
   gh stack rebase                  # after a lower PR merges
   ```

4. After GitHub rebases an upper branch on the server, its checks do not run. Rebase locally and
   push it yourself so CI runs: `git rebase --onto origin/main <old-lower-tip>`, then
   `git push --force-with-lease`.

## Commits and pull requests

- Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`), with `git commit -s` (a
  `Signed-off-by` trailer is required and checked in CI). Commits are SSH-signed.
- Write commits and PR descriptions as the human author. **Do not add** `Co-Authored-By` trailers,
  "Generated with ..." footers or any mention of AI authorship.
- Use `.github/pull_request_template.md`: explain the user-visible effect and list the validation
  commands you ran.
- Do not commit agent plans, specs or scratch files.
- Link the issue a PR closes with `Closes #N`.

## Rules for the code

- Every numeric limit is in `src/core/limits.ts`; every rotation rule is in `src/core/policy.ts`
  once it exists. Do not duplicate either.
- No module-level mutable state in `src/` (a test enforces it).
- Files a coach saves or loads are validated strictly; refuse bad input with a clear Swedish
  message instead of guessing.
