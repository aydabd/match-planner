---
name: stacked-pr-workflow
description: Use when starting or changing anything in this repo that will become a pull request. Sets up a worktree under .worktrees/ and ships the work as GitHub stacked PRs with gh stack, with plain signed commits and PR text.
---

# Stacked PR workflow

The full rules are in `AGENTS.md` at the repo root. Short version:

1. `git fetch`, then `git worktree add .worktrees/<name> -b <first-branch> origin/main` and
   `npm ci`. Never edit the main checkout.
2. `gh stack init <first-branch>`, commit, then `gh stack add <next-branch>` for each further layer.
   One worktree holds the whole stack.
3. Before each layer is submitted: `npm run check && npm run typecheck && npm run test:coverage && npm run build`
   (and `npm run test:e2e` when the screens change).
4. Commit with `git commit -s`, Conventional Commit messages. No `Co-Authored-By`, no
   "Generated with" footer, no mention of AI in commits or PR text.
5. `gh stack submit`, then use `.github/pull_request_template.md` for each PR description and
   `Closes #N` for the issue it resolves.
6. If GitHub rebases an upper branch on the server, its CI does not run: rebase locally and
   force-push with lease.
7. When the PRs have merged, remove the worktree and its branches.
