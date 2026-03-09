import { describe, it, expect } from "bun:test";
import { parseSpec } from "./parseSpec.js";
import type { ComponentSpec } from "./types.js";

/**
 * Acceptance criteria: parse 5 different prompts and verify the resulting specs
 * are specific and accurate to the input.
 */

const TEST_PROMPTS: Array<{
  prompt: string;
  /** Keywords that MUST appear somewhere in the spec */
  mustContain: {
    component_name?: RegExp;
    elements?: string[];
    interactions?: string[];
  };
}> = [
  {
    prompt:
      "a login form with email, password, and a submit button that shows a spinner",
    mustContain: {
      component_name: /login/i,
      elements: ["email", "password", "submit"],
      interactions: ["spinner"],
    },
  },
  {
    prompt:
      "a search bar with an input field and a search button, with autocomplete dropdown suggestions",
    mustContain: {
      component_name: /search/i,
      elements: ["input", "button"],
      interactions: ["autocomplete", "dropdown", "suggest"],
    },
  },
  {
    prompt:
      "a product card showing an image, title, price, rating stars, and an add-to-cart button",
    mustContain: {
      component_name: /product|card/i,
      elements: ["image", "title", "price"],
    },
  },
  {
    prompt:
      "a multi-step signup wizard with step indicators, first name, last name, email, password fields, and next/back navigation buttons",
    mustContain: {
      component_name: /signup|wizard|registration/i,
      elements: ["email", "password"],
    },
  },
  {
    prompt:
      "a settings toggle panel with dark mode switch, notification preferences checkboxes, and a save button",
    mustContain: {
      component_name: /setting|toggle|panel/i,
      elements: ["save"],
    },
  },
];

/** Flatten a spec into a single searchable string for keyword checks */
function specToSearchString(spec: ComponentSpec): string {
  return [
    spec.component_name,
    ...spec.elements,
    ...spec.interactions,
    spec.styling,
    ...spec.must_have,
    ...spec.nice_to_have,
  ]
    .join(" ")
    .toLowerCase();
}

describe("parseSpec – acceptance criteria (5 prompts)", () => {
  for (const { prompt, mustContain } of TEST_PROMPTS) {
    it(`parses: "${prompt.slice(0, 60)}…"`, async () => {
      const spec = await parseSpec(prompt, false);

      // ── Structure checks ───────────────────────────────────────────────
      expect(typeof spec.component_name).toBe("string");
      expect(spec.component_name.length).toBeGreaterThan(0);
      expect(Array.isArray(spec.elements)).toBe(true);
      expect(spec.elements.length).toBeGreaterThan(0);
      expect(Array.isArray(spec.interactions)).toBe(true);
      expect(typeof spec.styling).toBe("string");
      expect(Array.isArray(spec.must_have)).toBe(true);
      expect(spec.must_have.length).toBeGreaterThan(0);
      expect(Array.isArray(spec.nice_to_have)).toBe(true);

      // must_have items should conceptually relate to elements
      // (LLM may paraphrase slightly, so we just check both lists are non-empty
      //  and that must_have items are at least partially covered by the spec
      //  search string as a whole)
      const searchStr2 = specToSearchString(spec);
      for (const item of spec.must_have) {
        // Each must_have keyword should appear somewhere in the spec text
        const words = item.toLowerCase().split(/\s+/);
        const anyWordFound = words.some((w) => w.length > 3 && searchStr2.includes(w));
        expect(anyWordFound).toBe(true);
      }

      // ── Keyword / accuracy checks ──────────────────────────────────────
      const searchStr = specToSearchString(spec);

      if (mustContain.component_name) {
        expect(spec.component_name).toMatch(mustContain.component_name);
      }

      if (mustContain.elements) {
        for (const keyword of mustContain.elements) {
          expect(searchStr).toContain(keyword.toLowerCase());
        }
      }

      if (mustContain.interactions) {
        const interactionsStr = spec.interactions.join(" ").toLowerCase();
        for (const keyword of mustContain.interactions) {
          expect(interactionsStr).toContain(keyword.toLowerCase());
        }
      }
    }, 30_000); // allow up to 30 s per API call
  }
});
