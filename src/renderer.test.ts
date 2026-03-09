/**
 * Tests for the Renderer module (issue #3).
 *
 * The acceptance criterion is: "Generated LoginForm component renders at
 * localhost without errors."
 *
 * Unit tests cover:
 *   1. setup() writes the expected files.
 *   2. build() produces an index.html and a JS bundle in temp/dist.
 *   3. serve() returns a localhost URL and the page responds with 200.
 */

import { describe, it, expect, afterAll, beforeAll } from "bun:test";
import * as path from "node:path";
import * as fs from "node:fs/promises";
import { Renderer } from "./renderer.js";

// ── Fixture: a minimal but realistic LoginForm component ─────────────────────
// (No imports — matches generateComponent's output contract.)

const LOGIN_FORM_CODE = `
interface LoginFormProps {
  onSubmit?: (email: string, password: string) => void;
}

export function LoginForm({ onSubmit }: LoginFormProps = {}) {
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    await new Promise((r) => setTimeout(r, 800));
    setLoading(false);
    onSubmit?.(email, password);
  };

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center">
      <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-md">
        <h2 className="text-2xl font-bold mb-6 text-center text-gray-800">Sign In</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="you@example.com"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="••••••••"
              required
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center"
          >
            {loading ? (
              <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
            ) : null}
            {loading ? "Signing in…" : "Sign In"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default LoginForm;
`.trim();

// ── Tests ────────────────────────────────────────────────────────────────────

describe("Renderer.setup()", () => {
  it("returns the temp dir path", () => {
    const r = new Renderer();
    const tempDir = r.setup(LOGIN_FORM_CODE);
    expect(typeof tempDir).toBe("string");
    expect(tempDir.length).toBeGreaterThan(0);
  });

  it("writes Component.tsx with React import prepended", async () => {
    const r = new Renderer();
    const tempDir = r.setup(LOGIN_FORM_CODE);
    const content = await fs.readFile(
      path.join(tempDir, "src", "Component.tsx"),
      "utf-8"
    );
    expect(content).toContain('import React from "react"');
    expect(content).toContain("LoginForm");
  });

  it("writes App.tsx that imports the component by its detected name", async () => {
    const r = new Renderer();
    const tempDir = r.setup(LOGIN_FORM_CODE);
    const content = await fs.readFile(
      path.join(tempDir, "src", "App.tsx"),
      "utf-8"
    );
    expect(content).toContain("LoginForm");
    expect(content).toContain('<LoginForm');
  });

  it("writes main.tsx with createRoot", async () => {
    const r = new Renderer();
    const tempDir = r.setup(LOGIN_FORM_CODE);
    const content = await fs.readFile(
      path.join(tempDir, "src", "main.tsx"),
      "utf-8"
    );
    expect(content).toContain("createRoot");
    expect(content).toContain("<App");
  });

  it("writes index.html with a #root div and tailwind CDN", async () => {
    const r = new Renderer();
    const tempDir = r.setup(LOGIN_FORM_CODE);
    const content = await fs.readFile(
      path.join(tempDir, "index.html"),
      "utf-8"
    );
    expect(content).toContain('id="root"');
    expect(content).toContain("tailwindcss");
  });
});

describe("Renderer.build()", () => {
  let distDir: string;
  let r: Renderer;

  beforeAll(async () => {
    r = new Renderer();
    r.setup(LOGIN_FORM_CODE);
    distDir = await r.build();
  });

  afterAll(async () => {
    // Clean up temp dir after tests
    const tempDir = path.resolve(import.meta.dir, "..", "temp");
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("returns a string path", () => {
    expect(typeof distDir).toBe("string");
    expect(distDir.length).toBeGreaterThan(0);
  });

  it("produces an index.html in dist", async () => {
    const html = await fs.readFile(path.join(distDir, "index.html"), "utf-8");
    expect(html).toContain('id="root"');
  });

  it("produces at least one JS bundle file", async () => {
    const files = await fs.readdir(distDir);
    const jsFiles = files.filter((f) => f.endsWith(".js"));
    expect(jsFiles.length).toBeGreaterThan(0);
  });
});

describe("Renderer.serve()", () => {
  let url: string;
  let r: Renderer;
  // Use a different port to avoid clashing with other servers
  const PORT = 5174;

  beforeAll(async () => {
    r = new Renderer();
    r.setup(LOGIN_FORM_CODE);
    url = await r.serve(PORT);
  });

  afterAll(async () => {
    // The server is stopped by the process exit handler, but we also clean up
    // the temp dir manually here.
    const tempDir = path.resolve(import.meta.dir, "..", "temp");
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("returns a localhost URL", () => {
    expect(url).toMatch(/^http:\/\/localhost:\d+/);
  });

  it("responds with 200 and HTML on GET /", async () => {
    const res = await fetch(url);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain('id="root"');
  });

  it("responds with JavaScript on GET /bundle.js", async () => {
    const res = await fetch(`${url}/bundle.js`);
    expect(res.status).toBe(200);
    const contentType = res.headers.get("content-type") ?? "";
    expect(contentType).toContain("javascript");
    const text = await res.text();
    // Should contain React-related code
    expect(text.length).toBeGreaterThan(500);
  });
});
