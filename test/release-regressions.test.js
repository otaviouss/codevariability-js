"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { spawnSync } = require("node:child_process");
const { analyzeFiles, filesInDirectory, AST_METRICS } = require("../src");
const { extractCodeFragments } = require("../src/fragments");
const { NormalizedAstNode, countAstNodes, treeEditSimilarity } = require("../src/ast-tree-edit");

function fixtures(sources, run) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "codevariability-regression-"));
  try {
    const files = Object.entries(sources).map(([name, source]) => {
      const file = path.join(directory, name); fs.writeFileSync(file, source); return file;
    });
    return run(files, directory);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
}

const grammars = {
  js: "const value = source;",
  jsx: "const view = <button>ok</button>;",
  ts: "const value = <number>source; const identity = <T>(item:T):T => item;",
  tsx: "const view: JSX.Element = <button>ok</button>; const identity = <T,>(item:T):T => item;",
};
for (const [extension, source] of Object.entries(grammars)) {
  test(`parses valid .${extension} with its own grammar`, () => fixtures({ [`input.${extension}`]: source }, ([file]) => {
    assert.equal(analyzeFiles([file], AST_METRICS).matrix, undefined);
  }));
  test(`parses Markdown ${extension} without dropping source`, () => fixtures({ "input.md": `~~~${extension} extra information\n${source}\n~~~` }, ([file]) => {
    const extracted = extractCodeFragments(fs.readFileSync(file, "utf8"), file);
    assert.equal(extracted.fragments[0].code, source + "\n");
    assert.equal(analyzeFiles([file], "all").matrix[0][0], 1);
  }));
}
for (const [extension, source] of [["js", "const value: number = 1;"], ["js", "const view=<div/>;"], ["jsx", "const value: number = 1;"], ["ts", "const view=<div/>;"], ["tsx", "const value=<number>source;"]]) {
  test(`rejects incompatible grammar ${extension}: ${source}`, () => fixtures({ [`input.${extension}`]: source }, ([file]) => {
    assert.throws(() => analyzeFiles([file], "all"), (error) => error.cause instanceof Error && error.message.includes(file));
  }));
}

test("preserves Markdown prefixes and ignores markers inside literals/comments", () => {
  for (const source of [
    "if(ready) run();\n'use strict';\nconst a=1;\n'use strict';\nconst b=2;",
    "const text=`\n'use strict';\nconst a=1;\n'use strict';\n`;",
    "/*\n'use strict';\nconst a=1;\n'use strict';\n*/\nrun();",
    "function f(){\n'use strict';\nrun();\n}\n'use strict';\nrun();",
  ]) fixtures({ "input.md": "```js\n" + source + "\n```" }, ([file]) => {
    const fragments = extractCodeFragments(fs.readFileSync(file, "utf8"), file).fragments;
    assert.equal(fragments.map((fragment) => fragment.code).join(""), source + "\n");
    assert.equal(analyzeFiles([file], "all").matrix[0][0], 1);
  });
});

test("preserves distinct code across multiple mixed Markdown fences", () => fixtures({
  "a.md": "# title\n`inline()`\n<div>HTML</div>\n```js\nconst x=1;\n```\n~~~ts\nconst y = <number>source;\n~~~",
  "b.md": "Prose\n```js\nwhile(x) x--;\n```\n~~~ts\nconst y = <number>source;\n~~~",
}, (files) => {
  const result = analyzeFiles(files, "all");
  assert.equal(result.fragments[0].count, 2);
  assert.ok(result.matrix[0][1] < 1);
}));

test("plain, inline and HTML Markdown are intentionally empty; malformed fences fail", () => fixtures({
  "plain.md": "Text Ω `run()` <script>run()</script>", "code.md": "```js\nrun();\n```",
}, (files, directory) => {
  const result = analyzeFiles(files, "all"); assert.equal(result.fragments[0].count, 0); assert.equal(result.matrix[0][1], 0);
  for (const source of ["```js\nrun();", "~~~ts\nconst x=1;", "```python\nx=1\n```", "```js\nconst =;\n```"] ) {
    const file = path.join(directory, "bad.md"); fs.writeFileSync(file, source);
    assert.throws(() => analyzeFiles([file], "all"));
  }
}));

test("UTF-8 is strict while valid BOM and Unicode remain source", () => {
  for (const bytes of [Buffer.from([0xff]), Buffer.from('const x="\ufffd";'), Buffer.from([0x63,0x6f,0x6e,0x73,0x74,0x20,0x78,0x3d,0x22,0xe2,0x82,0x22,0x3b])]) {
    fixtures({ "input.js": bytes }, ([file]) => {
      if (bytes.includes(0xff) || bytes.includes(0x82)) assert.throws(() => analyzeFiles([file], "all"), /UTF-8/);
      else assert.equal(analyzeFiles([file], "all").matrix[0][0], 1);
    });
  }
  fixtures({ "bom.ts": Buffer.from('\ufeffconst Ω: number=1;') }, ([file]) => assert.equal(analyzeFiles([file], "all").matrix[0][0], 1));
});

for (const width of [10, 10000, 50000, 130000]) test(`wide AST ${width} traverses without variadic push`, () => {
  fixtures({ "wide.js": "const values=[" + Array(width).fill("1").join(",") + "];" }, ([file]) => {
    assert.equal(analyzeFiles([file], AST_METRICS).matrices.ast_node_type_multiset_jaccard[0][0], 1);
  });
  const tree = new NormalizedAstNode("root", Array.from({ length: width }, () => new NormalizedAstNode("leaf")));
  assert.equal(countAstNodes(tree), width + 1);
  assert.equal(treeEditSimilarity(tree, null), 0);
});

test("discovery and tied ranking use stable Unicode code point order", () => fixtures({
  "😀.js": "const x=1", "\ue000.js": "const y=1", "ä.js": "const z=1", "z.js": "const a=1",
}, (files, directory) => {
  const expected = ["z.js", "ä.js", "\ue000.js", "😀.js"];
  assert.deepEqual(filesInDirectory(directory).map((file) => path.basename(file)), expected);
  assert.deepEqual(analyzeFiles(files, "all").ranking.map((row) => row.file), expected);
  // A file also works in restricted runners where child stdout is intercepted.
  const script = 'require("node:fs").writeFileSync(process.argv[3],JSON.stringify(require(process.argv[1]).filesInDirectory(process.argv[2]).map(p=>require("node:path").basename(p))))';
  for (const locale of ["C", "sv_SE.UTF-8"]) {
    const output = path.join(directory, "discovery.json");
    const result = spawnSync(process.execPath, ["-e", script, path.resolve(__dirname, "../src"), directory, output], { encoding: "utf8", env: { ...process.env, LANG: locale }, timeout: 10000 });
    assert.equal(result.status, 0, result.stderr); assert.deepEqual(JSON.parse(fs.readFileSync(output, "utf8")), expected);
  }
}));
