# Contributing

## Local workflow

```sh
npm ci
npm run check
npm run typecheck
npm test
npm run build
```

Use Conventional Commit messages, for example `fix: preserve fair rotation`. Every commit must
include a `Signed-off-by` trailer:

```sh
git commit -s -m "fix: preserve fair rotation"
```

Commits merged to `main` and release tags must also have a cryptographically verified signature.
Use an SSH or GPG signing key configured in GitHub, and keep the matching public key in
`.github/allowed_signers` for local verification.

## Pull requests

- Use a Conventional Commit-style PR title (`feat:`, `fix:`, `chore:`, and so on).
- Explain the user-visible effect and include the validation commands you ran.
- Keep changes focused and resolve all review threads.
- Do not bypass branch rulesets or commit-policy checks.

## Dependency updates

Renovate is the sole dependency-update service for this repository. It manages npm packages, mise,
GitHub Actions, and Renovate configuration. Do not add Dependabot configuration or manually
duplicate Renovate updates.
