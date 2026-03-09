/**
 * Evaluator — automatically verifies a rendered component against a spec.
 *
 * For each element listed in `spec.must_have`, the evaluator attempts to
 * locate it in the live DOM using multiple Playwright locator strategies
 * (ARIA role, label, placeholder, or text content).  It then takes a
 * full-page screenshot and computes a 0–1 score.
 *
 * API:
 *   const result = await evaluator.run(url, spec)
 *   // { screenshot: Buffer, checks: [{element, found: boolean}], score: number }
 *
 * Usage:
 *   import { Evaluator, evaluator } from "./evaluator.js";
 *
 *   const result = await evaluator.run("http://localhost:5173", spec);
 */

import { chromium, type Browser, type Page } from "playwright";
import type { ComponentSpec } from "./types.js";

// ── Public types ──────────────────────────────────────────────────────────────

/** Result of a single must_have element check. */
export interface ElementCheck {
  /** The must_have element string (e.g. "email input", "submit button"). */
  element: string;
  /** Whether the element was visible in the DOM. */
  found: boolean;
}

/** Full result returned by `Evaluator.run()`. */
export interface EvalResult {
  /** Full-page screenshot as a PNG Buffer. */
  screenshot: Buffer;
  /** Visibility check for each must_have element. */
  checks: ElementCheck[];
  /** Fraction of found elements: `found_elements / total_must_have`. */
  score: number;
}

// ── Types ─────────────────────────────────────────────────────────────────────

type AriaRole = Parameters<Page["getByRole"]>[0];

// ── Element classification ────────────────────────────────────────────────────

/**
 * Classify an element description into one or more ARIA roles to probe.
 *
 * Maps based on keyword presence in the element string.
 * Returns an empty array when no role can be inferred.
 */
function inferRoles(element: string): AriaRole[] {
  const e = element.toLowerCase();
  const roles: AriaRole[] = [];

  if (/\bbutton\b/.test(e)) roles.push("button");
  if (/\blink\b/.test(e)) roles.push("link");
  if (/\bcheckbox\b/.test(e)) roles.push("checkbox");
  if (/\bradio\b/.test(e)) roles.push("radio");
  if (/\b(switch|toggle)\b/.test(e)) roles.push("switch");
  if (/\b(combobox|select)\b/.test(e)) roles.push("combobox");
  if (/\bdropdown\b/.test(e)) roles.push("combobox", "listbox");
  if (/\blistbox\b/.test(e)) roles.push("listbox");
  // text / email / password inputs → textbox; search inputs may be searchbox
  if (/\b(text input|email input|password input|textbox|input\b)/.test(e)) {
    roles.push("textbox");
  }
  if (/\bsearch\b/.test(e)) roles.push("searchbox", "textbox");
  if (/\b(spinner|loading)\b/.test(e)) roles.push("status");
  if (/\b(heading|title)\b/.test(e)) roles.push("heading");
  if (/\b(img|image|photo|picture)\b/.test(e)) roles.push("img");
  if (/\b(navigation|nav)\b/.test(e)) roles.push("navigation");
  if (/\bmenu\b/.test(e)) roles.push("menu");
  if (/\bmenuitem\b/.test(e)) roles.push("menuitem");
  if (/\b(dialog|modal)\b/.test(e)) roles.push("dialog");
  if (/\btab\b/.test(e)) roles.push("tab");
  if (/\btabpanel\b/.test(e)) roles.push("tabpanel");
  if (/\bprogress\b/.test(e)) roles.push("progressbar");
  if (/\bslider\b/.test(e)) roles.push("slider");
  if (/\b(step indicator|indicator)\b/.test(e)) roles.push("list", "listitem");

  // Deduplicate
  return [...new Set(roles)];
}

/**
 * Extract a semantic label from the element description.
 *
 * For "email input" → "email"; "add-to-cart button" → "add to cart".
 * The label is the element string with trailing type nouns removed.
 *
 * Returns `null` when the description is purely a type word (e.g. "button").
 */
function extractSemanticLabel(element: string): string | null {
  const typeWords = [
    "input", "button", "field", "checkbox", "toggle", "select",
    "dropdown", "image", "photo", "icon", "link", "bar", "list",
    "panel", "indicator", "heading", "spinner", "form", "text",
    "area", "textbox", "searchbox", "combobox",
  ];

  const cleaned = element
    .replace(/[-_]+/g, " ")
    .toLowerCase()
    .split(/\s+/)
    .filter(w => !typeWords.includes(w))
    .join(" ")
    .trim();

  return cleaned.length >= 2 ? cleaned : null;
}

/**
 * Try to check element visibility via a Playwright locator.
 * Returns true if at least one visible match is found.
 */
async function checkLocatorVisible(
  locator: ReturnType<Page["getByRole"]>,
  timeout = 2_000
): Promise<boolean> {
  try {
    const count = await locator.count();
    if (count === 0) return false;
    for (let i = 0; i < count; i++) {
      const visible = await locator.nth(i).isVisible({ timeout }).catch(() => false);
      if (visible) return true;
    }
    return false;
  } catch {
    return false;
  }
}

// ── isElementPresent ──────────────────────────────────────────────────────────

/**
 * Try to locate an element on the page using multiple Playwright strategies.
 *
 * Strategy order:
 *   1. ARIA role (with and without name filter)
 *   2. getByLabel (semantic label derived from element string)
 *   3. getByPlaceholder (semantic label)
 *   4. getByText (semantic label — only for non-structural elements)
 *   5. CSS/ARIA fallback for common element types (e.g. any <input>, any <img>)
 *
 * Returns true if at least one visible match is found within the timeout.
 */
async function isElementPresent(page: Page, element: string): Promise<boolean> {
  const TIMEOUT_MS = 2_000;
  const semanticLabel = extractSemanticLabel(element);
  const roles = inferRoles(element);

  // ── Strategy 1: ARIA role ────────────────────────────────────────────────
  for (const role of roles) {
    // 1a. Role + semantic name
    if (semanticLabel) {
      const loc = page.getByRole(role, { name: semanticLabel, exact: false });
      if (await checkLocatorVisible(loc, TIMEOUT_MS)) return true;
    }

    // 1b. Role alone (any element of that role)
    const locAny = page.getByRole(role);
    if (await checkLocatorVisible(locAny, TIMEOUT_MS)) return true;
  }

  // ── Strategy 2: getByLabel ───────────────────────────────────────────────
  if (semanticLabel) {
    try {
      const loc = page.getByLabel(semanticLabel, { exact: false });
      if (await checkLocatorVisible(loc, TIMEOUT_MS)) return true;
    } catch { /* no match */ }
  }

  // ── Strategy 3: getByPlaceholder ────────────────────────────────────────
  if (semanticLabel) {
    try {
      const loc = page.getByPlaceholder(semanticLabel, { exact: false });
      if (await checkLocatorVisible(loc, TIMEOUT_MS)) return true;
    } catch { /* no match */ }
  }

  // ── Strategy 4: getByText (semantic label only, NOT individual words) ────
  // Only run for elements that are not role-detectable (avoids false positives
  // from UI text that happens to share a word with the element description).
  if (semanticLabel && roles.length === 0) {
    try {
      const loc = page.getByText(semanticLabel, { exact: false });
      if (await checkLocatorVisible(loc, TIMEOUT_MS)) return true;
    } catch { /* no match */ }
  }

  // ── Strategy 5: CSS / attribute fallbacks ───────────────────────────────
  const e = element.toLowerCase();

  // Any visible <img>
  if (/\b(img|image|photo|picture)\b/.test(e)) {
    try {
      const loc = page.locator("img");
      if (await checkLocatorVisible(loc, TIMEOUT_MS)) return true;
    } catch { /* no match */ }
  }

  // Any visible <input> (catches search, email, password, text input descriptions)
  // Only trigger when the element string clearly describes an INPUT element
  // (e.g. "email input", "password input", "search input", "text input")
  // Avoid false positives like "forgot password link" matching because it contains "password".
  if (/\b(email|password|search|text)\s+input\b/.test(e) || /\binput\b/.test(e)) {
    try {
      const loc = page.locator("input");
      if (await checkLocatorVisible(loc, TIMEOUT_MS)) return true;
    } catch { /* no match */ }
  }

  // Price: look for common price patterns in text
  if (/\bprice\b/.test(e)) {
    try {
      // Match elements containing currency symbols or price-like patterns
      const loc = page.locator(":text-matches('[£$€¥]|\\d+[.,]\\d{2}')");
      if (await checkLocatorVisible(loc, TIMEOUT_MS)) return true;
    } catch { /* no match */ }
    // Also try aria-label or data attributes
    try {
      const loc = page.locator("[class*='price'],[data-testid*='price'],[aria-label*='price' i]");
      if (await checkLocatorVisible(loc, TIMEOUT_MS)) return true;
    } catch { /* no match */ }
  }

  // Spinner / loading indicator
  if (/\b(spinner|loading)\b/.test(e)) {
    try {
      const loc = page.locator("[class*='spin'],[class*='load'],[aria-label*='loading' i]");
      if (await checkLocatorVisible(loc, TIMEOUT_MS)) return true;
    } catch { /* no match */ }
  }

  // Toggle / switch
  if (/\btoggle\b/.test(e)) {
    try {
      const loc = page.locator("[role='switch'], input[type='checkbox']");
      if (await checkLocatorVisible(loc, TIMEOUT_MS)) return true;
    } catch { /* no match */ }
  }

  return false;
}

// ── Evaluator class ───────────────────────────────────────────────────────────

export class Evaluator {
  private browser: Browser | null = null;

  // ── lifecycle ────────────────────────────────────────────────────────────────

  /** Launch the Chromium browser (called automatically by run() if not open). */
  async open(): Promise<void> {
    if (this.browser) return;
    this.browser = await chromium.launch({ headless: true });
  }

  /** Close the Chromium browser and release all resources. */
  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  // ── run ───────────────────────────────────────────────────────────────────────

  /**
   * Navigate to `url`, check each `spec.must_have` element for visibility,
   * take a full-page screenshot, and compute a score.
   *
   * @param url  - The URL of the rendered component (e.g. "http://localhost:5173").
   * @param spec - The ComponentSpec whose `must_have` list will be verified.
   * @returns    An EvalResult with screenshot buffer, per-element checks, and score.
   */
  async run(url: string, spec: ComponentSpec): Promise<EvalResult> {
    // Auto-open browser if needed
    await this.open();
    const browser = this.browser!;

    const page = await browser.newPage();

    try {
      // Navigate and wait for the page to be fully interactive
      await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 });

      // Give JS frameworks a little extra time to hydrate
      await page.waitForTimeout(500);

      // ── Check each must_have element ──────────────────────────────────────
      const checks: ElementCheck[] = [];

      for (const element of spec.must_have) {
        const found = await isElementPresent(page, element);
        checks.push({ element, found });
      }

      // ── Full-page screenshot ──────────────────────────────────────────────
      const screenshotBuffer = await page.screenshot({ fullPage: true });

      // ── Compute score ─────────────────────────────────────────────────────
      const total = checks.length;
      const found = checks.filter(c => c.found).length;
      const score = total === 0 ? 1 : found / total;

      return {
        screenshot: Buffer.from(screenshotBuffer),
        checks,
        score,
      };
    } finally {
      await page.close();
    }
  }
}

// ── Convenience singleton ─────────────────────────────────────────────────────

export const evaluator = new Evaluator();
