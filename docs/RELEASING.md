# Releasing the npm package

Version 0.2.0 was first published on 2026-10-03 from this independent repository.
The historical adapter metadata says 0.1.0 but its current source already uses
v2 parsing/normalization and metric IDs. The new 0.2.0 release makes that
behavior and the independent repository explicit without inventing past npm
releases.

1. Confirm that the repository is public and verify README links,
   repository/homepage/bugs URLs, authorship,
   license, package ownership, and version availability.
2. Update package.json and package-lock.json versions together. Update
   CHANGELOG and the publication checklist. Metric definition changes also
   require updated versioned IDs, independent of the package version.
3. From a clean checkout run `npm ci`, `npm run build`, `npm test`, and
   `npm audit --omit=dev --audit-level=low`.
4. Run `npm pack --dry-run`, then `npm pack`. Inspect the actual tarball:
   package metadata, README, license, changelog, and only `src/` and `bin/`
   should be present. Test files and repository maintenance files stay out.
5. Install the tarball into an empty npm project. Run the API example, installed
   CLI, and test an ESM default import of the CommonJS package.
6. Recheck the name/version immediately before publishing. Authenticate with
   npm locally or configure an npm trusted publisher for this repository.
   Credentials and local `.npmrc` files must never enter Git.
7. For the first release, publish the inspected tarball with
   `npm publish <tarball> --access public` after interactive login and 2FA.
   npm requires an existing package before configuring a trusted publisher.
8. Configure the npm trusted publisher: owner `otaviouss`, repository
   `codevariability-js`, workflow filename `release.yml`, environment `npm`.
   Future releases dispatch `.github/workflows/release.yml` from `main` with
   `publish=true`. With `publish=false`, it validates and builds only.
   Only the isolated publishing job has `id-token: write`; ordinary CI does
   not publish. Use GitHub-hosted runners and npm CLI 11.5.1+.
9. Verify registry integrity and a fresh installation before creating the
   matching GitHub release. Never commit local npm credentials.

For npm trusted publishing use the requirements documented by npm (currently
npm CLI 11.5.1+ and Node 22.14.0+). A trusted publisher requires explicit
configuration in the registry. See
https://docs.npmjs.com/trusted-publishers/ for the current procedure.

Validate this candidate on Node 18, 22, and 24, including original, adversarial,
and regression suites and fresh installations of the actual tarball. Source
normalization IDs changed to v3 before the first publication; formula IDs stay
v2. Version 0.2.0 is published; subsequent changes require a new package version.
