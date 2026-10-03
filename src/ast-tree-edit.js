"use strict";

/** A parser-independent node for an ordered, normalized syntax tree. */
class NormalizedAstNode {
  constructor(label, children = []) {
    this.label = label;
    this.children = children;
  }
}

const IGNORED_FIELDS = new Set([
  "loc", "location", "range", "start", "end", "line", "column", "offset",
  "tokens", "comments", "leadingComments", "innerComments", "trailingComments",
  "raw", "rawValue", "extra", "parent", "errors",
]);

const IDENTIFIER_TYPES = new Set([
  "Identifier", "JSXIdentifier", "PrivateName",
]);

// These parser scalars change syntax or evaluation structure. Concrete names
// and literal payloads remain excluded by the identifier/literal branches.
const STRUCTURAL_SCALAR_FIELDS = [
  "operator", "kind", "async", "generator", "computed", "optional", "prefix",
  "sourceType", "method", "shorthand", "static", "declare", "definite",
  "abstract", "readonly", "accessibility", "importKind", "exportKind",
];

function literalCategory(node) {
  if (node.type !== "Literal") return node.type;
  if (node.regex) return "RegExpLiteral";
  if (node.bigint !== undefined) return "BigIntLiteral";
  if (node.value === null) return "NullLiteral";
  if (typeof node.value === "number") return "NumericLiteral";
  if (typeof node.value === "string") return "StringLiteral";
  if (typeof node.value === "boolean") return "BooleanLiteral";
  return "Literal";
}

function nodeLabel(node) {
  let label = literalCategory(node);
  if (IDENTIFIER_TYPES.has(node.type)) label = node.type;
  if (label !== node.type || /^(?:String|Numeric|Boolean|Null|BigInt|Decimal|RegExp)Literal$/.test(node.type)
      || node.type === "TemplateElement" || node.type === "DirectiveLiteral") return label;
  for (const field of STRUCTURAL_SCALAR_FIELDS) {
    const value = node[field];
    if (typeof value === "string" || typeof value === "boolean" || typeof value === "number") {
      label += `:${field}=${String(value)}`;
    }
  }
  return label;
}

function astChildren(node) {
  const children = [];
  for (const [field, value] of Object.entries(node)) {
    if (field === "type" || STRUCTURAL_SCALAR_FIELDS.includes(field) || IGNORED_FIELDS.has(field)) continue;
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item && typeof item === "object" && typeof item.type === "string") children.push(item);
      }
    } else if (value && typeof value === "object" && typeof value.type === "string") {
      children.push(value);
    }
  }
  return children;
}

/** Convert a Babel/ESTree-compatible AST node to the canonical ordered tree. */
function normalizeAst(ast) {
  if (ast == null) return null;
  if (typeof ast !== "object" || typeof ast.type !== "string") {
    throw new TypeError("normalizeAst() expects an AST node with a string type");
  }
  const normalized = new Map();
  const pending = [[ast, false]];
  while (pending.length) {
    const [node, visited] = pending.pop();
    const children = astChildren(node);
    if (!visited) {
      pending.push([node, true]);
      for (let i = children.length - 1; i >= 0; i -= 1) pending.push([children[i], false]);
    } else normalized.set(node, new NormalizedAstNode(nodeLabel(node), children.map((child) => normalized.get(child))));
  }
  return normalized.get(ast);
}

function syntheticProgram(asts) {
  return new NormalizedAstNode("SyntheticProgram", asts.map((ast) =>
    new NormalizedAstNode("Fragment", [normalizeAst(ast)])));
}

function countAstNodes(tree) {
  if (tree == null) return 0;
  let count = 0;
  const stack = [tree];
  while (stack.length) {
    const node = stack.pop();
    count += 1;
    stack.push(...node.children);
  }
  return count;
}

function treesEqual(left, right) {
  const pending = [[left, right]];
  while (pending.length) {
    const [leftNode, rightNode] = pending.pop();
    if (leftNode.label !== rightNode.label || leftNode.children.length !== rightNode.children.length) return false;
    for (let index = 0; index < leftNode.children.length; index += 1) {
      pending.push([leftNode.children[index], rightNode.children[index]]);
    }
  }
  return true;
}

function postorder(tree) {
  const nodes = [null];
  const leftmost = [0];
  const completed = [];
  const stack = [[tree, false]];
  while (stack.length) {
    const [node, visited] = stack.pop();
    if (!visited) {
      stack.push([node, true]);
      for (let index = node.children.length - 1; index >= 0; index -= 1) stack.push([node.children[index], false]);
      continue;
    }
    const index = nodes.length;
    const descendant = node.children.length ? completed[completed.length - node.children.length][1] : index;
    if (node.children.length) completed.splice(completed.length - node.children.length);
    nodes.push(node);
    leftmost.push(descendant);
    completed.push([index, descendant]);
  }
  const lastForLeftmost = new Map();
  for (let index = 1; index < nodes.length; index += 1) lastForLeftmost.set(leftmost[index], index);
  return { nodes, leftmost, keyroots: [...lastForLeftmost.values()].sort((a, b) => a - b) };
}

/** Ordered Zhang-Shasha distance with unit insert/delete/replace costs. */
function treeEditDistance(left, right, maxCells = 2000000) {
  if (maxCells !== null && (!Number.isSafeInteger(maxCells) || maxCells < 1)) {
    throw new Error("maxCells deve ser um inteiro positivo ou null.");
  }
  if (left == null) return countAstNodes(right);
  if (right == null) return countAstNodes(left);
  if (treesEqual(left, right)) return 0;

  const leftData = postorder(left);
  const rightData = postorder(right);
  const rightCount = rightData.nodes.length - 1;
  const width = rightCount + 1;
  const cells = leftData.nodes.length * rightData.nodes.length;
  if (maxCells !== null && cells > maxCells) throw new Error(`TED requer ${cells} células; limite maxCells=${maxCells}.`);
  const treeDistances = new Uint32Array(cells);

  for (const leftRoot of leftData.keyroots) {
    const leftStart = leftData.leftmost[leftRoot];
    const rows = leftRoot - leftStart + 2;
    for (const rightRoot of rightData.keyroots) {
      const rightStart = rightData.leftmost[rightRoot];
      const columns = rightRoot - rightStart + 2;
      const forest = new Uint32Array(rows * columns);
      for (let row = 1; row < rows; row += 1) forest[row * columns] = row;
      for (let column = 1; column < columns; column += 1) forest[column] = column;

      for (let leftIndex = leftStart; leftIndex <= leftRoot; leftIndex += 1) {
        const row = leftIndex - leftStart + 1;
        for (let rightIndex = rightStart; rightIndex <= rightRoot; rightIndex += 1) {
          const column = rightIndex - rightStart + 1;
          const deletion = forest[(row - 1) * columns + column] + 1;
          const insertion = forest[row * columns + column - 1] + 1;
          let value;
          if (leftData.leftmost[leftIndex] === leftStart && rightData.leftmost[rightIndex] === rightStart) {
            const replacement = forest[(row - 1) * columns + column - 1]
              + (leftData.nodes[leftIndex].label === rightData.nodes[rightIndex].label ? 0 : 1);
            value = Math.min(deletion, insertion, replacement);
            treeDistances[leftIndex * width + rightIndex] = value;
          } else {
            const prefixRow = leftData.leftmost[leftIndex] - leftStart;
            const prefixColumn = rightData.leftmost[rightIndex] - rightStart;
            const subtree = treeDistances[leftIndex * width + rightIndex];
            value = Math.min(deletion, insertion, forest[prefixRow * columns + prefixColumn] + subtree);
          }
          forest[row * columns + column] = value;
        }
      }
    }
  }
  return treeDistances[(leftData.nodes.length - 1) * width + rightCount];
}

/** Normalize exact ordered TED to similarity without a corrective clamp.
 *
 * For non-empty trees, n + m - 1 is an upper bound: retain/relabel one root,
 * delete the other n - 1 nodes, and insert the other m - 1 nodes.  Empty-tree
 * pairs use their explicitly defined results.
 */
function treeEditSimilarity(left, right, maxCells = 2000000) {
  const leftSize = countAstNodes(left);
  const rightSize = countAstNodes(right);
  if (leftSize === 0 && rightSize === 0) return 1;
  if (leftSize === 0 || rightSize === 0) return 0;
  const denominator = leftSize + rightSize - 1;
  const distance = treeEditDistance(left, right, maxCells);
  if (distance > denominator) throw new Error("tree edit distance exceeded its normalization upper bound");
  return 1 - distance / denominator;
}

module.exports = {
  NormalizedAstNode,
  astChildren,
  countAstNodes,
  normalizeAst,
  syntheticProgram,
  treeEditDistance,
  treeEditSimilarity,
};
