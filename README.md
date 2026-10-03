# CodeVariability for JavaScript and TypeScript

`codevariability-js` compares the syntax structure of JavaScript, JSX,
TypeScript, TSX, and fenced Markdown code. It returns similarity matrices,
statistics, representative rankings, and JSON results without executing the
input programs. The package is JavaScript with a CommonJS API and a CLI;
TypeScript is a supported input language.

Version **0.2.0** is being prepared for the first release from this independent
repository. It preserves the v2 structural metric definitions of the source
implementation. The package is alpha and requires Node.js 18 or later.

## Installation

To use a checkout before the first npm release:

```bash
npm ci
node examples/basic.js
node bin/codevariability-js.js --version
```

After publication, install with `npm install codevariability-js`. The installed
CLI is `codevariability-js`. No Python installation is required.

## Quick start

This CommonJS example creates and cleans up its own inputs:

```javascript
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { analyzeFiles } = require("codevariability-js");

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "codevariability-example-"));
try {
  const left = path.join(directory, "left.js");
  const right = path.join(directory, "right.ts");
  fs.writeFileSync(left, "const total = a + b;", "utf8");
  fs.writeFileSync(right, "const value = x - y;", "utf8");
  const result = analyzeFiles([left, right], "ast_tree_edit_similarity");
  console.log(result.matrix);
  console.log(result.ranking);
  console.log(result.metadata.metric_ids);
} finally {
  fs.rmSync(directory, { recursive: true, force: true });
}
```

Run the equivalent [example](https://github.com/otaviouss/codevariability-js/blob/main/examples/basic.js) with `node examples/basic.js`.
For the bundled inputs, use:

```bash
node bin/codevariability-js.js ast --directory examples/inputs --metric ast_tree_edit_similarity --output analysis-output/analysis.json
```

After installation, replace `node bin/codevariability-js.js` with the installed
command. Select a metric explicitly. `"all"` selects the standard structural
TED metric; it does not include the frequency baseline.

## API and results

`analyzeFiles(paths, metrics, options={})` accepts a nonempty array of paths
with unique basenames. `metrics` is a metric name, array of metric names, or
`"all"`. `filesInDirectory(directory)` lists supported regular files in one
directory, without recursion.

| Metric | Definition |
| --- | --- |
| `ast_tree_edit_similarity` | Exact edit distance between ordered, normalized syntax trees, converted to a similarity. |
| `ast_node_type_multiset_jaccard` | Jaccard similarity of node-type frequencies; ignores hierarchy. |

Request both metrics explicitly with an array if both are useful. TED remains
the structural score when both are present. The baseline still has its own
matrix, statistics, and ranking.

Results include `files`, `metrics`, `matrices`, `statistics`,
`representativeness`, `rankingsByMetric`, `ranking`, `mostRepresentative`,
`mostDistinct`, `metadata`, `fragments`, and `warnings`. With one metric,
`metric`, `metric_id`, and `matrix` are also available and the schema is
`codevariability.matrix.v1`; multiple metrics use `codevariability.analysis.v1`.
Metadata records metric/normalization IDs, parser/runtime versions, and input
hashes. The CLI writes JSON or prints it to stdout. See the
[API documentation](https://github.com/otaviouss/codevariability-js/blob/main/docs/API.md).

## Markdown, cache, and limits

Source files are parsed in full. Markdown accepts closed backtick and tilde
fences labeled with a supported language. Empty and comment-only blocks are
ignored; invalid syntax and unclosed fences raise errors with source context.
The scanner is not a complete CommonMark implementation.

`maxCells` defaults to 2,000,000 table cells per non-identical TED pair.
Exceeding the limit raises an error before table allocation and never substitutes
an approximate score. `maxCells: null` or CLI `--max-cells none` removes it.
This budget does not limit file size, parsing, pair counts, or total CPU time.

`cacheDir` enables a versioned, content-addressed TED cache; `onProgress`
receives parsing/comparison/cache-warning events. Use trusted output and cache
directories. JSON output files are replaced atomically and reject existing
destination symlinks. The library does not provide a filesystem sandbox.

Normalization removes concrete identifiers and literal values, retaining
syntax, operators, literal categories, hierarchy, and order. A score is not a
copied-code percentage or proof of functional equivalence. Parser/runtime
versions affect supported grammar. See
[metric details](https://github.com/otaviouss/codevariability-js/blob/main/docs/METRICS.md).

## Python interoperability

The optional [Python project](https://github.com/otaviouss/codevariability-py)
can load a single-metric JSON or invoke the installed JavaScript command.
This package's build, tests, and CLI are independent of Python. Textual/token
metrics and group permutation tests belong to the Python package.

## Development and license

`npm run build` checks JavaScript syntax; the source is directly distributable
and requires no transpilation. Run `npm test` for library tests and `npm pack`
to generate the reviewed npm tarball. See [CONTRIBUTING.md](https://github.com/otaviouss/codevariability-js/blob/main/CONTRIBUTING.md) and
[PUBLICATION_CHECKLIST.md](https://github.com/otaviouss/codevariability-js/blob/main/PUBLICATION_CHECKLIST.md).

MIT license, copyright 2026 Otávio Gomes. See [LICENSE](https://github.com/otaviouss/codevariability-js/blob/main/LICENSE).

## Candidate compatibility

Version 0.2.0 remains unreleased. Files select JS, JSX, TS, or TSX grammar by
extension. Markdown fences use `js`/`javascript`, `jsx`, `ts`/`typescript`, or
`tsx`; unlabeled fences use JS. Fences retain their code, including prefixes;
prose, inline code, and HTML outside fences are ignored. Inputs must be valid
UTF-8. Discovery and ranking ties use Unicode code-point order.

Normalization and pipeline IDs now use v3; metric formula IDs remain v2.
Previous pipeline cache records are not reused. Wide AST traversal avoids
argument-count limits, but input size, parser resources, and total pair counts
remain the caller's responsibility. See [metrics](docs/METRICS.md) and
[API](docs/API.md) for empty-input behavior, budgets, and expected errors.
