/**
 * Subagent run spec and prepare_soul pipeline — corresponds to Python subagents/core.py
 */

import type { AgentLaunchSpec, AgentTypeDefinition } from "./models.ts";

export interface SubagentRunSpec {
  readonly agentId: string;
  readonly typeDef: AgentTypeDefinition;
  readonly launchSpec: AgentLaunchSpec;
  readonly prompt: string;
  readonly resumed: boolean;
}
