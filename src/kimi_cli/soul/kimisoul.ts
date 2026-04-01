/**
 * KimiSoul — corresponds to Python soul/kimisoul.py
 * The core agent loop: receive input → call LLM → execute tools → repeat.
 */

import type { Message, ContentPart, ToolCall, TokenUsage, StatusSnapshot, SlashCommand, ModelCapability } from "../types.ts";
import type { ToolResult } from "../tools/types.ts";
import type { LLM, StreamChunk, ChatOptions } from "../llm.ts";
import type { HookEngine } from "../hooks/engine.ts";
import { Context } from "./context.ts";
import { Agent, type Runtime } from "./agent.ts";
import { KimiToolset } from "./toolset.ts";
import { SlashCommandRegistry } from "./slash.ts";
import { compactContext, shouldCompact } from "./compaction.ts";
import { toolResultMessage } from "./message.ts";
import { logger } from "../utils/logging.ts";

// ── Wire event callbacks ────────────────────────────

export interface SoulCallbacks {
  onTurnBegin?: (userInput: string | ContentPart[]) => void;
  onTurnEnd?: () => void;
  onStepBegin?: (stepNum: number) => void;
  onStepInterrupted?: () => void;
  onTextDelta?: (text: string) => void;
  onThinkDelta?: (text: string) => void;
  onToolCall?: (toolCall: ToolCall) => void;
  onToolResult?: (toolCallId: string, result: ToolResult) => void;
  onStatusUpdate?: (status: Partial<StatusSnapshot>) => void;
  onCompactionBegin?: () => void;
  onCompactionEnd?: () => void;
  onError?: (error: Error) => void;
}

// ── KimiSoul ────────────────────────────────────────

export class KimiSoul {
  private agent: Agent;
  private context: Context;
  private callbacks: SoulCallbacks;
  private abortController: AbortController | null = null;
  private _isRunning = false;
  private _planMode = false;
  private _stepCount = 0;
  private _totalUsage: TokenUsage = {
    inputTokens: 0,
    outputTokens: 0,
  };

  constructor(opts: {
    agent: Agent;
    context: Context;
    callbacks?: SoulCallbacks;
  }) {
    this.agent = opts.agent;
    this.context = opts.context;
    this.callbacks = opts.callbacks ?? {};
  }

  // ── Properties ───────────────────────────────────

  get name(): string {
    return this.agent.name;
  }

  get modelName(): string {
    return this.agent.modelName;
  }

  get modelCapabilities(): Set<ModelCapability> | null {
    return this.agent.modelCapabilities;
  }

  get thinking(): boolean {
    return this.agent.runtime.llm?.hasCapability("thinking") ?? false;
  }

  get isRunning(): boolean {
    return this._isRunning;
  }

  get planMode(): boolean {
    return this._planMode;
  }

  get isYolo(): boolean {
    return this.agent.runtime.approval.isYolo();
  }

  get status(): StatusSnapshot {
    const llm = this.agent.runtime.llm;
    const maxCtx = llm?.maxContextSize ?? 0;
    const tokenCount = this.context.tokenCountWithPending;
    return {
      contextUsage: maxCtx > 0 ? tokenCount / maxCtx : null,
      contextTokens: tokenCount,
      maxContextTokens: maxCtx,
      tokenUsage: this._totalUsage,
      planMode: this._planMode,
      mcpStatus: null,
    };
  }

  get hookEngine(): HookEngine {
    return this.agent.runtime.hookEngine;
  }

  get availableSlashCommands(): SlashCommand[] {
    return this.agent.slashCommands.list();
  }

  // ── Plan mode ────────────────────────────────────

  togglePlanMode(): void {
    this._planMode = !this._planMode;
    this.callbacks.onStatusUpdate?.({ planMode: this._planMode });
  }

  setPlanMode(on: boolean): void {
    this._planMode = on;
    this.callbacks.onStatusUpdate?.({ planMode: this._planMode });
  }

  // ── Yolo mode ────────────────────────────────────

  setYolo(yolo: boolean): void {
    this.agent.runtime.approval.setYolo(yolo);
  }

  // ── Main entry point ─────────────────────────────

  async run(userInput: string | ContentPart[]): Promise<void> {
    if (this._isRunning) {
      logger.warn("Soul is already running, ignoring input");
      return;
    }

    // Check for slash commands
    if (typeof userInput === "string" && userInput.trim().startsWith("/")) {
      const handled = await this.agent.slashCommands.execute(userInput);
      if (handled) return;
    }

    this._isRunning = true;
    this.abortController = new AbortController();

    try {
      this.callbacks.onTurnBegin?.(userInput);
      await this._turn(userInput);
      this.callbacks.onTurnEnd?.();
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        logger.info("Turn aborted");
      } else {
        logger.error(`Turn error: ${err}`);
        this.callbacks.onError?.(
          err instanceof Error ? err : new Error(String(err)),
        );
      }
    } finally {
      this._isRunning = false;
      this.abortController = null;
    }
  }

  /** Abort the current turn. */
  abort(): void {
    this.abortController?.abort();
  }

  /** Steer: inject follow-up input during a running turn. */
  async steer(content: string | ContentPart[]): Promise<void> {
    if (!this._isRunning) return;
    const msg: Message = {
      role: "user",
      content: typeof content === "string" ? content : content,
    };
    await this.context.appendMessage(msg);
  }

  // ── Turn execution ──────────────────────────────

  private async _turn(userInput: string | ContentPart[]): Promise<void> {
    // Append user message
    const userMsg: Message = {
      role: "user",
      content: typeof userInput === "string" ? userInput : userInput,
    };
    await this.context.appendMessage(userMsg);

    // Agent loop
    await this._agentLoop();
  }

  // ── Agent loop ──────────────────────────────────

  private async _agentLoop(): Promise<void> {
    const maxSteps = this.agent.runtime.config.loop_control.max_steps_per_turn;
    this._stepCount = 0;

    while (this._stepCount < maxSteps) {
      // Check abort
      if (this.abortController?.signal.aborted) {
        this.callbacks.onStepInterrupted?.();
        break;
      }

      // Check if compaction needed
      await this._maybeCompact();

      // Execute one step
      this._stepCount++;
      this.callbacks.onStepBegin?.(this._stepCount);

      const toolCalls = await this._step();

      // No tool calls = turn is done
      if (toolCalls.length === 0) break;

      // Execute tools and collect results
      for (const tc of toolCalls) {
        if (this.abortController?.signal.aborted) break;

        const result = await this.agent.toolset.handle(tc);

        // Build tool result message and append to context
        const resultMsg = toolResultMessage({
          toolCallId: tc.id,
          output: result.output,
          isError: result.isError,
          message: result.message,
        });
        await this.context.appendMessage(resultMsg);
      }
    }

    if (this._stepCount >= maxSteps) {
      logger.warn(`Reached max steps per turn: ${maxSteps}`);
    }
  }

  // ── Single step ─────────────────────────────────

  private async _step(): Promise<ToolCall[]> {
    const llm = this.agent.runtime.llm;
    if (!llm) {
      throw new Error("No LLM configured");
    }

    // Build messages for LLM
    const messages = [...this.context.history] as Message[];

    // Collect dynamic injections (plan mode reminder, etc.)
    const injections = this._collectDynamicInjections();
    if (injections.length > 0) {
      // Add as the last user message (system reminder)
      messages.push({
        role: "user",
        content: injections.join("\n\n"),
      });
    }

    // Call LLM
    const chatOptions: ChatOptions = {
      system: this.agent.systemPrompt,
      tools: this.agent.toolset.definitions(),
      signal: this.abortController?.signal,
    };

    let assistantText = "";
    let thinkText = "";
    const toolCalls: ToolCall[] = [];
    let usage: TokenUsage | null = null;

    const stream = llm.chat(messages, chatOptions);

    for await (const chunk of stream) {
      switch (chunk.type) {
        case "text":
          assistantText += chunk.text;
          this.callbacks.onTextDelta?.(chunk.text);
          break;

        case "think":
          thinkText += chunk.text;
          this.callbacks.onThinkDelta?.(chunk.text);
          break;

        case "tool_call":
          toolCalls.push({
            id: chunk.id,
            name: chunk.name,
            arguments: chunk.arguments,
          });
          this.callbacks.onToolCall?.({
            id: chunk.id,
            name: chunk.name,
            arguments: chunk.arguments,
          });
          break;

        case "usage":
          usage = chunk.usage;
          this._totalUsage = {
            inputTokens:
              this._totalUsage.inputTokens + chunk.usage.inputTokens,
            outputTokens:
              this._totalUsage.outputTokens + chunk.usage.outputTokens,
          };
          break;

        case "done":
          break;
      }
    }

    // Build assistant message content
    const contentParts: ContentPart[] = [];
    if (assistantText) {
      contentParts.push({ type: "text", text: assistantText });
    }
    for (const tc of toolCalls) {
      contentParts.push({
        type: "tool_use",
        id: tc.id,
        name: tc.name,
        input: JSON.parse(tc.arguments || "{}"),
      });
    }

    // Append assistant message to context
    // Note: reasoning_content (thinkText) is stored separately in the message
    // and will be serialized as reasoning_content field for the API
    if (contentParts.length > 0) {
      const assistantMsg: Message & { reasoning_content?: string } = {
        role: "assistant",
        content: contentParts,
      };
      // Preserve thinking content so it can be sent back to the model
      if (thinkText) {
        assistantMsg.reasoning_content = thinkText;
      }
      await this.context.appendMessage(assistantMsg);
    }

    // Update token count
    if (usage) {
      await this.context.updateTokenCount(usage);
    }

    // Send status update
    this.callbacks.onStatusUpdate?.(this.status);

    return toolCalls;
  }

  // ── Dynamic injections ──────────────────────────

  private _collectDynamicInjections(): string[] {
    const injections: string[] = [];

    if (this._planMode) {
      injections.push(
        "<system-reminder>\n" +
          "Plan mode is active. You MUST NOT make any edits or run any non-readonly tools. " +
          "Focus on exploring the codebase and designing an implementation approach.\n" +
          "</system-reminder>",
      );
    }

    return injections;
  }

  // ── Compaction ──────────────────────────────────

  private async _maybeCompact(): Promise<void> {
    const llm = this.agent.runtime.llm;
    if (!llm) return;

    const lc = this.agent.runtime.config.loop_control;

    if (
      shouldCompact(
        this.context.tokenCountWithPending,
        llm.maxContextSize,
        lc.reserved_context_size,
        lc.compaction_trigger_ratio,
      )
    ) {
      this.callbacks.onCompactionBegin?.();
      try {
        await compactContext(this.context, llm);
      } catch (err) {
        logger.error(`Compaction failed: ${err}`);
      }
      this.callbacks.onCompactionEnd?.();
    }
  }

  // ── Slash command wiring ────────────────────────

  wireSlashCommands(): void {
    const registry = this.agent.slashCommands;

    // Wire /clear
    const clearCmd = registry.get("clear");
    if (clearCmd) {
      clearCmd.handler = async () => {
        await this.context.compact();
        logger.info("Context cleared");
      };
    }

    // Wire /compact
    const compactCmd = registry.get("compact");
    if (compactCmd) {
      compactCmd.handler = async (args: string) => {
        const llm = this.agent.runtime.llm;
        if (!llm) return;
        await compactContext(this.context, llm, { focus: args || undefined });
      };
    }

    // Wire /yolo
    const yoloCmd = registry.get("yolo");
    if (yoloCmd) {
      yoloCmd.handler = async () => {
        const newYolo = !this.isYolo;
        this.setYolo(newYolo);
        logger.info(`YOLO mode: ${newYolo ? "ON" : "OFF"}`);
      };
    }

    // Wire /plan
    const planCmd = registry.get("plan");
    if (planCmd) {
      planCmd.handler = async (args: string) => {
        if (args === "on") this.setPlanMode(true);
        else if (args === "off") this.setPlanMode(false);
        else this.togglePlanMode();
        logger.info(`Plan mode: ${this._planMode ? "ON" : "OFF"}`);
      };
    }
  }
}
