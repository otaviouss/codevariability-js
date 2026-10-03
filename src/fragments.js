"use strict";
const path = require("path");

function lineAt(source, offset) {
  return source.slice(0, offset).split(/\r?\n/).length;
}

function splitCompositeModule(fragment) {
  const directive = /^[ \t]*(["'])use strict\1;[ \t]*(?:\r?\n|$)/gm;
  const offsets = [...fragment.code.matchAll(directive)].map((match) => match.index);
  if (offsets.length < 2) return [fragment];
  return offsets.map((offset, index) => ({
    code: fragment.code.slice(offset, offsets[index + 1]),
    startLine: fragment.startLine + lineAt(fragment.code, offset) - 1,
  })).filter((item) => item.code.trim());
}

function extractCodeFragments(source, filePath) {
  const markdown = !filePath || [".md", ".markdown"].includes(path.extname(filePath).toLowerCase());
  // A real source file must not be reinterpreted as Markdown or composite modules.
  if (!markdown) return { fragments: [{ code: source, startLine: 1 }], warnings: [] };
  const warnings = [];
  const fenced = [];
  let delimiter, width, language, startLine;
  let code = [];
  const lines = source.split(/(?<=\n)/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const stripped = line.trim();
    if (delimiter) {
      if (stripped.length >= width && [...stripped].every((c) => c === delimiter)) {
        if (!["", "javascript", "js", "jsx", "typescript", "ts", "tsx"].includes(language)) {
          throw new Error(`Linguagem de fence incompatível com AST JavaScript: ${language}.`);
        }
        if (code.join("").trim()) fenced.push({ code: code.join(""), startLine });
        delimiter = undefined;
        code = [];
        warnings.push("markdown_fences_extracted");
      } else code.push(line);
      continue;
    }
    const candidate = line.replace(/^[ \t]*/, "");
    if (!["`", "~"].includes(candidate[0])) continue;
    const marker = candidate[0];
    let count = 0;
    while (candidate[count] === marker) count += 1;
    if (count < 3) continue;
    const info = candidate.slice(count).trim();
    if (marker === "`" && info.includes("`")) continue;
    delimiter = marker;
    width = count;
    language = (info.split(/\s+/)[0] || "").toLowerCase();
    startLine = index + 2;
  }
  if (delimiter) throw new Error(`Fence Markdown sem fechamento (linha ${startLine - 1}).`);
  const fragments = warnings.length ? fenced : filePath ? [] : [{ code: source, startLine: 1 }];
  const split = fragments.flatMap(splitCompositeModule);
  if (split.length > fragments.length) warnings.push("composite_modules_split");
  return { fragments: split, warnings: [...new Set(warnings)] };
}

module.exports = { extractCodeFragments };
