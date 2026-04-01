/**
 * KimiCLI app orchestrator — corresponds to Python app.py
 * Creates and wires together all components.
 */

import { loadConfig, type Config, type ConfigMeta } from "./config.ts";
import { createLLM, augmentProviderWithEnvVars, type LLM } from "./llm.ts";
import { Session } from "./session.ts";
import { HookEngine } from "./hooks/engine.ts";
import { Context } from "./soul/context.ts";
import { Runtime, Agent, loadAgent } from "./soul/agent.ts";
import { KimiSoul, type SoulCallbacks } from "./soul/kimisoul.ts";
import { logger } from "./utils/logging.ts";

// ── KimiCLI ─────────────────────────────────────────

export class KimiCLI {
  readonly soul: KimiSoul;
  readonly agent: Agent;
  readonly session: Session;
  readonly config: Config;
  readonly configMeta: ConfigMeta;
  readonly context: Context;

  private constructor(opts: {
    soul: KimiSoul;
    agent: Agent;
    session: Session;
    config: Config;
    configMeta: ConfigMeta;
    context: Context;
  }) {
    this.soul = opts.soul;
    this.agent = opts.agent;
    this.session = opts.session;
    this.config = opts.config;
    this.configMeta = opts.configMeta;
    this.context = opts.context;
  }

  // ── Factory ──────────────────────────────────────

  static async create(opts: {
    workDir?: string;
    configFile?: string;
    modelName?: string;
    thinking?: boolean;
    yolo?: boolean;
    sessionId?: string;
    maxStepsPerTurn?: number;
    callbacks?: SoulCallbacks;
  }): Promise<KimiCLI> {
    const workDir = opts.workDir ?? process.cwd();

    // 1. Load config
    const { config, meta: configMeta } = await loadConfig(opts.configFile);

    // Override settings from CLI flags
    if (opts.maxStepsPerTurn) {
      config.loop_control.max_steps_per_turn = opts.maxStepsPerTurn;
    }
    if (opts.yolo) {
      config.default_yolo = true;
    }

    // 2. Determine model
    const modelName = opts.modelName ?? config.default_model;
    let llm: LLM | null = null;

    if (modelName && config.models[modelName]) {
      const modelConfig = config.models[modelName]!;
      const providerName = modelConfig.provider;
      const providerConfig = config.providers[providerName];

      if (providerConfig) {
        // Convert snake_case config to camelCase LLM interface
        const llmProvider = {
          type: providerConfig.type as any,
          baseUrl: providerConfig.base_url,
          apiKey: providerConfig.api_key,
          customHeaders: providerConfig.custom_headers,
          env: providerConfig.env,
          oauth: providerConfig.oauth?.key ?? null,
        };
        const llmModel = {
          model: modelConfig.model,
          provider: modelConfig.provider,
          maxContextSize: modelConfig.max_context_size,
          capabilities: modelConfig.capabilities,
        };

        // Apply env var overrides
        augmentProviderWithEnvVars(llmProvider, llmModel);

        llm = createLLM(llmProvider, llmModel, {
          thinking: opts.thinking ?? config.default_thinking,
        });
      }
    }

    // Fallback: create LLM from environment variables directly
    // Supports: KIMI_BASE_URL, KIMI_API_KEY, KIMI_MODEL_NAME
    if (!llm) {
      const envBaseUrl = process.env.KIMI_BASE_URL;
      const envApiKey = process.env.KIMI_API_KEY;
      const envModel = process.env.KIMI_MODEL_NAME;

      if (envBaseUrl && envApiKey && envModel) {
        const llmProvider = {
          type: "kimi" as const,
          baseUrl: envBaseUrl,
          apiKey: envApiKey,
        };
        const llmModel = {
          model: envModel,
          provider: "env",
          maxContextSize: parseInt(
            process.env.KIMI_MODEL_MAX_CONTEXT_SIZE ?? "131072",
            10,
          ),
          capabilities: undefined as any,
        };

        llm = createLLM(llmProvider, llmModel, {
          thinking: opts.thinking ?? config.default_thinking,
        });

        if (llm) {
          logger.info(
            `LLM from env: ${envModel} @ ${envBaseUrl}`,
          );
        }
      }
    }

    if (!llm) {
      logger.warn(
        `No LLM configured for model "${modelName}". ` +
          "Set up a model in ~/.kimi/config.toml",
      );
    }

    // 3. Create/restore session
    let session: Session;
    if (opts.sessionId) {
      const found = await Session.find(workDir, opts.sessionId);
      session = found ?? (await Session.create(workDir));
    } else {
      session = await Session.create(workDir);
    }

    // 4. Create hook engine
    const hookEngine = new HookEngine({
      hooks: config.hooks,
      cwd: workDir,
    });

    // 5. Create runtime
    const runtime = await Runtime.create({
      config,
      llm,
      session,
      hookEngine,
    });

    // 6. Load agent
    const agent = await loadAgent({ runtime });

    // 7. Create/restore context
    const context = new Context(session.contextFile);
    await context.restore();

    // 8. Write system prompt if new context
    if (!context.systemPrompt) {
      await context.writeSystemPrompt(agent.systemPrompt);
    }

    // 9. Create KimiSoul
    const soul = new KimiSoul({
      agent,
      context,
      callbacks: opts.callbacks ?? {},
    });

    // Wire slash commands
    soul.wireSlashCommands();

    return new KimiCLI({
      soul,
      agent,
      session,
      config,
      configMeta,
      context,
    });
  }

  // ── Run modes ────────────────────────────────────

  /**
   * Run in interactive shell mode (React Ink TUI).
   */
  async runShell(initialCommand?: string): Promise<boolean> {
    // This will be called from cli/index.ts with Ink rendering
    // The shell component will call soul.run() directly
    if (initialCommand) {
      await this.soul.run(initialCommand);
    }
    return true; // continue
  }

  /**
   * Run in print mode (non-interactive).
   */
  async runPrint(input: string): Promise<void> {
    await this.soul.run(input);
  }

  // ── Lifecycle ──────────────────────────────────

  async shutdown(): Promise<void> {
    this.soul.abort();
    await this.agent.toolset.cleanup();
    await this.session.saveState();
    logger.info("KimiCLI shutdown complete");
  }
}
