# JavaScript API

The package uses CommonJS. The root export provides `analyzeFiles`,
`filesInDirectory`, `AST_METRICS`, and metric-name/ID constants:
`AST_TREE_EDIT_METRIC`, `AST_TREE_EDIT_METRIC_ID`,
`AST_NODE_TYPE_MULTISET_JACCARD_METRIC`, and
`AST_NODE_TYPE_MULTISET_JACCARD_METRIC_ID`. Package subpaths are not exported.

## analyzeFiles(paths, metrics, options={})

`paths` must be a nonempty array of source paths with unique basenames and
supported extensions (`.js`, `.jsx`, `.ts`, `.tsx`, `.md`, `.markdown`). The
caller controls explicit file order. Unsupported extensions raise `Error`.

`metrics` must be supplied explicitly: a supported name, an array of names,
or `"all"`. Empty selections, unknown names, and duplicated names are rejected.
`"all"` selects only `ast_tree_edit_similarity`; select the node-frequency
baseline explicitly when needed.

| Option | Default | Behavior |
| --- | --- | --- |
| `maxCells` | `2000000` | Positive safe integer for TED table cells per pair, or `null` to remove the limit. |
| `cacheDir` | absent | Directory for versioned content-addressed pair results. |
| `onProgress` | no callback | Receives parse, compare, and cache-warning objects. |

Progress events contain `phase` and, depending on phase, `current`, `total`,
`file`, `metric`, `cached`, or `message`. A parse event counts files; comparison
events count unique pairs for the current metric. Callbacks run synchronously.

The result uses arrays for matrices and objects for tables. `files` gives the
row/column order. `statistics[metric]` includes pair count, mean, median, sample
standard deviation, quartiles, range, and mean variability (`1 - mean`).
When no off-diagonal pair exists, similarity summary fields are null.

`rankingsByMetric[metric]` and `ranking` contain `rank`, `file`, and `score`;
ties are resolved by filename. `representativeness` contains per-metric scores,
`structuralScore`, and `overallScore`. `mostRepresentative` and `mostDistinct`
are the first and last rows of `ranking`.

Single-metric output adds `metric`, `metric_id`, and `matrix` with schema
`codevariability.matrix.v1`. Multiple selected metrics use
`codevariability.analysis.v1`. Both include `matrices`, `metadata`,
`fragments`, and `warnings`. Python's `load_matrix_json()` accepts the single
metric schema only.

`filesInDirectory(directory)` validates the directory, discovers supported
regular files without recursion, and returns ordered paths.

## Command line and errors

```text
codevariability-js ast (--directory folder | files...)
  --metric name|all
  [--output file] [--cache-dir folder]
  [--max-cells integer|none] [--progress]
```

The CLI prints JSON when output is omitted. `--progress` writes status to
stderr; `--max-cells none` explicitly removes the table budget. `--help` and
`--version` are available. Errors produce a nonzero exit status.

Invalid syntax and unsupported inputs raise `Error`; filesystem errors retain
Node error information. Use trusted output and cache directories. Input programs
are parsed, never executed. There are no JavaScript implementations of Python's
text/token metrics or group permutation tests in this package.
