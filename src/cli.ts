#!/usr/bin/env bun
/**
 * pui generate — generate a React component from a natural-language prompt.
 *
 * Usage:
 *   bun run src/cli.ts generate "<prompt>" [--verbose]
 *
 * Steps executed:
 *   1. Parse natural-language prompt → ComponentSpec  (issue #1)
 *   2. Generate React component string from spec      (issue #2)
 *
 * Future steps (issues #3–#7):
 *   - Vite rendering
 *   - Self-critique loop
 *   - Playwright eval
 */

import { parseSpec } from "./parseSpec.js";
import { generateComponent } from "./generateComponent.js";

const args = process.argv.slice(2);
const verbose = args.includes("--verbose");
const filteredArgs = args.filter((a) => a !== "--verbose");

const [command, prompt] = filteredArgs;

if (command !== "generate" || !prompt) {
  console.error(
    'Usage: pui generate "<prompt>" [--verbose]\n\nExample:\n  pui generate "a login form with email, password, and a submit button that shows a spinner" --verbose'
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

console.log("── Generated component ───────────────────────────────");
console.log(component);
console.log("──────────────────────────────────────────────────────");
