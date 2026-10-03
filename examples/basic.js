const assert = require("node:assert/strict");
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
  assert.equal(result.schema_version, "codevariability.matrix.v1");
  assert.ok(result.matrix[0][1] >= 0 && result.matrix[0][1] < 1);
} finally {
  fs.rmSync(directory, { recursive: true, force: true });
}
