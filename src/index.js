const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const parser = require("@babel/parser");
const { version: PARSER_VERSION } = require("@babel/parser/package.json");
const { version: ADAPTER_VERSION } = require("../package.json");
const { TextDecoder } = require("util");
const { extractCodeFragments, parserOptions } = require("./fragments");
const {
  astChildren,
  syntheticProgram,
  treeEditSimilarity,
} = require("./ast-tree-edit");

const CODE_EXTENSIONS = new Set([".js", ".jsx", ".ts", ".tsx", ".md", ".markdown"]);
const AST_NODE_TYPE_MULTISET_JACCARD_METRIC = "ast_node_type_multiset_jaccard";
const AST_NODE_TYPE_MULTISET_JACCARD_METRIC_ID = "ast_node_type_multiset_jaccard_v2";
const AST_TREE_EDIT_METRIC = "ast_tree_edit_similarity";
const AST_TREE_EDIT_METRIC_ID = "ast_tree_edit_similarity_v2";
const AST_CACHE_PIPELINE_VERSION = "babel_ast_pipeline_v3";

function flattenAst(node, types = []) {
  if (!node || typeof node !== "object") return types;
  const pending = [node];
  while (pending.length) {
    const current = pending.pop();
    if (current.type) types.push(current.type);
    const children = astChildren(current);
    for (let index = children.length - 1; index >= 0; index -= 1) pending.push(children[index]);
  }
  return types;
}

function parseFragment(filePath, fragment, index) {
  try {
    const ast = parser.parse(fragment.code, parserOptions(fragment.language));
    if (ast.errors.length) throw ast.errors[0];
    return ast;
  } catch (error) {
    throw new Error(`${filePath} (fragmento ${index + 1}, linha de origem ${fragment.startLine}): ${error.message}`, { cause: error });
  }
}

function multisetJaccard(left, right) {
  const counts = (values) => values.reduce((result, value) => {
    result.set(value, (result.get(value) || 0) + 1);
    return result;
  }, new Map());
  const leftCounts = counts(left), rightCounts = counts(right);
  const allTypes = new Set([...leftCounts.keys(), ...rightCounts.keys()]);
  let intersection = 0, union = 0;
  for (const type of allTypes) {
    intersection += Math.min(leftCounts.get(type) || 0, rightCounts.get(type) || 0);
    union += Math.max(leftCounts.get(type) || 0, rightCounts.get(type) || 0);
  }
  return union === 0 ? 1 : intersection / union;
}

const AST_METRIC_DEFINITIONS = Object.freeze({
  [AST_NODE_TYPE_MULTISET_JACCARD_METRIC]: Object.freeze({
    buildTree: (asts) => asts.flatMap((ast) => flattenAst(ast)),
    similarity: multisetJaccard,
    normalization: "babel_ast_node_type_multiset_v3",
    id: AST_NODE_TYPE_MULTISET_JACCARD_METRIC_ID,
  }),
  [AST_TREE_EDIT_METRIC]: Object.freeze({
    buildTree: syntheticProgram,
    similarity: treeEditSimilarity,
    normalization: "babel_normalized_ast_tree_v3",
    id: AST_TREE_EDIT_METRIC_ID,
  }),
});
const AST_METRICS = Object.freeze(Object.keys(AST_METRIC_DEFINITIONS));

function metricSelection(metrics) {
  if (metrics === undefined) throw new Error("Selecione explicitamente uma métrica AST ou 'all'.");
  // "all" means every metric in the standard methodology. The old multiset
  // baseline remains available only through explicit selection.
  const selected = metrics === "all" ? [AST_TREE_EDIT_METRIC] : Array.isArray(metrics) ? [...metrics] : [metrics];
  if (selected.length === 0) throw new Error("Informe ao menos uma métrica AST.");
  const unknown = selected.filter((metric) => !Object.hasOwn(AST_METRIC_DEFINITIONS, metric));
  if (unknown.length) throw new Error(`Métrica AST desconhecida: ${unknown.join(", ")}.`);
  if (new Set(selected).size !== selected.length) throw new Error("Não repita métricas AST na mesma análise.");
  return selected;
}

function quantile(sorted, fraction) {
  const position = (sorted.length - 1) * fraction;
  const lower = Math.floor(position), upper = Math.ceil(position);
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

function summarize(matrix) {
  const values = [];
  for (let row = 0; row < matrix.length; row += 1) {
    for (let column = row + 1; column < matrix.length; column += 1) values.push(matrix[row][column]);
  }
  if (values.length === 0) return {
    n_files: matrix.length, n_pairs: 0, mean_similarity: null, median_similarity: null,
    std_similarity: null, min_similarity: null, max_similarity: null,
    q1_similarity: null, q3_similarity: null, mean_variability: null,
  };
  const sorted = [...values].sort((left, right) => left - right);
  const mean = values.reduce((total, value) => total + value, 0) / values.length;
  const variance = values.length === 1 ? 0 : values.reduce((total, value) => total + (value - mean) ** 2, 0) / (values.length - 1);
  return {
    n_files: matrix.length,
    n_pairs: values.length,
    mean_similarity: mean,
    median_similarity: quantile(sorted, 0.5),
    std_similarity: Math.sqrt(variance),
    min_similarity: sorted[0],
    max_similarity: sorted[sorted.length - 1],
    q1_similarity: quantile(sorted, 0.25),
    q3_similarity: quantile(sorted, 0.75),
    mean_variability: 1 - mean,
  };
}

function compareFileNames(left, right) {
  const a = Array.from(left, (character) => character.codePointAt(0));
  const b = Array.from(right, (character) => character.codePointAt(0));
  for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return a.length - b.length;
}

function compareRankRows(left, right) {
  if (left.score !== right.score) return right.score - left.score;
  return compareFileNames(left.file, right.file);
}

function contentFingerprint(source, filePath) {
  return crypto.createHash("sha256")
    .update(path.extname(filePath).toLowerCase(), "utf8")
    .update("\0", "utf8")
    .update(source, "utf8")
    .digest("hex");
}

function pairCacheEntry(cacheDir, definition, leftFingerprint, rightFingerprint) {
  const pair = [leftFingerprint, rightFingerprint].sort();
  const key = crypto.createHash("sha256").update(JSON.stringify({
    adapter: ADAPTER_VERSION,
    pipeline: AST_CACHE_PIPELINE_VERSION,
    metric: definition.id,
    normalization: definition.normalization,
    parser: PARSER_VERSION,
    pair,
  })).digest("hex");
  return { key, path: path.join(cacheDir, definition.id, `${key}.json`) };
}

function readCachedSimilarity(cachePath, expectedKey) {
  try {
    const payload = JSON.parse(fs.readFileSync(cachePath, "utf8"));
    return payload && payload.schema === "codevariability.ted-cache.v1"
      && payload.key === expectedKey
      && typeof payload.similarity === "number"
      && Number.isFinite(payload.similarity)
      && payload.similarity >= 0 && payload.similarity <= 1
      ? payload.similarity
      : undefined;
  } catch (error) {
    if (error.code === "ENOENT" || error instanceof SyntaxError) return undefined;
    throw error;
  }
}

function writeCachedSimilarity(cachePath, key, similarity) {
  fs.mkdirSync(path.dirname(cachePath), { recursive: true });
  const temporary = `${cachePath}.tmp-${process.pid}-${crypto.randomBytes(6).toString("hex")}`;
  fs.writeFileSync(temporary, `${JSON.stringify({
    schema: "codevariability.ted-cache.v1",
    key,
    similarity,
  })}\n`, "utf8");
  try {
    fs.renameSync(temporary, cachePath);
  } catch (error) {
    try { fs.unlinkSync(temporary); } catch (_cleanupError) { /* another writer may have won */ }
    if (!fs.existsSync(cachePath)) throw error;
  }
}

function rankMatrix(files, matrix) {
  return files.map((file, index) => ({
    file,
    score: files.length === 1
      ? 1
      : matrix[index].reduce((total, value, column) => total + (column === index ? 0 : value), 0) / (files.length - 1),
  })).sort(compareRankRows).map((row, index) => ({ rank: index + 1, ...row }));
}

function analyzeFiles(paths, metrics, options = {}) {
  if (!Array.isArray(paths) || paths.length === 0) throw new Error("Informe ao menos um arquivo de código.");
  if (!options || typeof options !== "object" || Array.isArray(options)) throw new Error("options deve ser um objeto.");
  const onProgress = typeof options.onProgress === "function" ? options.onProgress : () => {};
  const cacheDir = options.cacheDir ? path.resolve(options.cacheDir) : undefined;
  const maxCells = options.maxCells === undefined ? 2000000 : options.maxCells;
  if (maxCells !== null && (!Number.isSafeInteger(maxCells) || maxCells < 1)) throw new Error("maxCells deve ser um inteiro positivo ou null.");
  const selected = metricSelection(metrics);
  const unsupported = paths.filter((filePath) => !CODE_EXTENSIONS.has(path.extname(filePath).toLowerCase()));
  if (unsupported.length) {
    throw new Error(`Extensão não suportada para análise AST: ${unsupported.map((item) => path.basename(item)).join(", ")}.`);
  }
  const files = paths.map((filePath) => path.basename(filePath));
  if (new Set(files).size !== files.length) throw new Error("Os nomes-base dos arquivos devem ser únicos.");
  const warnings = [];
  const fragments = [];
  const rawSources = paths.map((filePath) => fs.readFileSync(filePath));
  const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
  const sources = rawSources.map((source, index) => {
    try { return decoder.decode(source); }
    catch (error) { throw new Error(`${paths[index]}: UTF-8 inválido.`, { cause: error }); }
  });
  const fingerprints = sources.map((source, index) => contentFingerprint(source, paths[index]));
  const astsByFile = paths.map((filePath, fileIndex) => {
    const file = path.basename(filePath);
    const extracted = extractCodeFragments(sources[fileIndex], filePath);
    extracted.warnings.forEach((code) => warnings.push({ file, code }));
    fragments.push({ file, count: extracted.fragments.length, source_lines: extracted.fragments.map((item, index) => ({
      fragment: index + 1,
      start_line: item.startLine,
      end_line: item.startLine + item.code.split(/\r?\n/).length - 1,
    })) });
    const asts = extracted.fragments.map((fragment, index) => parseFragment(filePath, fragment, index))
      .filter((ast) => ast.program.body.length || ast.program.directives.length);
    onProgress({ phase: "parse", current: fileIndex + 1, total: paths.length, file });
    return asts;
  });
  const matrices = {};
  const cache = { enabled: Boolean(cacheDir), hits: 0, misses: 0, writes: 0, errors: 0 };
  for (const metric of selected) {
    const definition = AST_METRIC_DEFINITIONS[metric];
    const trees = astsByFile.map((asts) => definition.buildTree(asts));
    const matrix = trees.map((_tree, row) => trees.map((_other, column) => row === column ? 1 : 0));
    const total = paths.length * (paths.length - 1) / 2;
    let current = 0;
    for (let row = 0; row < trees.length; row += 1) {
      for (let column = row + 1; column < trees.length; column += 1) {
        const cacheEntry = cacheDir
          ? pairCacheEntry(cacheDir, definition, fingerprints[row], fingerprints[column])
          : undefined;
        let similarity;
        if (cacheEntry) {
          try {
            similarity = readCachedSimilarity(cacheEntry.path, cacheEntry.key);
          } catch (error) {
            cache.errors += 1;
            onProgress({ phase: "cache_warning", message: error.message });
          }
        }
        const cached = similarity !== undefined;
        if (cached) cache.hits += 1;
        else {
          if (cacheDir) cache.misses += 1;
          similarity = definition.similarity(trees[row], trees[column], maxCells);
          if (cacheEntry) {
            try {
              writeCachedSimilarity(cacheEntry.path, cacheEntry.key, similarity);
              cache.writes += 1;
            } catch (error) {
              cache.errors += 1;
              onProgress({ phase: "cache_warning", message: error.message });
            }
          }
        }
        matrix[row][column] = similarity;
        matrix[column][row] = similarity;
        current += 1;
        onProgress({ phase: "compare", metric, current, total, cached });
      }
    }
    matrices[metric] = matrix;
  }
  const statistics = Object.fromEntries(selected.map((metric) => [metric, summarize(matrices[metric])]));
  const rankingsByMetric = Object.fromEntries(selected.map((metric) => [metric, rankMatrix(files, matrices[metric])]));
  const scoreMaps = Object.fromEntries(selected.map((metric) => [metric,
    new Map(rankingsByMetric[metric].map((row) => [row.file, row.score]))]));
  // Both AST metrics remain inspectable, but TED is the canonical structural
  // score when available. This prevents the legacy frequency baseline from
  // counting as a second structural dimension in the aggregate ranking.
  const structuralMetrics = selected.includes(AST_TREE_EDIT_METRIC)
    ? [AST_TREE_EDIT_METRIC]
    : selected;
  const representativeness = files.map((file) => {
    const row = { file };
    for (const metric of selected) row[metric] = scoreMaps[metric].get(file);
    row.structuralScore = structuralMetrics.reduce((total, metric) => total + row[metric], 0)
      / structuralMetrics.length;
    row.overallScore = row.structuralScore;
    return row;
  });
  const ranking = representativeness.map(({ file, overallScore: score }) => ({ file, score }))
    .sort(compareRankRows).map((row, index) => ({ rank: index + 1, ...row }));
  const result = {
    schema_version: selected.length === 1 ? "codevariability.matrix.v1" : "codevariability.analysis.v1",
    files,
    metrics: selected,
    matrices,
    statistics,
    representativeness,
    rankingsByMetric,
    ranking,
    mostRepresentative: ranking[0],
    mostDistinct: ranking[ranking.length - 1],
    metadata: {
      adapter: "codevariability-js",
      adapter_version: ADAPTER_VERSION,
      metrics: selected,
      parser: "@babel/parser",
      runtime_versions: { node: process.versions.node, babel_parser: PARSER_VERSION },
      input_sha256: Object.fromEntries(files.map((file, index) => [file,
        crypto.createHash("sha256").update(rawSources[index]).digest("hex")])),
      normalization: selected.length === 1 ? AST_METRIC_DEFINITIONS[selected[0]].normalization : "per_metric",
      metric_normalizations: Object.fromEntries(selected.map((metric) => [metric, AST_METRIC_DEFINITIONS[metric].normalization])),
      metric_ids: Object.fromEntries(selected.map((metric) => [metric, AST_METRIC_DEFINITIONS[metric].id])),
      metric_dimensions: Object.fromEntries(selected.map((metric) => [metric, "structural_ast"])),
      overall_aggregation: {
        method: "equal_weighted_available_dimensions_v1",
        structural_metrics: structuralMetrics,
      },
      cache,
    },
    fragments,
    warnings,
  };
  // A single metric also exposes the documented matrix interchange fields.
  if (selected.length === 1) {
    result.metric = selected[0];
    result.metric_id = AST_METRIC_DEFINITIONS[selected[0]].id;
    result.matrix = matrices[selected[0]];
  }
  return result;
}

function filesInDirectory(directory) {
  if (!directory || !fs.existsSync(directory) || !fs.statSync(directory).isDirectory()) {
    throw new Error(`Diretório não encontrado ou inválido: ${directory || "<vazio>"}.`);
  }
  return fs.readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((file) => CODE_EXTENSIONS.has(path.extname(file).toLowerCase()))
    .sort(compareFileNames)
    .map((file) => path.join(directory, file));
}

module.exports = {
  AST_METRICS,
  AST_NODE_TYPE_MULTISET_JACCARD_METRIC,
  AST_NODE_TYPE_MULTISET_JACCARD_METRIC_ID,
  AST_TREE_EDIT_METRIC,
  AST_TREE_EDIT_METRIC_ID,
  analyzeFiles,
  filesInDirectory,
};
