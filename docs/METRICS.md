# Structural metrics

Babel selects the grammar from `.js`, `.jsx`, `.ts`, or `.tsx`; JSX is enabled
only for JSX/TSX and TypeScript only for TS/TSX. A `.ts` angle-bracket type
assertion is therefore not interpreted as JSX. Parsing occurs synchronously
and syntax errors stop the analysis. Source files are parsed in full, including
strings containing fence delimiters. Markdown is scanned for labeled code
fences; the first word identifies the language and extra information is
permitted. `js`/`javascript`, `jsx`, `ts`/`typescript`, and `tsx` select the same
grammars as source extensions; an unlabeled fence uses JavaScript. Prose,
inline code, and embedded HTML outside fences are ignored. Unsupported fence
languages raise an error. Backtick and tilde fences must close. Empty/comment-only fragments
are ignored. A Markdown-only heuristic may split concatenated modules that
start with `'use strict';`; separators must be statements at program level.
Markers inside strings, templates, comments, or functions do not split code.
All code before the first separator is retained. The heuristic is not applied
to source files. Transformations
are recorded in warnings and original line positions in fragments.

AST normalization preserves hierarchy, child order, syntax-node types,
operators, literal categories, and structural flags. Concrete identifiers and
literal values, comments, locations, tokens, and formatting are excluded.
Fragment boundaries remain ordered beneath a synthetic root.

`ast_tree_edit_similarity_v2` uses exact ordered Zhang–Shasha edit distance
with unit insertion/deletion/relabeling costs. With normalized tree sizes
`n` and `m`, nonempty-tree similarity is `1 - TED/(n+m-1)`. This denominator
is an upper bound obtained by deleting non-root nodes, relabeling the root,
and inserting target non-root nodes. Empty/empty is 1, empty/nonempty is 0.
Scores are symmetric and in [0, 1]. Different sources can normalize to the
same tree. Similarity is not semantic equivalence or a copied-code percentage.

`ast_node_type_multiset_jaccard_v2` counts node types and divides the sum of
minimum paired counts by the sum of maximum counts. It does not retain
hierarchy and is available as an explicit frequency baseline. Two empty
multisets have similarity 1.

When TED is selected, only TED contributes to `structuralScore` and
`overallScore`; a simultaneously selected frequency baseline remains available
in its own matrix/statistics/ranking. A single file's ranking score is 1.
For multiple files, each score is mean similarity to all other files.

TED tables require O(nm) memory and shape-dependent computation. The default
budget is 2,000,000 cells `(n+1)*(m+1)` per non-identical pair. Equal trees are
checked before allocating the tables. A budget error never returns an
approximate similarity. `maxCells: null` removes the budget and can require
substantial memory/time. Parsing, input size, and the number of file pairs
remain the caller's responsibility; parser limits also apply.

Traversal uses iterative stacks, including wide child lists, without spreading
children into function arguments. There is no new width cutoff. This does not
bound parser memory, input bytes, or the total number of comparisons. Empty
programs have no synthetic root and follow the documented empty-tree scores.

The cache is keyed by source content, extension, adapter, parser, metric,
pipeline, and normalization versions. It stores scores, not source content.
Missing or invalid records are recomputed. Cache directories are trusted
local storage, not authenticated data received from other users.

Metadata records metric IDs, normalization IDs, runtime versions, and raw
input SHA-256 hashes. Compare results only with compatible definitions and
parser versions. Python and Babel have different grammars and tree node types;
the packages do not promise cross-language score equivalence.

The unreleased 0.2.0 candidate uses `babel_ast_pipeline_v3` and normalization
IDs `babel_normalized_ast_tree_v3` / `babel_ast_node_type_multiset_v3` to identify
the corrected grammar, Markdown, and empty-program behavior. Formula IDs stay
at v2. Previous cache entries cannot match the new pipeline key. Results with
different normalization IDs should not be pooled as equivalent observations.
