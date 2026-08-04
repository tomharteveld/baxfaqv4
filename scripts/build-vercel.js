const fs = require("node:fs");
const path = require("node:path");

const rootDir = path.resolve(__dirname, "..");
const outDir = path.join(rootDir, "dist");
const files = ["index.html", "styles.css", "app.js", "data.js"];

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

for (const file of files) {
  fs.copyFileSync(path.join(rootDir, file), path.join(outDir, file));
}

fs.cpSync(path.join(rootDir, "assets"), path.join(outDir, "assets"), {
  recursive: true,
});

console.log(`Vercel build klaar: ${path.relative(rootDir, outDir)}`);
