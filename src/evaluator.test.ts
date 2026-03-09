/**
 * Tests for the Evaluator module (issue #5).
 *
 * Acceptance criterion: "Evaluator correctly identifies present/absent
 * elements on 3 test components."
 *
 * Test layout:
 *   1. Unit tests — EvalResult shape, score formula.
 *   2. Integration tests — three static HTML fixtures served via Bun,
 *      each representing a realistic rendered component.
 *
 * The fixtures are self-contained HTML pages (no bundler needed) so the
 * integration tests run without a live LLM / Renderer.
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { Evaluator } from "./evaluator.js";
import type { ComponentSpec } from "./types.js";

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Minimal ComponentSpec factory — only must_have matters for the evaluator. */
function makeSpec(mustHave: string[]): ComponentSpec {
  return {
    component_name: "TestComponent",
    elements: mustHave,
    interactions: [],
    styling: "plain",
    must_have: mustHave,
    nice_to_have: [],
  };
}

// ── Fixture HTML pages ─────────────────────────────────────────────────────────

/**
 * Fixture 1 — LoginForm
 * Contains: email input (with label + placeholder), password input, submit button.
 * Absent: "forgot password" link (to test false-negative detection).
 */
const LOGIN_FORM_HTML = `<!doctype html>
<html lang="en">
<head><meta charset="UTF-8"><title>LoginForm</title></head>
<body>
  <div id="root">
    <form>
      <h2>Sign In</h2>
      <label for="email">Email</label>
      <input id="email" type="email" placeholder="you@example.com" />
      <label for="password">Password</label>
      <input id="password" type="password" placeholder="Enter password" />
      <button type="submit">Sign In</button>
    </form>
  </div>
</body>
</html>`;

/**
 * Fixture 2 — SearchBar
 * Contains: text input (search), search button.
 * Absent: suggestions dropdown.
 */
const SEARCH_BAR_HTML = `<!doctype html>
<html lang="en">
<head><meta charset="UTF-8"><title>SearchBar</title></head>
<body>
  <div id="root">
    <div>
      <input type="search" placeholder="Search…" aria-label="Search" />
      <button type="button">Search</button>
    </div>
  </div>
</body>
</html>`;

/**
 * Fixture 3 — ProductCard
 * Contains: product image, title heading, price text, add-to-cart button.
 * All must_have elements present to verify 100% score.
 */
const PRODUCT_CARD_HTML = `<!doctype html>
<html lang="en">
<head><meta charset="UTF-8"><title>ProductCard</title></head>
<body>
  <div id="root">
    <div class="card">
      <img src="https://via.placeholder.com/200" alt="Product image" />
      <h2>Awesome Widget</h2>
      <p class="price">$29.99</p>
      <button type="button">Add to Cart</button>
    </div>
  </div>
</body>
</html>`;

// ── Mini static file server ────────────────────────────────────────────────────

interface TestServer {
  url: string;
  stop: () => void;
}

/** Spin up a Bun HTTP server that serves a single HTML page at "/". */
function serveHtml(html: string, port: number): TestServer {
  const server = Bun.serve({
    port,
    fetch() {
      return new Response(html, {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    },
  });

  return {
    url: `http://localhost:${server.port}`,
    stop: () => server.stop(),
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("Evaluator — unit: EvalResult shape and score formula", () => {
  it("score is 1 when all elements found", () => {
    // Simulate a result with 3/3 found
    const checks = [
      { element: "email input", found: true },
      { element: "password input", found: true },
      { element: "submit button", found: true },
    ];
    const total = checks.length;
    const found = checks.filter(c => c.found).length;
    const score = total === 0 ? 1 : found / total;
    expect(score).toBe(1);
  });

  it("score is 0 when no elements found", () => {
    const checks = [
      { element: "email input", found: false },
      { element: "password input", found: false },
    ];
    const total = checks.length;
    const found = checks.filter(c => c.found).length;
    const score = total === 0 ? 1 : found / total;
    expect(score).toBe(0);
  });

  it("score is 0.5 when half found", () => {
    const checks = [
      { element: "email input", found: true },
      { element: "forgot password link", found: false },
    ];
    const total = checks.length;
    const found = checks.filter(c => c.found).length;
    const score = total === 0 ? 1 : found / total;
    expect(score).toBe(0.5);
  });

  it("score is 1 when must_have is empty", () => {
    const checks: { element: string; found: boolean }[] = [];
    const total = checks.length;
    const found = checks.filter(c => c.found).length;
    const score = total === 0 ? 1 : found / total;
    expect(score).toBe(1);
  });
});

describe("Evaluator — integration: 3 test components", () => {
  let evaluator: Evaluator;
  let loginServer: TestServer;
  let searchServer: TestServer;
  let productServer: TestServer;

  const BASE_PORT = 5200;

  beforeAll(async () => {
    evaluator = new Evaluator();
    await evaluator.open();

    loginServer = serveHtml(LOGIN_FORM_HTML, BASE_PORT);
    searchServer = serveHtml(SEARCH_BAR_HTML, BASE_PORT + 1);
    productServer = serveHtml(PRODUCT_CARD_HTML, BASE_PORT + 2);
  });

  afterAll(async () => {
    await evaluator.close();
    loginServer.stop();
    searchServer.stop();
    productServer.stop();
  });

  // ── Component 1: LoginForm ─────────────────────────────────────────────────

  describe("Component 1 — LoginForm", () => {
    const spec = makeSpec([
      "email input",
      "password input",
      "submit button",
      "forgot password link",   // absent — tests false-negative detection
    ]);

    let result: Awaited<ReturnType<Evaluator["run"]>>;

    beforeAll(async () => {
      result = await evaluator.run(loginServer.url, spec);
    });

    it("returns a non-empty screenshot buffer", () => {
      expect(result.screenshot).toBeInstanceOf(Buffer);
      expect(result.screenshot.length).toBeGreaterThan(100);
    });

    it("returns one check per must_have element", () => {
      expect(result.checks).toHaveLength(spec.must_have.length);
    });

    it("finds email input", () => {
      const check = result.checks.find(c => c.element === "email input");
      expect(check?.found).toBe(true);
    });

    it("finds password input", () => {
      const check = result.checks.find(c => c.element === "password input");
      expect(check?.found).toBe(true);
    });

    it("finds submit button", () => {
      const check = result.checks.find(c => c.element === "submit button");
      expect(check?.found).toBe(true);
    });

    it("does NOT find 'forgot password link' (absent in fixture)", () => {
      const check = result.checks.find(c => c.element === "forgot password link");
      expect(check?.found).toBe(false);
    });

    it("score is 0.75 (3 of 4 found)", () => {
      expect(result.score).toBeCloseTo(0.75);
    });
  });

  // ── Component 2: SearchBar ─────────────────────────────────────────────────

  describe("Component 2 — SearchBar", () => {
    const spec = makeSpec([
      "text input",
      "search button",
      "suggestions dropdown",   // absent
    ]);

    let result: Awaited<ReturnType<Evaluator["run"]>>;

    beforeAll(async () => {
      result = await evaluator.run(searchServer.url, spec);
    });

    it("returns a non-empty screenshot buffer", () => {
      expect(result.screenshot).toBeInstanceOf(Buffer);
      expect(result.screenshot.length).toBeGreaterThan(100);
    });

    it("returns one check per must_have element", () => {
      expect(result.checks).toHaveLength(spec.must_have.length);
    });

    it("finds text input", () => {
      const check = result.checks.find(c => c.element === "text input");
      expect(check?.found).toBe(true);
    });

    it("finds search button", () => {
      const check = result.checks.find(c => c.element === "search button");
      expect(check?.found).toBe(true);
    });

    it("does NOT find suggestions dropdown (absent in fixture)", () => {
      const check = result.checks.find(c => c.element === "suggestions dropdown");
      expect(check?.found).toBe(false);
    });

    it("score is approximately 0.67 (2 of 3 found)", () => {
      expect(result.score).toBeCloseTo(2 / 3, 2);
    });
  });

  // ── Component 3: ProductCard ───────────────────────────────────────────────

  describe("Component 3 — ProductCard (all elements present)", () => {
    const spec = makeSpec([
      "product image",
      "title",
      "price",
      "add-to-cart button",
    ]);

    let result: Awaited<ReturnType<Evaluator["run"]>>;

    beforeAll(async () => {
      result = await evaluator.run(productServer.url, spec);
    });

    it("returns a non-empty screenshot buffer", () => {
      expect(result.screenshot).toBeInstanceOf(Buffer);
      expect(result.screenshot.length).toBeGreaterThan(100);
    });

    it("returns one check per must_have element", () => {
      expect(result.checks).toHaveLength(spec.must_have.length);
    });

    it("finds product image", () => {
      const check = result.checks.find(c => c.element === "product image");
      expect(check?.found).toBe(true);
    });

    it("finds title heading", () => {
      const check = result.checks.find(c => c.element === "title");
      expect(check?.found).toBe(true);
    });

    it("finds price text", () => {
      const check = result.checks.find(c => c.element === "price");
      expect(check?.found).toBe(true);
    });

    it("finds add-to-cart button", () => {
      const check = result.checks.find(c => c.element === "add-to-cart button");
      expect(check?.found).toBe(true);
    });

    it("score is 1.0 (all 4 found)", () => {
      expect(result.score).toBe(1);
    });
  });
});
