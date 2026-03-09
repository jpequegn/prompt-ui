/**
 * Structured representation of a UI component specification,
 * parsed from a natural-language prompt.
 */
export interface ComponentSpec {
  /** PascalCase component name derived from the prompt */
  component_name: string;
  /** All distinct UI elements identified in the prompt */
  elements: string[];
  /** User interactions / behaviours described in the prompt */
  interactions: string[];
  /** Overall layout / visual style implied by the prompt */
  styling: string;
  /** Elements that are explicitly required */
  must_have: string[];
  /** Elements mentioned as optional or secondary */
  nice_to_have: string[];
}
