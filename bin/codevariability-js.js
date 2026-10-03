#!/usr/bin/env node
const { version } = require("../package.json");
const { AST_METRICS, analyzeFiles, filesInDirectory } = require("../src");
const { writeJsonAtomic } = require("../src/output");

function usage(stream = process.stderr) {
  stream.write("Usage: codevariability-js ast (--directory <folder> | <files...>) --metric <name|all> [--output <file>] [--cache-dir <folder>] [--max-cells <integer|none>] [--progress]\n");
}
const args = process.argv.slice(2);
if (args.length === 1 && ["--help", "-h"].includes(args[0])) { usage(process.stdout); process.exit(0); }
if (args.length === 1 && ["--version", "-v"].includes(args[0])) { console.log(`codevariability-js ${version}`); process.exit(0); }
if (args.shift() !== "ast") { usage(); process.exit(2); }
if (args.some((item) => ["--help", "-h"].includes(item))) { usage(process.stdout); process.exit(0); }
if (args.some((item) => ["--version", "-v"].includes(item))) { console.log(`codevariability-js ${version}`); process.exit(0); }
let directory, output, metric, cacheDir, maxCells, progress = false;
const files = [];
for (let index = 0; index < args.length; index += 1) {
  if (args[index] === "--directory") {
    if (!args[index + 1] || args[index + 1].startsWith("--")) { usage(); process.exit(2); }
    directory = args[++index];
  }
  else if (args[index] === "--output") {
    if (!args[index + 1] || args[index + 1].startsWith("--")) { usage(); process.exit(2); }
    output = args[++index];
  }
  else if (args[index] === "--metric") {
    if (!args[index + 1] || args[index + 1].startsWith("--")) { usage(); process.exit(2); }
    metric = args[++index];
  }
  else if (args[index] === "--cache-dir") {
    if (!args[index + 1] || args[index + 1].startsWith("--")) { usage(); process.exit(2); }
    cacheDir = args[++index];
  }
  else if (args[index] === "--max-cells") {
    const value = args[++index];
    if (!value) { usage(); process.exit(2); }
    maxCells = value === "none" ? null : /^\d+$/.test(value) ? Number(value) : NaN;
    if (maxCells !== null && (!Number.isSafeInteger(maxCells) || maxCells < 1)) { usage(); process.exit(2); }
  }
  else if (args[index] === "--progress") progress = true;
  else if (args[index].startsWith("--")) { usage(); process.exit(2); }
  else files.push(args[index]);
}
if ((directory && files.length) || (!directory && !files.length) || !metric) { usage(); process.exit(2); }
try {
  if (metric && metric !== "all" && !AST_METRICS.includes(metric)) throw new Error(`Métrica AST desconhecida: ${metric}.`);
  let lastProgress = "";
  const result = analyzeFiles(directory ? filesInDirectory(directory) : files, metric, {
    onProgress: progress ? (event) => {
      if (event.phase === "cache_warning") {
        process.stderr.write(`[AST cache] warning: ${event.message}\n`);
        return;
      }
      const percentage = event.total ? Math.floor(event.current * 100 / event.total) : 100;
      const bucket = event.current === event.total ? 100 : Math.floor(percentage / 5) * 5;
      const key = `${event.phase}:${event.metric || ""}:${bucket}`;
      if (key === lastProgress) return;
      lastProgress = key;
      if (event.phase === "parse") {
        process.stderr.write(`[AST] parsing ${event.current}/${event.total}: ${event.file}\n`);
      } else {
        process.stderr.write(`[AST] ${event.metric}: ${event.current}/${event.total} pairs (${percentage}%)${event.cached ? " [cache]" : ""}\n`);
      }
    } : undefined,
    cacheDir,
    maxCells,
  });
  const content = `${JSON.stringify(result, null, 2)}\n`;
  if (output) writeJsonAtomic(output, content);
  else process.stdout.write(content);
} catch (error) { console.error(`codevariability-js: ${error.message}`); process.exit(1); }
