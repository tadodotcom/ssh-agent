const { execSync } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");
const process = require("node:process");

const buildDir = path.join(process.cwd(), "build");
const distDir = path.join(process.cwd(), "dist");

const buildIndexJs = path.join(buildDir, "index.js");
const distIndexJs = path.join(distDir, "index.js");
const distCleanupJs = path.join(distDir, "cleanup.js");

let ncc = "./node_modules/.bin/ncc";
if (process.platform === "win32") {
  ncc = ".\\node_modules\\.bin\\ncc.cmd";
}

if (!fs.existsSync(buildDir)) {
  fs.mkdirSync(buildDir);
}

// Build the main index.js file
console.log("Building index.js...");
execSync(`${ncc} build index.js -q -o ${buildDir}`);
if (fs.existsSync(distIndexJs)) {
  fs.unlinkSync(distIndexJs);
}
fs.renameSync(buildIndexJs, distIndexJs);

// Build the cleanup.js file
console.log("Building cleanup.js...");
execSync(`${ncc} build cleanup.js -q -o ${buildDir}`);
if (fs.existsSync(distCleanupJs)) {
  fs.unlinkSync(distCleanupJs);
}
fs.renameSync(buildIndexJs, distCleanupJs);

console.log("Cleaning up...");
fs.rmdirSync(buildDir);

console.log("Done");
