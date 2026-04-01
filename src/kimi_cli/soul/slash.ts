/**
 * Slash command registry — corresponds to Python soul/slash concepts
 * Provides registration + dispatch for /commands in the CLI.
 */

import type { SlashCommand } from "../types.ts";

export class SlashCommandRegistry {
  private commands = new Map<string, SlashCommand>();
  private aliases = new Map<string, string>();

  register(command: SlashCommand): void {
    this.commands.set(command.name, command);
    if (command.aliases) {
      for (const alias of command.aliases) {
        this.aliases.set(alias, command.name);
      }
    }
  }

  get(name: string): SlashCommand | undefined {
    const resolved = this.aliases.get(name) ?? name;
    return this.commands.get(resolved);
  }

  has(name: string): boolean {
    return this.commands.has(name) || this.aliases.has(name);
  }

  list(): SlashCommand[] {
    return [...this.commands.values()];
  }

  async execute(input: string): Promise<boolean> {
    const trimmed = input.trim();
    if (!trimmed.startsWith("/")) return false;

    const spaceIdx = trimmed.indexOf(" ");
    const name = spaceIdx === -1 ? trimmed.slice(1) : trimmed.slice(1, spaceIdx);
    const args = spaceIdx === -1 ? "" : trimmed.slice(spaceIdx + 1).trim();

    const cmd = this.get(name);
    if (!cmd) return false;

    await cmd.handler(args);
    return true;
  }
}

/**
 * Create a default registry with built-in commands.
 * Handlers are stubs — the real app wires them up.
 */
export function createDefaultRegistry(): SlashCommandRegistry {
  const registry = new SlashCommandRegistry();

  const builtins: SlashCommand[] = [
    {
      name: "clear",
      description: "Clear conversation history",
      handler: async () => {
        /* wired by app */
      },
    },
    {
      name: "compact",
      description: "Compact conversation context",
      handler: async () => {},
    },
    {
      name: "yolo",
      description: "Toggle auto-approve mode",
      aliases: ["auto-approve"],
      handler: async () => {},
    },
    {
      name: "plan",
      description: "Toggle plan mode",
      handler: async () => {},
    },
    {
      name: "model",
      description: "Switch model",
      handler: async () => {},
    },
    {
      name: "help",
      description: "Show help",
      aliases: ["?"],
      handler: async () => {},
    },
    {
      name: "init",
      description: "Initialize project configuration",
      handler: async () => {},
    },
    {
      name: "add-dir",
      description: "Add directory to workspace scope",
      handler: async () => {},
    },
  ];

  for (const cmd of builtins) {
    registry.register(cmd);
  }

  return registry;
}
