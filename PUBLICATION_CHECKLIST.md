# npm publication checklist

Prepared version: **0.2.0**. Package/CLI: **codevariability-js**.
A checked item records an executed check; unchecked items are required before
the first public release.

- [ ] Public source and selected behavior tests reviewed.
- [ ] README, API, metric, and release documentation reviewed.
- [ ] MIT license and original copyright preserved.
- [ ] Metadata, CommonJS exports, CLI, version, and file allowlist checked.
- [ ] Lockfile installation and known-vulnerability check passed.
- [ ] JavaScript syntax checks and independent tests passed.
- [ ] Node CI passed in the new repository.
- [ ] Clean npm package created and every tarball member inspected.
- [ ] Tarball installed into an empty npm project.
- [ ] CommonJS require, ESM default import, and installed CLI executed.
- [ ] README code and bundled example executed.
- [ ] New files checked for secrets, local paths, and internal materials.
- [ ] No research inputs, manuscript files, caches, or generated results included.
- [ ] New repository URLs verified with authenticated access.
- [ ] npm project-name existence checked; recheck ownership/version before upload.
- [ ] Make the GitHub repository public and verify links without authentication.
- [ ] Configure npm authentication or a trusted publisher for this new project.
- [ ] Choose the release date, publish, and verify installation from npm.

The package distributes JavaScript source directly; `npm run build` performs
syntax checks. See [docs/RELEASING.md](docs/RELEASING.md).
