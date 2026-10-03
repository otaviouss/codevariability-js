"use strict";
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

function rejectSymlink(target) {
  try {
    if (fs.lstatSync(target).isSymbolicLink()) throw new Error(`O destino de exportação não pode ser um link simbólico: ${target}.`);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

function writeJsonAtomic(target, content) {
  target = path.resolve(target);
  rejectSymlink(target);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temporary = path.join(path.dirname(target), `.codevariability-${process.pid}-${crypto.randomBytes(12).toString("hex")}.tmp`);
  try {
    fs.writeFileSync(temporary, content, { encoding: "utf8", flag: "wx", mode: 0o600 });
    rejectSymlink(target);
    fs.renameSync(temporary, target);
  } finally {
    fs.rmSync(temporary, { force: true });
  }
}

module.exports = { writeJsonAtomic };
