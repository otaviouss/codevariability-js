# Changelog

## 0.2.0 — unreleased

- Choose JS/JSX/TS/TSX grammars by extension or Markdown fence language.
- Preserve Markdown prefixes and only split composite modules at program-level
  strict directives. Correct empty-program normalization.
- Traverse wide AST child lists without argument spreading, avoiding the
  argument-count failure on large valid programs.
- Require valid UTF-8, retain error causes, create missing CLI output parents,
  and order filenames/ties by Unicode code points independent of locale.
- Advance preprocessing/normalization IDs to v3 while retaining v2 metric
  formulas and version 0.2.0, which has not yet been published. Add permanent
  adversarial, grammar, Markdown, Unicode, and resource regressions.

- Prepare the independent JavaScript/TypeScript analysis package with its own
  metadata, CommonJS exports, CLI, examples, tests, and npm file allowlist.
- Preserve v2 structural metric IDs, iterative normalization, exact TED budget,
  versioned content cache, input hashes, and atomic JSON output.
- Export the package root explicitly. Implementation subpaths are no longer
  exposed through package imports; use `require("codevariability-js")`.
- Document the existing behavior of `all` (TED only) and explicit selection
  of the node-frequency baseline. Package contents and development are
  independent of Python. This entry does not imply a past npm publication.
