/**
 * Plan mode dynamic injection — corresponds to Python soul/dynamic_injections/plan_mode.py
 */

export const PLAN_MODE_REMINDER = `<system-reminder>
Plan mode is active. You MUST NOT make any edits, run any non-readonly tools, or otherwise make changes.
Focus on exploring the codebase and designing an implementation approach.
Use read-only tools (Read, Glob, Grep) to understand the code, then present your plan.
</system-reminder>`;

export function getPlanModeInjection(active: boolean): string | null {
  return active ? PLAN_MODE_REMINDER : null;
}
