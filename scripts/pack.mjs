import { readdir, readFile, writeFile, mkdir, lstat } from "node:fs/promises";
import { zipSync } from "fflate";
const pkg = JSON.parse(await readFile("package.json", "utf8"));
const manifest = JSON.parse(await readFile("dist/manifest.json", "utf8"));
if (pkg.version !== manifest.version)
  throw new Error("Stale build version; run npm run build first.");
const allowed =
  /^(manifest\.json|LICENSE|sidepanel\.(html|js)|notebook\.(html|js)|service-worker\.js|content\.js|icons\/(16|32|48|128)\.png|assets\/[\w.-]+\.(js|css))$/;
const entries = {};
async function collect(directory, prefix = "") {
  for (const entry of (await readdir(directory)).sort()) {
    const name = `${prefix}${entry}`;
    const path = `${directory}/${entry}`;
    const info = await lstat(path);
    if (info.isSymbolicLink()) throw new Error(`Symlink rejected: ${name}`);
    if (info.isDirectory()) {
      if (!["assets", "icons"].includes(name))
        throw new Error(`Unexpected build directory: ${name}`);
      await collect(path, `${name}/`);
    } else {
      if (!info.isFile() || !allowed.test(name))
        throw new Error(`Unexpected build file: ${name}`);
      entries[name] = [
        new Uint8Array(await readFile(path)),
        { mtime: new Date("1980-01-01T00:00:00Z") },
      ];
    }
  }
}
await collect("dist");
for (const required of [
  "manifest.json",
  "LICENSE",
  "sidepanel.html",
  "sidepanel.js",
  "notebook.html",
  "notebook.js",
  "service-worker.js",
  "content.js",
  "icons/16.png",
  "icons/32.png",
  "icons/48.png",
  "icons/128.png",
])
  if (!(required in entries))
    throw new Error(`Missing runtime entry: ${required}`);
await mkdir("artifacts", { recursive: true });
const path = `artifacts/chudin-note-youtube-${pkg.version}.zip`;
await writeFile(path, zipSync(entries, { level: 9 }));
console.log(`Packaged ${Object.keys(entries).length} runtime files: ${path}`);
