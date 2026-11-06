import { build } from "vite";
import { Resvg } from "@resvg/resvg-js";
import { readFile, mkdir, writeFile, copyFile } from "node:fs/promises";
const pkg = JSON.parse(await readFile("package.json", "utf8"));
const manifest = JSON.parse(await readFile("manifest.json", "utf8"));
if (manifest.version !== pkg.version)
  throw new Error("package.json and manifest.json versions must match.");
await build();
await build({
  configFile: false,
  build: {
    target: "chrome116",
    sourcemap: false,
    outDir: "dist",
    emptyOutDir: false,
    lib: {
      entry: "src/content/index.ts",
      name: "ChudinNotesContent",
      formats: ["iife"],
      fileName: () => "content.js",
    },
  },
});
await mkdir("dist/icons", { recursive: true });
const svg = await readFile("assets/icon.svg");
for (const size of [16, 32, 48, 128])
  await writeFile(
    `dist/icons/${size}.png`,
    new Resvg(svg, { fitTo: { mode: "width", value: size } }).render().asPng(),
  );
await copyFile("manifest.json", "dist/manifest.json");
await copyFile("LICENSE", "dist/LICENSE");
console.log(
  `Built ${manifest.name} ${manifest.version} in dist/ (no browser launched).`,
);
