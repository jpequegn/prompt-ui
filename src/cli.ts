#!/usr/bin/env bun
/**
 * pui generate — generate a React component from a natural-language prompt.
 *
 * Usage:
 *   bun run src/cli.ts generate "<prompt>" [--verbose] [--serve] [--build]
 *
 * Steps executed:
 *   1. Parse natural-language prompt → ComponentSpec  (issue #1)
 *   2. Generate React component string from spec      (issue #2)
 *   3. Write temp workspace + serve / build           (issue #3)
 *
 * Flags:
 *   --verbose   Print raw LLM responses.
 *   --serve     After generating, start a local dev server (default when no --build).
 *   --build     After generating, produce a static bundle in temp/dist.
 */

import { parseSpec } from "./parseSpec.js";
import { generateComponent } from "./generateComponent.js";
import { Renderer } from "./renderer.js";

const args = process.argv.slice(2);
const verbose = args.includes("--verbose");
const wantBuild = args.includes("--build");
const wantServe = args.includes("--serve") || (!wantBuild);
const filteredArgs = args.filter(
  (a) => !["--verbose", "--serve", "--build"].includes(a)
);

const [command, prompt] = filteredArgs;

if (command !== "generate" || !prompt) {
  console.error(
    [
      'Usage: pui generate "<prompt>" [--verbose] [--serve] [--build]',
      "",
      "Examples:",
      '  pui generate "a login form with email, password, and a submit button that shows a spinner"',
      '  pui generate "a search bar with autocomplete" --build',
      '  pui generate "a product card" --serve --verbose',
    ].join("\n")
  );
  process.exit(1);
}

console.log(`Parsing spec for: "${prompt}"\n`);

const spec = await parseSpec(prompt, verbose);

if (verbose) {
  console.log("── Parsed ComponentSpec ──────────────────────────────");
  console.log(JSON.stringify(spec, null, 2));
  console.log("──────────────────────────────────────────────────────\n");
} else {
  console.log("Parsed spec:");
  console.log(JSON.stringify(spec, null, 2));
}

console.log("\nGenerating React component…\n");

const component = await generateComponent(spec, verbose);

if (verbose) {
  console.log("── Generated component ───────────────────────────────");
  console.log(component);
  console.log("──────────────────────────────────────────────────────\n");
}

// ── Renderer (issue #3) ───────────────────────────────────────────────────────

const renderer = new Renderer();
const tempDir = renderer.setup(component);
console.log(`✅ Temp workspace written to: ${tempDir}`);

if (wantBuild) {
  console.log("\nBuilding static bundle…");
  const distDir = await renderer.build();
  console.log(`✅ Bundle written to: ${distDir}`);
}

if (wantServe) {
  const url = await renderer.serve();
  console.log(`✅ Component served at: ${url}`);
  // Keep process alive until Ctrl+C
  await new Promise(() => {});
}
