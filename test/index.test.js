const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
  AST_TREE_EDIT_METRIC,
  AST_NODE_TYPE_MULTISET_JACCARD_METRIC,
  analyzeFiles,
  filesInDirectory,
} = require("../src");
const { extractCodeFragments } = require("../src/fragments");
const {
  NormalizedAstNode,
  normalizeAst,
  countAstNodes,
  treeEditDistance,
  treeEditSimilarity,
} = require("../src/ast-tree-edit");
const { writeJsonAtomic } = require("../src/output");

function withSources(sources, callback) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "codevariability-js-"));
  try {
    const paths = Object.entries(sources).map(([name, source]) => {
      const file = path.join(directory, name);
      fs.writeFileSync(file, source, "utf8");
      return file;
    });
    return callback(paths);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

function treeSimilarity(left, right, sourceExtension = ".js") {
  const extension = left.startsWith("```") || right.startsWith("```") ? ".md" : sourceExtension;
  return withSources({ ["left" + extension]: left, ["right" + extension]: right }, (paths) =>
    analyzeFiles(paths, AST_TREE_EDIT_METRIC).matrix[0][1]);
}

test("source strings cannot masquerade as Markdown", () => {
  withSources({ "a.js": 'const s = "```js\\nx=1\\n```"; function f(){return true}', "b.js": "const x=1" }, (paths) => {
    const result = analyzeFiles(paths, AST_TREE_EDIT_METRIC);
    assert.equal(result.fragments[0].count, 1);
    assert.ok(result.matrix[0][1] < 1);
  });
  withSources({ "invalid.js": "'use strict';\nconst x=1;\n'use strict';\nconst x=2;" }, (paths) => {
    assert.throws(() => analyzeFiles(paths, AST_TREE_EDIT_METRIC), /fragmento 1/);
  });
});

for (const fence of ["```", "````", "~~~"]) {
  test(`${fence} fences preserve delimiter literals and accept info metadata`, () => {
    withSources({ "a.md": `${fence}js title=test\nconst s="\x60\x60\x60";\n${fence}`, "b.md": `${fence}javascript\nconst x="other";\n${fence}` }, (paths) => {
      assert.equal(analyzeFiles(paths, AST_TREE_EDIT_METRIC).matrix[0][1], 1);
    });
  });
}

test("malformed large Markdown is explicitly rejected", () => {
  assert.throws(() => extractCodeFragments("```js\nx=1\n".repeat(5000), "a.md"), /sem fechamento/);
});

test("normalization does not depend on recursive traversal", () => {
  let ast = { type: "Identifier", name: "x" };
  for (let i = 0; i < 4000; i += 1) ast = { type: "Expression", expression: ast };
  const tree = normalizeAst(ast);
  assert.equal(countAstNodes(tree), 4001);
  assert.equal(treeEditDistance(tree, tree, 1), 0);
});

test("TED limit rejects instead of approximating and permits explicit opt out", () => {
  const left = new NormalizedAstNode("A", [new NormalizedAstNode("B")]);
  const right = new NormalizedAstNode("A", [new NormalizedAstNode("C")]);
  assert.throws(() => treeEditDistance(left, right, 1), /limite maxCells/);
  assert.equal(treeEditDistance(left, right, null), 1);
  assert.ok(Math.abs(treeEditSimilarity(left, right, null) - 2 / 3) < 1e-15);
});

test("empty and comment-only Markdown fragments agree", () => {
  withSources({ "a.md": "```js\n\n```", "b.md": "```js\n// comment\n```" }, (paths) => {
    assert.equal(analyzeFiles(paths, AST_TREE_EDIT_METRIC).matrix[0][1], 1);
  });
});

test("JSON output rejects destination symlinks without altering targets", (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "codevariability-output-"));
  try {
    const sentinel = path.join(directory, "sentinel");
    const target = path.join(directory, "output.json");
    fs.writeFileSync(sentinel, "SAFE");
    try { fs.symlinkSync(sentinel, target); }
    catch (error) { if (["EPERM", "ENOSYS"].includes(error.code)) { context.skip("Symlinks unavailable"); return; } throw error; }
    assert.throws(() => writeJsonAtomic(target, "{}"), /link simbólico/);
    assert.equal(fs.readFileSync(sentinel, "utf8"), "SAFE");
    fs.unlinkSync(target);
    writeJsonAtomic(target, '{"ok":true}');
    assert.equal(fs.readFileSync(target, "utf8"), '{"ok":true}');
    assert.deepEqual(fs.readdirSync(directory).sort(), ["output.json", "sentinel"]);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test("emits a normalized and versioned AST matrix", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "codevariability-js-"));
  fs.writeFileSync(path.join(directory, "sample1.jsx"), "const A = () => <button>Save</button>;", "utf8");
  fs.writeFileSync(path.join(directory, "sample2.md"), "```jsx\nconst B = () => <button>Send</button>;\n```", "utf8");
  const result = analyzeFiles(filesInDirectory(directory), AST_NODE_TYPE_MULTISET_JACCARD_METRIC);
  assert.equal(result.schema_version, "codevariability.matrix.v1");
  assert.equal(result.metric, AST_NODE_TYPE_MULTISET_JACCARD_METRIC);
  assert.equal(result.metric_id, "ast_node_type_multiset_jaccard_v2");
  assert.equal(result.metadata.runtime_versions.node, process.versions.node);
  assert.equal(result.metadata.runtime_versions.babel_parser, require("@babel/parser/package.json").version);
  assert.equal(result.metadata.input_sha256["sample1.jsx"], require("node:crypto").createHash("sha256").update(fs.readFileSync(path.join(directory, "sample1.jsx"))).digest("hex"));
  assert.deepEqual(result.matrix.map((row, index) => row[index]), [1, 1]);
  assert.equal(result.warnings[0].file, "sample2.md");
  fs.rmSync(directory, { recursive: true, force: true });
});

test("returns the canonical structural analysis for all", () => {
  withSources({
    "solution_01.js": "function combine(a, b) { return a + b; }",
    "solution_02.js": "function calculate(x, y) { return x + y; }",
    "solution_03.js": "function combine(a, b) { if (a) return a - b; return b; }",
  }, (paths) => {
    const progress = [];
    const result = analyzeFiles(paths, "all", { onProgress: (event) => progress.push(event) });
    assert.equal(result.schema_version, "codevariability.matrix.v1");
    assert.deepEqual(result.metrics, [AST_TREE_EDIT_METRIC]);
    assert.deepEqual(Object.keys(result.matrices), result.metrics);
    assert.deepEqual(result.metadata.metrics, result.metrics);
    assert.equal(result.metadata.metric_dimensions[AST_TREE_EDIT_METRIC], "structural_ast");
    assert.deepEqual(Object.keys(result.statistics), result.metrics);
    assert.deepEqual(Object.keys(result.rankingsByMetric), result.metrics);
    assert.equal(result.statistics[AST_TREE_EDIT_METRIC].n_pairs, 3);
    assert.equal(result.representativeness.length, 3);
    assert.equal(result.ranking[0].file, result.mostRepresentative.file);
    assert.equal(result.ranking.at(-1).file, result.mostDistinct.file);
    for (const row of result.representativeness) {
      assert.equal(row.structuralScore, row[AST_TREE_EDIT_METRIC]);
      assert.equal(row.overallScore, row.structuralScore);
    }
    assert.deepEqual(result.metadata.overall_aggregation.structural_metrics, [AST_TREE_EDIT_METRIC]);
    assert.equal(progress.filter((event) => event.phase === "parse").length, 3);
    const comparisons = progress.filter((event) => event.phase === "compare");
    assert.equal(comparisons.length, 3); // choose(3, 2), never the full 3 x 3 matrix
    assert.equal(comparisons.at(-1).total, 3);
  });
});

test("single-metric output includes aggregates and matrix interchange fields", () => {
  withSources({ "a.js": "const x = 1", "b.js": "const y = 2" }, (paths) => {
    const result = analyzeFiles(paths, AST_TREE_EDIT_METRIC);
    assert.equal(result.metric, AST_TREE_EDIT_METRIC);
    assert.equal(result.matrix, result.matrices[AST_TREE_EDIT_METRIC]);
    assert.equal(result.statistics[AST_TREE_EDIT_METRIC].n_pairs, 1);
    assert.equal(result.ranking.length, 2);
  });
});

test("persistent pair cache reuses TED results by content", () => {
  withSources({ "a.js": "const x = a + b", "b.js": "const y = c + d" }, (paths) => {
    const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), "codevariability-cache-"));
    const first = analyzeFiles(paths, AST_TREE_EDIT_METRIC, { cacheDir });
    const second = analyzeFiles([...paths].reverse(), AST_TREE_EDIT_METRIC, { cacheDir });
    assert.equal(first.metadata.cache.misses, 1);
    assert.equal(first.metadata.cache.writes, 1);
    assert.equal(second.metadata.cache.hits, 1);
    assert.equal(second.metadata.cache.misses, 0);
    assert.equal(first.matrix[0][1], second.matrix[1][0]);
    fs.writeFileSync(paths[0], "const x = a - b", "utf8");
    const changed = analyzeFiles(paths, AST_TREE_EDIT_METRIC, { cacheDir });
    assert.equal(changed.metadata.cache.hits, 0);
    assert.equal(changed.metadata.cache.misses, 1);
    fs.rmSync(cacheDir, { recursive: true, force: true });
  });
});

test("breaks representativeness ties deterministically by filename", () => {
  withSources({ "z.js": "const x = 1", "a.js": "const y = 2", "m.js": "const q = 9" }, (paths) => {
    const result = analyzeFiles(paths, AST_TREE_EDIT_METRIC);
    assert.deepEqual(result.ranking.map((row) => row.file), ["a.js", "m.js", "z.js"]);
    assert.deepEqual(result.ranking.map((row) => row.score), [1, 1, 1]);
  });
});

test("preserves a JavaScript hashbang as source code", () => {
  const extracted = extractCodeFragments("#!/usr/bin/env node\nconsole.log('ready');\n");
  assert.equal(extracted.fragments[0].code.startsWith("#!/usr/bin/env node"), true);
  assert.deepEqual(extracted.warnings, []);
});

test("splits a response containing multiple complete modules", () => {
  const source = "'use strict';\nconst item = 1;\n\n'use strict';\nconst item = 2;";
  const extracted = extractCodeFragments(source);
  assert.equal(extracted.fragments.length, 2);
  assert.deepEqual(extracted.fragments.map((item) => item.startLine), [1, 4]);
  assert.ok(extracted.warnings.includes("composite_modules_split"));
});

test("extracts fenced code and preserves its source line", () => {
  const extracted = extractCodeFragments("# Answer\n\n```js\nconst valid = true;\n```\n");
  assert.equal(extracted.fragments.length, 1);
  assert.equal(extracted.fragments[0].startLine, 4);
  assert.ok(extracted.warnings.includes("markdown_fences_extracted"));
});

test("analyzes JavaScript fenced responses stored as Markdown", () => {
  withSources({
    "first.md": "Explanation.\n```js\nconst value = 1;\n```",
    "second.md": "Different prose.\n```js\nconst renamed = 2;\n```",
  }, (paths) => {
    const result = analyzeFiles(paths, "all");
    assert.equal(result.fragments[0].count, 1);
    assert.equal(result.matrices[AST_TREE_EDIT_METRIC][0][1], 1);
  });
});

test("identifies an invalid source file", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "codevariability-js-"));
  const invalid = path.join(directory, "invalid.jsx");
  fs.writeFileSync(invalid, "const = ;", "utf8");
  assert.throws(() => analyzeFiles([invalid], AST_TREE_EDIT_METRIC), /invalid\.jsx/);
  fs.rmSync(directory, { recursive: true, force: true });
});

test("rejects syntax errors recovered by Babel", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "codevariability-js-"));
  const invalid = path.join(directory, "invalid.js");
  fs.writeFileSync(invalid, "let duplicate; let duplicate;", "utf8");
  assert.throws(() => analyzeFiles([invalid], AST_TREE_EDIT_METRIC), /invalid\.js/);
  fs.rmSync(directory, { recursive: true, force: true });
});

test("reports the fragment and source line for invalid code", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "codevariability-js-"));
  const invalid = path.join(directory, "invalid.md");
  fs.writeFileSync(invalid, "```js\nconst ok = true;\n```\n```js\nconst = ;\n```", "utf8");
  assert.throws(() => analyzeFiles([invalid], AST_TREE_EDIT_METRIC), /fragmento 2, linha de origem 5/);
  fs.rmSync(directory, { recursive: true, force: true });
});

test("rejects an invalid directory", () => {
  assert.throws(() => filesInDirectory(path.join(os.tmpdir(), "missing-codevariability-directory")), /Diretório/);
});

test("defines empty trees and unit edit costs", () => {
  const a = new NormalizedAstNode("A");
  const b = new NormalizedAstNode("B");
  assert.equal(treeEditSimilarity(null, null), 1);
  assert.equal(treeEditSimilarity(null, a), 0);
  assert.equal(treeEditDistance(a, b), 1);
  assert.equal(treeEditDistance(a, new NormalizedAstNode("A", [b])), 1);
  const promoted = new NormalizedAstNode("Root", [new NormalizedAstNode("X", [a, b])]);
  const direct = new NormalizedAstNode("Root", [a, b]);
  assert.equal(treeEditDistance(promoted, direct), 1);
});

test("counts reused node objects as distinct tree occurrences", () => {
  const shared = new NormalizedAstNode("Leaf");
  const reused = new NormalizedAstNode("Root", [shared, shared]);
  const copied = new NormalizedAstNode("Root", [new NormalizedAstNode("Leaf"), new NormalizedAstNode("Leaf")]);
  const changed = new NormalizedAstNode("Root", [new NormalizedAstNode("Leaf"), new NormalizedAstNode("Other")]);
  assert.equal(treeEditDistance(reused, copied), 0);
  assert.equal(treeEditDistance(reused, changed), 1);
});

test("normalizes identifiers and literal values", () => {
  assert.equal(treeSimilarity("function soma(a,b){return a+b}", "function calcular(x,y){return x+y}"), 1);
  assert.equal(treeSimilarity("function f(){return 10}", "function f(){return 999}"), 1);
  assert.equal(treeSimilarity("function f(){return 'a'}", "function f(){return 'different'}"), 1);
});

test("normalizes identifiers in declarations, imports, properties, labels, and bindings", () => {
  const left = `
    import original, {item as alias} from "module-a";
    class Example { method(parameter) { label: for (const local of parameter) this.property = {key: local}; } }
  `;
  const right = `
    import renamed, {other as binding} from "module-b";
    class Different { changed(argument) { marker: for (const value of argument) this.attribute = {field: value}; } }
  `;
  assert.equal(treeSimilarity(left, right), 1);
});

test("preserves literal categories, operators, hierarchy, and child order", () => {
  assert.ok(treeSimilarity("function f(){return 10}", "function f(){return '10'}") < 1);
  assert.ok(treeSimilarity("function f(a,b){return a+b}", "function f(a,b){return a-b}") < 1);
  const ordered = new NormalizedAstNode("Root", [new NormalizedAstNode("A"), new NormalizedAstNode("B")]);
  const reversed = new NormalizedAstNode("Root", [new NormalizedAstNode("B"), new NormalizedAstNode("A")]);
  assert.ok(treeEditSimilarity(ordered, reversed) < 1);
});

test("defines literal categories without retaining concrete values", () => {
  for (const [left, right] of [
    ["const x = true", "const x = false"],
    ["const x = 0", "const x = 999"],
    ["const x = ''", "const x = 'text'"],
    ["const x = 1n", "const x = 999n"],
    ["const x = /a/gi", "const x = /different/m"],
    ["const x = `hello`", "const x = `different`"],
  ]) assert.equal(treeSimilarity(left, right), 1);
  assert.ok(treeSimilarity("const x = null", "const x = false") < 1);
  assert.ok(treeSimilarity("const x = 1", "const x = '1'") < 1);
});

test("preserves JavaScript operators", () => {
  for (const [left, right] of [
    ["x = a + b", "x = a - b"],
    ["x = a * b", "x = a / b"],
    ["x = a % b", "x = a * b"],
    ["x = a == b", "x = a != b"],
    ["x = a < b", "x = a > b"],
    ["x = a <= b", "x = a >= b"],
    ["x = a && b", "x = a || b"],
    ["x = !a", "x = -a"],
    ["a += b", "a -= b"],
    ["x = a & b", "x = a | b"],
    ["x = a ** b", "x = a * b"],
    ["x = a ?? b", "x = a || b"],
  ]) assert.ok(treeSimilarity(left, right) < 1, `${left} versus ${right}`);
});

test("preserves syntax-bearing scalar AST fields", () => {
  for (const [left, right] of [
    ["const x = 1", "let x = 1"],
    ["async function f() {}", "function f() {}"],
    ["function* f() {}", "function f() {}"],
    ["x[key]", "x.key"],
    ["x?.key", "x.key"],
    ["++x", "x++"],
  ]) assert.ok(treeSimilarity(left, right) < 1, `${left} versus ${right}`);
  // TypeScript syntax must be tested as TypeScript under the explicit grammar.
  assert.ok(treeSimilarity("function f(x?: number) {}", "function f(x: number) {}", ".ts") < 1);
});

test("uses n + m - 1 because maximum tree size is not a general TED bound", () => {
  const star = new NormalizedAstNode("R", Array.from({ length: 3 }, () => new NormalizedAstNode("X")));
  let chain = new NormalizedAstNode("R");
  for (let index = 0; index < 3; index += 1) chain = new NormalizedAstNode("X", [chain]);
  assert.equal(treeEditDistance(star, chain), 5);
  assert.equal(treeEditSimilarity(star, chain), 1 - 5 / 7);
});

test("is symmetric, bounded, and identifies structural changes", () => {
  const simple = "function f(a){return a}";
  const branching = "function f(a){if(a){return a}return 0}";
  const forward = treeSimilarity(simple, branching);
  const backward = treeSimilarity(branching, simple);
  assert.equal(forward, backward);
  assert.ok(forward >= 0 && forward < 1);
  assert.equal(treeSimilarity(simple, simple), 1);

  withSources({
    "empty.js": "",
    "assign.js": "const x = 1",
    "call.js": "print(x)",
    "loop.js": "for (const x of values) print(x)",
    "class.js": "class Item {}",
  }, (paths) => {
    const matrix = analyzeFiles(paths, AST_TREE_EDIT_METRIC).matrix;
    matrix.forEach((row, left) => row.forEach((value, right) => {
      assert.ok(value >= 0 && value <= 1);
      assert.equal(value, matrix[right][left]);
      if (left === right) assert.equal(value, 1);
    }));
  });
});

test("distinguishes hierarchy when the node-type multiset is identical", () => {
  withSources({ "left.js": "a + (b * c)", "right.js": "(a + b) * c" }, (paths) => {
    assert.equal(analyzeFiles(paths, AST_NODE_TYPE_MULTISET_JACCARD_METRIC).matrix[0][1], 1);
    assert.ok(analyzeFiles(paths, AST_TREE_EDIT_METRIC).matrix[0][1] < 1);
  });
});

test("ignores comments, formatting, locations, and concrete names and values", () => {
  const compact = "function f(x){return x+1}";
  const formatted = "// comment\nfunction renamed(value) {\n  /* detail */ return value + 999;\n}";
  assert.equal(treeSimilarity(compact, formatted), 1);
  const left = { type: "Identifier", name: "x", start: 0, end: 1, loc: { line: 1 } };
  const right = { type: "Identifier", name: "renamed", start: 20, end: 27, loc: { line: 8 } };
  assert.deepEqual(normalizeAst(left), normalizeAst(right));
});

test("keeps multiple fragments under an ordered synthetic root", () => {
  const source = "```js\nconst a = 1;\n```\n```js\nreturnValue(a);\n```";
  const reversed = "```js\nreturnValue(a);\n```\n```js\nconst a = 1;\n```";
  assert.ok(treeSimilarity(source, reversed) < 1);
  const result = withSources({ "a.md": source, "b.md": source }, (paths) => analyzeFiles(paths, AST_TREE_EDIT_METRIC));
  assert.equal(result.metric, AST_TREE_EDIT_METRIC);
  assert.equal(result.fragments[0].count, 2);
  assert.equal(result.metadata.normalization, "babel_normalized_ast_tree_v3");

  const a = "```js\nconst x = 1;\n```";
  const b = "```js\nprint(x);\n```";
  const c = "```js\nif (x) y = 2;\n```";
  assert.equal(treeSimilarity(`${a}\n${b}`, `${a}\n${b}`), 1);
  assert.ok(treeSimilarity(`${a}\n${b}`, `${b}\n${a}`) < 1);
  assert.ok(treeSimilarity(`${a}\n${b}`, a) < 1);
  assert.ok(treeSimilarity(a, `${a}\n${b}`) < 1);
  assert.ok(treeSimilarity(`${a}\n${b}\n${c}`, `${a}\n${c}`) < 1);

  const empty = withSources({ "empty.md": "```js\n\n```" }, (paths) =>
    analyzeFiles(paths, AST_TREE_EDIT_METRIC));
  assert.equal(empty.fragments[0].count, 0);
});

test("supports modern JavaScript and TypeScript syntax", () => {
  const samples = {
    "async.js": "async function f(x) { return await x; }",
    "generator.js": "function* values() { yield* source; }",
    "class.js": "@sealed class Item { #value = 1; field = 2; *method() { yield this.#value; } }",
    "optional.js": "const x = source?.method?.() ?? fallback;",
    "destructure.js": "const {a, ...rest} = source; const copy = {...rest};",
    "template.js": "const text = `value: ${item}`;",
    "import.js": "const module = import('./module.js');",
    "arrow.js": "const f = (x) => x ** 2;",
    "types.ts": "interface Box<T> { value: T } const box: Box<number> = {value: 1};",
  };
  for (const [name, source] of Object.entries(samples)) {
    withSources({ [name]: source }, (paths) => {
      assert.equal(analyzeFiles(paths, AST_TREE_EDIT_METRIC).matrix[0][0], 1);
    });
  }
});

test("satisfies properties on deep, wide, balanced, and random trees", () => {
  const leaf = new NormalizedAstNode("Leaf");
  let chain = leaf;
  for (let index = 0; index < 200; index += 1) chain = new NormalizedAstNode("Node", [chain]);
  const wide = new NormalizedAstNode("Root", Array.from({ length: 200 }, () => new NormalizedAstNode("Leaf")));
  const balanced = (depth) => depth === 0 ? leaf : new NormalizedAstNode("Node", [balanced(depth - 1), balanced(depth - 1)]);
  let state = 31;
  const random = () => ((state = (state * 1664525 + 1013904223) >>> 0) / (2 ** 32));
  const randomTree = (depth = 0) => new NormalizedAstNode(
    String(Math.floor(random() * 4)),
    Array.from({ length: depth === 4 ? 0 : Math.floor(random() * 3) }, () => randomTree(depth + 1)),
  );
  const trees = [leaf, chain, wide, balanced(7), ...Array.from({ length: 12 }, () => randomTree())];
  for (const left of trees) {
    assert.equal(treeEditSimilarity(left, left), 1);
    for (const right of trees) {
      const value = treeEditSimilarity(left, right);
      assert.ok(value >= 0 && value <= 1);
      assert.equal(value, treeEditSimilarity(right, left));
    }
  }
});

test("rejects an unknown AST metric", () => {
  withSources({ "a.js": "const a = 1" }, (paths) => {
    assert.throws(() => analyzeFiles(paths, "unknown"), /Métrica AST desconhecida/);
  });
});

test("requires explicit AST metric selection", () => {
  withSources({ "a.js": "const a = 1" }, (paths) => {
    assert.throws(() => analyzeFiles(paths), /Selecione explicitamente/);
  });
});

test("rejects unsupported extensions passed directly", () => {
  withSources({ "source.txt": "const value = 1;" }, (paths) => {
    assert.throws(() => analyzeFiles(paths, AST_TREE_EDIT_METRIC), /Extensão não suportada.*source\.txt/);
  });
});
