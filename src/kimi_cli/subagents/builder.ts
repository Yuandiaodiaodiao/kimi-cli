/**
 * Subagent builder — corresponds to Python subagents/builder.py
 * Constructs subagent instances from type definitions.
 */

import type { AgentLaunchSpec, AgentTypeDefinition } from "./models.ts";

export class SubagentBuilder {
  /**
   * Determine the effective model for a subagent launch.
   * Priority: launch spec override > launch spec effective > type definition default.
   */
  static resolveEffectiveModel(opts: {
    typeDef: AgentTypeDefinition;
    launchSpec: AgentLaunchSpec;
  }): string | undefined {
    return (
      opts.launchSpec.modelOverride ??
      opts.launchSpec.effectiveModel ??
      opts.typeDef.defaultModel
    );
  }
}
