/**
 * Plugin tool wrapper — corresponds to Python plugin/tool.py
 * Runs plugin-declared tools as subprocesses.
 */

import { join } from "node:path";
import { existsSync, readdirSync, statSync } from "node:fs";
import { logger } from "../utils/logging.ts";
import {
  type PluginToolSpec,
  type PluginSpec,
  PluginError,
  PLUGIN_JSON,
  parsePluginJson,
} from "./manager.ts";

export interface PluginToolResult {
  ok: boolean;
  output: string;
  brief?: string;
}

export class PluginTool {
  readonly name: string;
  readonly description: string;
  readonly parameters: Record<string, unknown>;
  private _command: string[];
  private _pluginDir: string;
  private _inject: Record<string, string>;

  constructor(opts: {
    toolSpec: PluginToolSpec;
    pluginDir: string;
    inject: Record<string, string>;
  }) {
    this.name = opts.toolSpec.name;
    this.description = opts.toolSpec.description;
    this.parameters = opts.toolSpec.parameters || { type: "object", properties: {} };
    this._command = opts.toolSpec.command;
    this._pluginDir = opts.pluginDir;
    this._inject = opts.inject;
  }

  private buildEnv(): Record<string, string> {
    const env: Record<string, string> = { ...process.env } as Record<string, string>;
    // Inject values are directly set as env vars
    for (const [targetKey, sourceKey] of Object.entries(this._inject)) {
      // The values should be resolved by the caller
      if (sourceKey) {
        env[targetKey] = sourceKey;
      }
    }
    return env;
  }

  async execute(params: Record<string, unknown>): Promise<PluginToolResult> {
    const paramsJson = JSON.stringify(params);

    try {
      const proc = Bun.spawn(this._command, {
        stdin: new Blob([paramsJson]),
        stdout: "pipe",
        stderr: "pipe",
        cwd: this._pluginDir,
        env: this.buildEnv(),
      });

      const timer = setTimeout(() => proc.kill(), 120_000);
      const exitCode = await proc.exited;
      clearTimeout(timer);

      const stdout = await new Response(proc.stdout).text();
      const stderr = await new Response(proc.stderr).text();
      const output = stdout.trim();
      const errOutput = stderr.trim();

      if (exitCode !== 0) {
        const errorMsg = errOutput || output || `Exit code ${exitCode}`;
        return {
          ok: false,
          output: `Plugin tool '${this.name}' failed: ${errorMsg}`,
          brief: `Exit ${exitCode}`,
        };
      }

      if (errOutput) {
        logger.debug(`Plugin tool ${this.name} stderr: ${errOutput}`);
      }

      return { ok: true, output };
    } catch (err) {
      return { ok: false, output: String(err), brief: "Runtime error" };
    }
  }
}

/**
 * Scan installed plugins and create PluginTool instances for declared tools.
 */
export function loadPluginTools(pluginsDir: string): PluginTool[] {
  if (!existsSync(pluginsDir)) return [];
  try {
    if (!statSync(pluginsDir).isDirectory()) return [];
  } catch {
    return [];
  }

  const tools: PluginTool[] = [];
  for (const child of readdirSync(pluginsDir).sort()) {
    const childPath = join(pluginsDir, child);
    const pluginJson = join(childPath, PLUGIN_JSON);
    if (!existsSync(pluginJson)) continue;
    try {
      if (!statSync(childPath).isDirectory()) continue;
    } catch {
      continue;
    }

    let spec: PluginSpec;
    try {
      spec = parsePluginJson(pluginJson);
    } catch {
      continue;
    }

    for (const toolSpec of spec.tools) {
      try {
        tools.push(
          new PluginTool({
            toolSpec,
            pluginDir: childPath,
            inject: spec.inject,
          }),
        );
        logger.info(`Loaded plugin tool: ${toolSpec.name} (from ${spec.name})`);
      } catch {
        logger.warn(`Skipping invalid plugin tool: ${toolSpec.name} (from ${spec.name})`);
      }
    }
  }
  return tools;
}
