/**
 * Agent & Runtime — corresponds to Python soul/agent.py
 * Runtime execution environment and Agent loading.
 */

import type { Config, LoopControl } from "../config.ts";
import type { LLM } from "../llm.ts";
import type { Session } from "../session.ts";
import type { HookEngine } from "../hooks/engine.ts";
import type { ModelCapability } from "../types.ts";
import { Approval, ApprovalState } from "./approval.ts";
import { KimiToolset } from "./toolset.ts";
import { SlashCommandRegistry, createDefaultRegistry } from "./slash.ts";
import { Context } from "./context.ts";
import { logger } from "../utils/logging.ts";

// ── Built-in system prompt args ──────────────────────

export interface BuiltinSystemPromptArgs {
  KIMI_NOW: string;
  KIMI_WORK_DIR: string;
  KIMI_WORK_DIR_LS: string;
  KIMI_AGENTS_MD: string;
  KIMI_SKILLS: string;
  KIMI_ADDITIONAL_DIRS_INFO: string;
  KIMI_OS: string;
  KIMI_SHELL: string;
}

// ── Runtime ──────────────────────────────────────────

export class Runtime {
  config: Config;
  llm: LLM | null;
  session: Session;
  approval: Approval;
  hookEngine: HookEngine;
  builtinArgs: BuiltinSystemPromptArgs;
  role: "root" | "subagent";

  constructor(opts: {
    config: Config;
    llm: LLM | null;
    session: Session;
    approval: Approval;
    hookEngine: HookEngine;
    builtinArgs: BuiltinSystemPromptArgs;
    role?: "root" | "subagent";
  }) {
    this.config = opts.config;
    this.llm = opts.llm;
    this.session = opts.session;
    this.approval = opts.approval;
    this.hookEngine = opts.hookEngine;
    this.builtinArgs = opts.builtinArgs;
    this.role = opts.role ?? "root";
  }

  get loopControl(): LoopControl {
    return this.config.loop_control;
  }

  /** Create runtime with defaults. */
  static async create(opts: {
    config: Config;
    llm: LLM | null;
    session: Session;
    hookEngine: HookEngine;
  }): Promise<Runtime> {
    const workDir = opts.session.workDir;

    // Build system prompt args
    let workDirLs = "";
    try {
      const result = await Bun.$`ls -la ${workDir}`.quiet().text();
      workDirLs = result.trim();
    } catch {
      workDirLs = "(unable to list directory)";
    }

    const osType =
      process.platform === "darwin"
        ? "macOS"
        : process.platform === "win32"
          ? "Windows"
          : "Linux";

    const shell = process.env.SHELL ?? "/bin/bash";

    const builtinArgs: BuiltinSystemPromptArgs = {
      KIMI_NOW: new Date().toISOString(),
      KIMI_WORK_DIR: workDir,
      KIMI_WORK_DIR_LS: workDirLs,
      KIMI_AGENTS_MD: "", // TODO: scan for AGENTS.md
      KIMI_SKILLS: "", // TODO: list skills
      KIMI_ADDITIONAL_DIRS_INFO: "",
      KIMI_OS: osType,
      KIMI_SHELL: shell,
    };

    // Restore approval state from session
    const approvalState = new ApprovalState({
      yolo:
        opts.config.default_yolo || opts.session.state.approval.yolo,
      autoApproveActions: new Set(
        opts.session.state.approval.auto_approve_actions,
      ),
    });

    const approval = new Approval({ state: approvalState });

    return new Runtime({
      config: opts.config,
      llm: opts.llm,
      session: opts.session,
      approval,
      hookEngine: opts.hookEngine,
      builtinArgs,
    });
  }

  /** Create a copy for subagents with shared state. */
  copyForSubagent(): Runtime {
    return new Runtime({
      config: this.config,
      llm: this.llm,
      session: this.session,
      approval: this.approval.share(),
      hookEngine: this.hookEngine,
      builtinArgs: {
        ...this.builtinArgs,
        KIMI_NOW: new Date().toISOString(),
      },
      role: "subagent",
    });
  }
}

// ── Agent ──────────────────────────────────────────────

export class Agent {
  readonly name: string;
  readonly systemPrompt: string;
  readonly toolset: KimiToolset;
  readonly runtime: Runtime;
  readonly slashCommands: SlashCommandRegistry;

  constructor(opts: {
    name: string;
    systemPrompt: string;
    toolset: KimiToolset;
    runtime: Runtime;
    slashCommands?: SlashCommandRegistry;
  }) {
    this.name = opts.name;
    this.systemPrompt = opts.systemPrompt;
    this.toolset = opts.toolset;
    this.runtime = opts.runtime;
    this.slashCommands = opts.slashCommands ?? createDefaultRegistry();
  }

  get modelCapabilities(): Set<ModelCapability> | null {
    return this.runtime.llm?.capabilities ?? null;
  }

  get modelName(): string {
    return this.runtime.llm?.modelName ?? "unknown";
  }
}

// ── Agent loader ─────────────────────────────────────

/**
 * Load an agent with its toolset and system prompt.
 */
export async function loadAgent(opts: {
  runtime: Runtime;
  agentName?: string;
  systemPromptOverride?: string;
}): Promise<Agent> {
  const { runtime, agentName = "default" } = opts;

  // Load system prompt
  let systemPrompt = opts.systemPromptOverride ?? "";
  if (!systemPrompt) {
    systemPrompt = await loadSystemPrompt(agentName, runtime.builtinArgs);
  }

  // Create toolset
  const toolset = new KimiToolset({
    context: {
      workingDir: runtime.session.workDir,
      signal: new AbortController().signal,
      approval: async (toolName: string, _action: string, description: string) => {
        const result = await runtime.approval.request(
          toolName,
          toolName,
          description,
        );
        return result.approved ? "approve" : "reject";
      },
      wireEmit: () => {}, // Will be wired by KimiSoul
    },
    hookEngine: runtime.hookEngine,
  });

  // Register built-in tools
  await registerBuiltinTools(toolset);

  return new Agent({
    name: agentName,
    systemPrompt,
    toolset,
    runtime,
  });
}

async function loadSystemPrompt(
  agentName: string,
  args: BuiltinSystemPromptArgs,
): Promise<string> {
  // Try to load from agents/default/system.md
  const paths = [
    `src/kimi_cli/agents/${agentName}/system.md`,
    `agents/${agentName}/system.md`,
  ];

  for (const p of paths) {
    const file = Bun.file(p);
    if (await file.exists()) {
      let template = await file.text();
      // Simple template substitution (${VAR} syntax)
      for (const [key, value] of Object.entries(args)) {
        template = template.replaceAll(`\${${key}}`, String(value));
      }
      return template;
    }
  }

  // Fallback system prompt
  return [
    "You are Kimi, an AI assistant running in a terminal.",
    `Current working directory: ${args.KIMI_WORK_DIR}`,
    `OS: ${args.KIMI_OS}, Shell: ${args.KIMI_SHELL}`,
    `Current date: ${args.KIMI_NOW}`,
    "",
    "You have access to tools for reading/writing files, running shell commands,",
    "and searching the web. Use them to help the user with their tasks.",
  ].join("\n");
}

async function registerBuiltinTools(toolset: KimiToolset): Promise<void> {
  // Import and register all built-in tools
  const toolModules = [
    () => import("../tools/file/read.ts"),
    () => import("../tools/file/write.ts"),
    () => import("../tools/file/replace.ts"),
    () => import("../tools/file/glob.ts"),
    () => import("../tools/file/grep.ts"),
    () => import("../tools/shell/shell.ts"),
    () => import("../tools/web/fetch.ts"),
    () => import("../tools/think/think.ts"),
    () => import("../tools/ask_user/ask_user.ts"),
    () => import("../tools/todo/todo.ts"),
  ];

  for (const loadModule of toolModules) {
    try {
      const mod = await loadModule();
      // Find exported classes that look like tools
      for (const [_key, value] of Object.entries(mod)) {
        if (
          typeof value === "function" &&
          value.prototype &&
          typeof value.prototype.execute === "function" &&
          typeof value.prototype.toDefinition === "function"
        ) {
          try {
            const instance = new (value as new () => any)();
            if (instance.name) {
              toolset.add(instance);
            }
          } catch {
            // Some tools need constructor args, skip
          }
        }
      }
    } catch (err) {
      logger.warn(`Failed to load tool module: ${err}`);
    }
  }
}
