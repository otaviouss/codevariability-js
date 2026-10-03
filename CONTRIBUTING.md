# Contributing

Use Node.js 18 or later; a current supported Node release is preferable for
development. This CommonJS package distributes its source and has no
transpilation step.

```bash
npm ci
npm run build
npm test
node examples/basic.js
npm pack --dry-run
```

`npm run build` checks JavaScript syntax. Tests cover parsing, normalization,
metric definitions, rankings, cache behavior, errors, and output safety.
No Python checkout or installation is required.

Report bugs with Node/package versions, metric selection, expected behavior,
and minimal public inputs. Keep private source and credentials out of issues.
Pull requests should include relevant tests and update public documentation.
Changes to metric definitions or normalization need new versioned identifiers
and a migration note. See [docs/RELEASING.md](docs/RELEASING.md).
