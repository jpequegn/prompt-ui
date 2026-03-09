/**
 * Renderer — writes a temp workspace with the generated component code and
 * either builds a static bundle or serves it locally via Bun.
 *
 * Temp layout:
 *   temp/
 *     src/
 *       Component.tsx   ← generated code (passed in by caller)
 *       App.tsx         ← thin wrapper that renders <Component />
 *       main.tsx        ← ReactDOM.createRoot entry-point
 *     index.html        ← HTML shell that loads main.tsx
 *
 * API:
 *   Renderer.setup(componentCode)  → writes temp dir, returns its path
 *   Renderer.build()               → bundles with `bun build`, returns dist path
 *   Renderer.serve()               → starts Bun.serve(), returns localhost URL
 */

import * as path from "node:path";
import * as fs from "node:fs/promises";

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Root of the temp workspace, always relative to the project root */
const TEMP_DIR = path.resolve(import.meta.dir, "..", "temp");

/** Extract the component name from the generated code (default export). */
function extractComponentName(code: string): string {
  // Try: export default function FooBar
  const namedMatch = code.match(/export\s+default\s+function\s+([A-Za-z][A-Za-z0-9_]*)/);
  if (namedMatch?.[1]) return namedMatch[1];

  // Try: export default FooBar (variable / class reference)
  const refMatch = code.match(/export\s+default\s+([A-Za-z][A-Za-z0-9_]*)/);
  if (refMatch?.[1]) return refMatch[1];

  return "GeneratedComponent";
}

// ── Renderer class ────────────────────────────────────────────────────────────

export class Renderer {
  private componentName: string = "GeneratedComponent";
  private built = false;

  // ── setup ───────────────────────────────────────────────────────────────────

  /**
   * Write the temp workspace with the generated component code.
   *
   * @param componentCode - The raw TSX component source (no imports required).
   * @returns The absolute path of the temp directory.
   */
  setup(componentCode: string): string {
    // Detect the component name so App.tsx can reference it correctly.
    this.componentName = extractComponentName(componentCode);
    this.built = false;

    const srcDir = path.join(TEMP_DIR, "src");

    // The generated code has no imports (as per generateComponent rules).
    // We add the React import here so it works inside a normal bundler scope.
    const componentWithImport = `import React from "react";\n\n${componentCode}`;

    const appTsx = `import React from "react";
import ${this.componentName} from "./Component";

export default function App() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-8">
      <${this.componentName} />
    </div>
  );
}
`;

    const mainTsx = `import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";

const container = document.getElementById("root");
if (!container) throw new Error("No #root element found");

createRoot(container).render(<App />);
`;

    const indexHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>prompt-ui preview</title>
    <!-- Tailwind CSS CDN for preview -->
    <script src="https://cdn.tailwindcss.com"></script>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./src/main.tsx"></script>
  </body>
</html>
`;

    // Use synchronous fs calls inside setup so callers get the path immediately.
    const { mkdirSync, writeFileSync } = require("node:fs");
    mkdirSync(srcDir, { recursive: true });
    writeFileSync(path.join(srcDir, "Component.tsx"), componentWithImport, "utf-8");
    writeFileSync(path.join(srcDir, "App.tsx"), appTsx, "utf-8");
    writeFileSync(path.join(srcDir, "main.tsx"), mainTsx, "utf-8");
    writeFileSync(path.join(TEMP_DIR, "index.html"), indexHtml, "utf-8");

    return TEMP_DIR;
  }

  // ── build ───────────────────────────────────────────────────────────────────

  /**
   * Bundle the temp workspace using `bun build`.
   *
   * @returns The absolute path of the output directory (`temp/dist`).
   */
  async build(): Promise<string> {
    const distDir = path.join(TEMP_DIR, "dist");

    // Use Bun's built-in bundler API
    const result = await Bun.build({
      entrypoints: [path.join(TEMP_DIR, "src", "main.tsx")],
      outdir: distDir,
      target: "browser",
      format: "esm",
      minify: false,
      define: {
        "process.env.NODE_ENV": JSON.stringify("production"),
      },
    });

    if (!result.success) {
      const messages = result.logs.map((l) => l.message).join("\n");
      throw new Error(`bun build failed:\n${messages}`);
    }

    // Copy index.html into dist, rewriting the script src to the bundle output.
    const bundleFile = result.outputs[0]?.path ?? path.join(distDir, "main.js");
    const bundleBasename = path.basename(bundleFile);
    const distHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>prompt-ui preview</title>
    <script src="https://cdn.tailwindcss.com"></script>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./${bundleBasename}"></script>
  </body>
</html>
`;
    await fs.writeFile(path.join(distDir, "index.html"), distHtml, "utf-8");

    this.built = true;
    return distDir;
  }

  // ── serve ───────────────────────────────────────────────────────────────────

  /**
   * Serve the component live using Bun's built-in HTTP server with HMR.
   *
   * Bun's bundler is invoked on-the-fly so the page always reflects the
   * current state of the temp/src files.
   *
   * @param port - TCP port to listen on (default: 5173 to match Vite convention).
   * @returns The localhost URL, e.g. "http://localhost:5173".
   */
  async serve(port = 5173): Promise<string> {
    const srcDir = path.join(TEMP_DIR, "src");
    const entrypoint = path.join(srcDir, "main.tsx");

    const server = Bun.serve({
      port,
      development: {
        hmr: true,
        console: true,
      },
      async fetch(req) {
        const url = new URL(req.url);
        const pathname = url.pathname;

        // Serve index.html for root and unknown paths (SPA fallback)
        if (pathname === "/" || pathname === "/index.html") {
          const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>prompt-ui preview</title>
    <script src="https://cdn.tailwindcss.com"></script>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/bundle.js"></script>
  </body>
</html>`;
          return new Response(html, {
            headers: { "Content-Type": "text/html; charset=utf-8" },
          });
        }

        // Serve the bundle
        if (pathname === "/bundle.js") {
          const result = await Bun.build({
            entrypoints: [entrypoint],
            target: "browser",
            format: "esm",
            define: {
              "process.env.NODE_ENV": JSON.stringify("development"),
            },
          });

          if (!result.success) {
            const messages = result.logs.map((l) => l.message).join("\n");
            return new Response(`console.error(${JSON.stringify("Build error:\n" + messages)})`, {
              headers: { "Content-Type": "application/javascript" },
            });
          }

          const output = result.outputs[0];
          if (!output) {
            return new Response("// no output", {
              headers: { "Content-Type": "application/javascript" },
            });
          }

          return new Response(await output.text(), {
            headers: { "Content-Type": "application/javascript; charset=utf-8" },
          });
        }

        return new Response("Not found", { status: 404 });
      },
    });

    const url = `http://localhost:${server.port}`;

    // Register cleanup so the server stops when the process exits.
    registerCleanup(() => server.stop());

    console.log(`\n🚀 Serving component at ${url}\n   Press Ctrl+C to stop.\n`);
    return url;
  }
}

// ── Cleanup on process exit ───────────────────────────────────────────────────

const cleanupHandlers: Array<() => void> = [];

function registerCleanup(fn: () => void): void {
  cleanupHandlers.push(fn);
}

async function cleanup(): Promise<void> {
  for (const fn of cleanupHandlers) {
    try {
      fn();
    } catch {
      // ignore cleanup errors
    }
  }

  // Remove the temp dir
  try {
    await fs.rm(TEMP_DIR, { recursive: true, force: true });
  } catch {
    // ignore
  }
}

process.on("exit", () => {
  // Sync cleanup on exit (async not possible here)
  for (const fn of cleanupHandlers) {
    try {
      fn();
    } catch {
      // ignore
    }
  }
});

process.on("SIGINT", async () => {
  await cleanup();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await cleanup();
  process.exit(0);
});

// ── Convenience singleton ─────────────────────────────────────────────────────

export const renderer = new Renderer();
