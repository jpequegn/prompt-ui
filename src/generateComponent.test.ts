import { describe, it, expect } from "bun:test";
import { generateComponent, extractCodeBlock, detectSyntaxIssues } from "./generateComponent.js";
import type { ComponentSpec } from "./types.js";

// ── Unit tests (no API calls) ────────────────────────────────────────────────

describe("extractCodeBlock", () => {
  it("strips ```tsx fences", () => {
    const input = "```tsx\nconst x = 1;\n```";
    expect(extractCodeBlock(input)).toBe("const x = 1;");
  });

  it("strips ```ts fences", () => {
    const input = "```ts\nconst x = 1;\n```";
    expect(extractCodeBlock(input)).toBe("const x = 1;");
  });

  it("strips ```jsx fences", () => {
    const input = "```jsx\nconst x = 1;\n```";
    expect(extractCodeBlock(input)).toBe("const x = 1;");
  });

  it("returns raw text when no fence is present", () => {
    const input = "const x = 1;";
    expect(extractCodeBlock(input)).toBe("const x = 1;");
  });

  it("handles multi-line code blocks", () => {
    const input = "```tsx\nline1\nline2\nline3\n```";
    expect(extractCodeBlock(input)).toBe("line1\nline2\nline3");
  });
});

describe("detectSyntaxIssues", () => {
  it("returns no issues for a well-formed component", () => {
    const code = `
interface Props { label: string }
export function Button({ label }: Props) {
  return <button className="bg-blue-500">{label}</button>;
}
export default Button;
    `.trim();
    expect(detectSyntaxIssues(code)).toHaveLength(0);
  });

  it("detects missing default export", () => {
    const code = `
function Button() { return <button>Click</button>; }
    `.trim();
    const issues = detectSyntaxIssues(code);
    expect(issues.some((i) => i.includes("default export"))).toBe(true);
  });

  it("detects severely unbalanced curly braces", () => {
    const code = `
export default function Broken() {
  return <div>{{{{{{{{{{{{{{{{{{{{{{{
}
    `.trim();
    const issues = detectSyntaxIssues(code);
    expect(issues.some((i) => i.includes("curly braces"))).toBe(true);
  });
});

// ── Five component specs for acceptance criteria ─────────────────────────────

const FIVE_SPECS: Array<{
  label: string;
  spec: ComponentSpec;
  mustContainInCode: string[];
}> = [
  {
    label: "LoginForm",
    spec: {
      component_name: "LoginForm",
      elements: ["email input", "password input", "submit button", "spinner"],
      interactions: ["show spinner on submit", "disable button while loading"],
      styling: "centered card with shadow",
      must_have: ["email input", "password input", "submit button"],
      nice_to_have: ["spinner", "remember me checkbox"],
    },
    mustContainInCode: ["LoginForm", "email", "password"],
  },
  {
    label: "SearchBar",
    spec: {
      component_name: "SearchBar",
      elements: ["text input", "search button", "dropdown suggestions list"],
      interactions: [
        "show dropdown on input",
        "select suggestion fills input",
        "clear on escape",
      ],
      styling: "full-width bar with rounded corners",
      must_have: ["text input", "search button"],
      nice_to_have: ["dropdown suggestions list"],
    },
    mustContainInCode: ["SearchBar", "input", "button"],
  },
  {
    label: "ProductCard",
    spec: {
      component_name: "ProductCard",
      elements: [
        "product image",
        "title",
        "price",
        "rating stars",
        "add-to-cart button",
      ],
      interactions: ["add to cart on button click", "hover zoom on image"],
      styling: "card with shadow and hover effect",
      must_have: ["product image", "title", "price", "add-to-cart button"],
      nice_to_have: ["rating stars", "wishlist icon"],
    },
    mustContainInCode: ["ProductCard", "price", "cart"],
  },
  {
    label: "SettingsPanel",
    spec: {
      component_name: "SettingsPanel",
      elements: [
        "dark mode toggle",
        "notification checkboxes",
        "save button",
        "section headings",
      ],
      interactions: [
        "toggle dark mode",
        "check/uncheck notifications",
        "save settings on click",
      ],
      styling: "vertical settings list with dividers",
      must_have: ["dark mode toggle", "save button"],
      nice_to_have: ["notification checkboxes", "reset button"],
    },
    mustContainInCode: ["SettingsPanel", "dark", "save"],
  },
  {
    label: "SignupWizard",
    spec: {
      component_name: "SignupWizard",
      elements: [
        "step indicators",
        "first name input",
        "last name input",
        "email input",
        "password input",
        "next button",
        "back button",
      ],
      interactions: [
        "advance to next step",
        "go back to previous step",
        "validate fields before advancing",
      ],
      styling: "multi-step wizard with progress bar",
      must_have: [
        "step indicators",
        "email input",
        "password input",
        "next button",
        "back button",
      ],
      nice_to_have: ["field validation messages", "progress percentage"],
    },
    mustContainInCode: ["SignupWizard", "step", "next"],
  },
];

describe("generateComponent – acceptance criteria (5 specs)", () => {
  for (const { label, spec, mustContainInCode } of FIVE_SPECS) {
    it(`generates a renderable component for: ${label}`, async () => {
      const code = await generateComponent(spec, false);

      // ── Must be a non-empty string ───────────────────────────────────
      expect(typeof code).toBe("string");
      expect(code.length).toBeGreaterThan(100);

      // ── Must NOT contain raw import statements ───────────────────────
      // (The generator should produce import-free code)
      const importLines = code
        .split("\n")
        .filter((l) => /^\s*import\s+/.test(l));
      expect(importLines).toHaveLength(0);

      // ── Must have a default export ───────────────────────────────────
      expect(code).toMatch(/export\s+default\s+/);

      // ── Must use Tailwind classes ────────────────────────────────────
      expect(code).toMatch(/className=/);

      // ── Must contain spec-specific keywords ─────────────────────────
      const codeLower = code.toLowerCase();
      for (const keyword of mustContainInCode) {
        expect(codeLower).toContain(keyword.toLowerCase());
      }
    }, 60_000); // allow up to 60 s per API call
  }
});
