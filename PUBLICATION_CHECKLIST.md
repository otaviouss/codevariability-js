# npm publication checklist

Released version: **0.2.0**. Package/CLI: **codevariability-js**.
A checked item records an executed check; unchecked items are required before
the first public release.

- [x] Public source and selected behavior tests reviewed.
- [x] README, API, metric, and release documentation reviewed.
- [x] MIT license and original copyright preserved.
- [x] Metadata, CommonJS exports, CLI, version, and file allowlist checked.
- [x] Lockfile installation and known-vulnerability check passed.
- [x] JavaScript syntax checks and independent tests passed.
- [x] Run repository CI on the final remediated commit (Node 18, 22, and 24).
- [x] Clean npm package created and every tarball member inspected.
- [x] Tarball installed into an empty npm project.
- [x] CommonJS require, ESM default import, and installed CLI executed.
- [x] README code and bundled example executed.
- [x] New files checked for secrets, local paths, and internal materials.
- [x] No research inputs, manuscript files, caches, or generated results included.
- [x] New repository URLs verified with authenticated access.
- [x] npm project-name existence checked; recheck ownership/version before upload.
- [x] Make the GitHub repository public and verify links without authentication.
- [x] Publish with login/2FA and configure the GitHub Actions trusted publisher.
- [x] Publish 0.2.0 on 2026-10-03; verify registry bytes, fresh install, API, CLI, and dependencies.

The package distributes JavaScript source directly; `npm run build` performs
syntax checks. See [docs/RELEASING.md](docs/RELEASING.md).

Published package: https://www.npmjs.com/package/codevariability-js

GitHub release: https://github.com/otaviouss/codevariability-js/releases/tag/v0.2.0

Trusted publisher: owner `otaviouss`, repository `codevariability-js`,
workflow `release.yml`, environment `npm`. The first publication used 2FA;
OIDC is configured for subsequent versions.
