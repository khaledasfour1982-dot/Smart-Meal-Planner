/**
 * Custom error classes for the AI meal-generation pipeline.
 *
 * AllergenViolationError – thrown when a generated ingredient matches a
 * profile allergen. Triggers the ≤3 retry loop in the orchestrator.
 *
 * PlanGenerationError – thrown when the Groq API fails (4xx/5xx/timeout)
 * or when all retry attempts are exhausted. Surfaces directly to the user.
 */

export class AllergenViolationError extends Error {
  /** The normalized ingredient names that triggered the violation. */
  readonly violatingIngredients: string[];

  constructor(violatingIngredients: string[]) {
    super(
      `Allergen violation detected in ingredients: ${violatingIngredients.join(", ")}`,
    );
    this.name = "AllergenViolationError";
    this.violatingIngredients = violatingIngredients;
    // Maintain proper prototype chain in transpiled ES5 targets
    Object.setPrototypeOf(this, AllergenViolationError.prototype);
  }
}

export const PLAN_GENERATION_REASONS = {
  SCHEMA_VALIDATION_FAILURE: "SCHEMA_VALIDATION_FAILURE",
  ALLERGEN_VIOLATION: "ALLERGEN_VIOLATION",
  EMPTY_OR_TRUNCATED_RESPONSE: "EMPTY_OR_TRUNCATED_RESPONSE",
  MODEL_TIMEOUT_OR_RATE_LIMIT: "MODEL_TIMEOUT_OR_RATE_LIMIT",
  TOKEN_LIMIT_EXCEEDED: "TOKEN_LIMIT_EXCEEDED",
  CONSTRAINT_CONFLICT: "CONSTRAINT_CONFLICT",
  PROVIDER_ERROR: "PROVIDER_ERROR",
} as const;

export type PlanGenerationReason =
  (typeof PLAN_GENERATION_REASONS)[keyof typeof PLAN_GENERATION_REASONS];

export interface PlanGenerationErrorOptions {
  reason?: PlanGenerationReason;
  attempts?: number;
  metadata?: Record<string, unknown>;
}

export class PlanGenerationError extends Error {
  /** How many generation attempts were made before giving up. */
  readonly attempts: number;

  /** Machine-readable failure reason for router/API mapping. */
  readonly reason: PlanGenerationReason;

  /** Alias of `reason` for consumers that use `code` naming. */
  readonly code: PlanGenerationReason;

  /** Optional structured metadata for diagnostics and mapping. */
  readonly metadata?: Record<string, unknown>;

  constructor(message: string, attempts: number);
  constructor(message: string, options?: PlanGenerationErrorOptions);
  constructor(message: string, attemptsOrOptions: number | PlanGenerationErrorOptions = 1) {
    const options: PlanGenerationErrorOptions =
      typeof attemptsOrOptions === "number"
        ? { attempts: attemptsOrOptions }
        : attemptsOrOptions;

    super(message);
    this.name = "PlanGenerationError";
    this.attempts = options.attempts ?? 1;
    this.reason = options.reason ?? PLAN_GENERATION_REASONS.PROVIDER_ERROR;
    this.code = this.reason;
    this.metadata = options.metadata;
    Object.setPrototypeOf(this, PlanGenerationError.prototype);
  }
}
