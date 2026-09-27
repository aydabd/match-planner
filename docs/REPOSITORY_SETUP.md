# Repository setup handoff

This repository keeps its desired GitHub governance state in `.github/config/` and
`.github/rulesets/`. Apply those files after pushing the initial commits; normal CI does not mutate
GitHub administration settings.

## Renovate is the only update bot

`renovate.json` owns npm, mise, GitHub Actions, and Renovate configuration updates. Do not enable
Dependabot or add `.github/dependabot.yml`; running both systems would create duplicate update
PRs and conflicting policy ownership.

## Apply settings with github-bootstrap

From this repository root, with `gh auth status` passing and the repository already pushed:

```sh
BOOTSTRAP="$HOME/git/aydabd/github-bootstrap/scripts/github-setup"
OWNER=aydabd
REPO=match-planner

"$BOOTSTRAP/setup-repo-settings.sh" \
  --owner "$OWNER" --repo "$REPO" \
  --settings-file "$PWD/.github/config/repo-settings.json"

"$BOOTSTRAP/setup-security-settings.sh" \
  --owner "$OWNER" --repo "$REPO" \
  --security-file "$PWD/.github/config/security-settings.json"

"$BOOTSTRAP/setup-labels.sh" \
  --owner "$OWNER" --repo "$REPO" \
  --label-file "$PWD/.github/config/labels-default.json" \
  --label-policy create-and-update
```

Configure the Actions settings from `.github/config/actions-settings.json` in the repository's
Settings → Actions → General page: enable Actions, require actions to be pinned to full-length
commit SHAs, use read-only default workflow permissions, and allow workflows to create/approve
pull requests only when the repository policy requires it.

## Apply rulesets

Run CI and the commit-policy workflow on a pull request once so GitHub has observed the exact
required check names. Then apply the branch ruleset with the bootstrap helper:

```sh
"$BOOTSTRAP/setup-ruleset.sh" \
  --owner "$OWNER" --repo "$REPO" \
  --ruleset-file "$PWD/.github/rulesets/branch-main.json" \
  --required-status-checks "Check,Signed-off-by trailers"
```

Apply `.github/rulesets/tags-semver.json` as a second tag-targeting ruleset using the GitHub
Rulesets API (the bootstrap helper's ruleset validator is branch-target specific):

```sh
gh api --method POST "repos/$OWNER/$REPO/rulesets" \
  --input "$PWD/.github/rulesets/tags-semver.json"
```

Verify that both rulesets are active and that the main-branch ruleset requires signed commits,
one approving review, resolved threads, linear history, squash merges, `Check`, and
`Signed-off-by trailers`. Keep a maintainer bypass only for repository recovery.

## GitHub Pages

In Settings → Pages, select **GitHub Actions** as the source. The existing `deploy.yml` runs the
reusable CI workflow first, builds with the repository base path, uploads the Pages artifact, and
deploys through the `github-pages` environment with OIDC. No application secret is required.

## Release Please

Pushes to `main` run release-please with `release-please-config.json` and
`.release-please-manifest.json`. Conventional Commits create or update the release PR; merging
that PR creates the version tag and GitHub release. Keep the release workflow's job-scoped write
permissions and do not add a second release workflow.
