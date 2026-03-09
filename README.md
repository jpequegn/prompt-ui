# prompt-ui

> Prompt-driven React component generator with Playwright eval — AI replacing front-end code.

## Quick start

```bash
# Install dependencies
bun install

# Set your API key (Anthropic direct or OpenRouter)
export ANTHROPIC_API_KEY=sk-ant-...
# OR
export OPENROUTER_API_KEY=sk-or-...

# Generate a component spec from a natural-language prompt
bun run src/cli.ts generate "a login form with email, password, and a submit button that shows a spinner" --verbose
```

## Features

| Feature | Status | Issue |
|---------|--------|-------|
| Spec parser: natural language → `ComponentSpec` | ✅ | #1 |
| Component generator: spec → React component | 🔜 | #2 |
| Renderer: write to temp dir, compile with Vite | 🔜 | #3 |
| Self-critique loop: score and regenerate | 🔜 | #4 |
| Playwright eval: screenshot + element checks | 🔜 | #5 |
| Eval: 10 diverse prompts, accuracy scoring | 🔜 | #6 |
| CLI: `pui generate` with streaming output | 🔜 | #7 |

## Spec parser (issue #1)

`parseSpec(prompt: string, verbose?: boolean): Promise<ComponentSpec>`

Turns a vague natural-language prompt into a structured `ComponentSpec`:

```ts
import { parseSpec } from "./src/parseSpec.js";

const spec = await parseSpec(
  "a login form with email, password, and a submit button that shows a spinner"
);
// {
//   component_name: "LoginForm",
//   elements: ["email input field", "password input field", "submit button", "loading spinner"],
//   interactions: ["show spinner on submit button when form is submitted"],
//   styling: "standard form layout",
//   must_have: ["email input field", "password input field", "submit button"],
//   nice_to_have: ["loading spinner", "password visibility toggle", ...]
// }
```

### CLI usage

```bash
bun run src/cli.ts generate "<prompt>" [--verbose]
```

`--verbose` prints the raw LLM response and the parsed spec before proceeding.

## Running tests

```bash
bun test
```

The acceptance-criteria test parses 5 different prompts and verifies the output is specific and accurate to the input.

## API key setup

| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | Official Anthropic API (preferred) |
| `OPENROUTER_API_KEY` | OpenRouter proxy — uses `anthropic/claude-opus-4-5` |
