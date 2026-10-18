# Crelo's pinned Pullfrog security patch

This is a maintenance fork, not an official Pullfrog release. The MIT license
and upstream attribution are unchanged. The action runtime remains upstream code.

## Base and patch

- Upstream: `pullfrog/pullfrog` commit `918f88ee80c3bb54f55c1d328ce32e7a54e5a5b4`.
- Update `@toon-format/toon` to exact `2.3.1` (GHSA-p95v-992w-h6c3).
- Override only `@actions/http-client>undici` to exact `6.28.1`. This removes
  the obsolete Undici 5 / Busboy 2 graph and its published advisories.
- Regenerate the frozen lock with the exact, integrity-pinned package manager
  declared in `package.json`. No install lifecycle scripts are needed.
- Add local-only HTTP/CONNECT proxy compatibility and TOON prototype-key tests.
- Make the CI consistency tests validate this standalone repository's shipped
  workflow with explicit permission, timeout, matrix and environment contracts,
  instead of reading an unavailable parent monorepo file. No tests are skipped
  or relaxed to accept a failing runtime.

## Execution contract

Consumers must reference a **full commit SHA**, set `PULLFROG_FORCE_LOCAL_CLI: "1"`,
and use GitHub-hosted Node 24 runners. Otherwise the upstream bootstrap may run
an npm semver range instead of this patched source and frozen dependency graph.
Installation is `corepack pnpm install --frozen-lockfile --ignore-scripts`.

For PR-review-only use, set `push: disabled` and `shell: restricted`, disable
automatic fixes/merges in the repository console, and retain the post action
needed to refresh/clean up the existing ChatGPT subscription credential.
Do not copy subscription credentials to source or GitHub Actions secrets.

This fork's own GitHub Actions are disabled: inherited publishing and paid
multi-provider integration workflows are not part of the maintenance fork.
The portfolio consumes it only as a pinned action; fork installation grants
no new GitHub App or model-provider access.

## Validation and maintenance

Run in a credential-free environment with Node 24:

```sh
corepack pnpm install --frozen-lockfile --ignore-scripts
corepack pnpm typecheck
corepack pnpm test --run
corepack pnpm build
node scripts/check-entrypoint-imports.ts
node scripts/check-secret-commands.ts
corepack pnpm audit
```

The default unit suite contains upstream platform-conditional tests; catalog
drift checks and real multi-provider AI integration tests are separate and are
not evidence of successful ChatGPT PR review. Verify an authorized real PR
review separately before resuming the consumer workflow.

An audit with zero known advisories is a dated dependency check, not a guarantee
of complete security. Before changing the consumer pin, compare the full fork
diff to upstream, rerun all gates, independently review it, and verify runner
proof, restricted shell, read-only pushes, credential write-back and PR output.
On an unresolved security or credential failure, pause the consumer workflow;
do not roll back to a vulnerable runtime or disable isolation to make it work.
