/**
 * Foreground subagent runner — corresponds to Python subagents/runner.py
 * Manages the lifecycle of foreground subagent executions.
 */

export interface ForegroundRunRequest {
  readonly description: string;
  readonly prompt: string;
  readonly requestedType: string;
  readonly model?: string;
  readonly resume?: string;
}

export interface PreparedInstance {
  readonly agentId: string;
  readonly actualType: string;
  readonly resumed: boolean;
}

export interface SoulRunFailure {
  readonly message: string;
  readonly brief: string;
}

export const SUMMARY_MIN_LENGTH = 200;
export const SUMMARY_CONTINUATION_ATTEMPTS = 1;
export const SUMMARY_CONTINUATION_PROMPT = `Your previous response was too brief. Please provide a more comprehensive summary that includes:

1. Specific technical details and implementations
2. Detailed findings and analysis
3. All important information that the parent agent should know`;
