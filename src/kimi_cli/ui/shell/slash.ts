/**
 * Shell slash commands — corresponds to Python's ui/shell/slash.py.
 * Shell-level commands: /clear, /help, /exit, /theme, /version.
 */

import type { SlashCommand, CommandPanelConfig } from "../../types";
import { getActiveTheme } from "../theme.ts";

export type SlashCommandHandler = (args: string) => Promise<void>;

export interface ShellSlashContext {
  clearMessages: () => void;
  exit: () => void;
  setTheme: (theme: "dark" | "light") => void;
  getAllCommands: () => SlashCommand[];
  pushNotification: (title: string, body: string) => void;
}

/**
 * Create shell-level slash commands.
 */
export function createShellSlashCommands(
  ctx: ShellSlashContext,
): SlashCommand[] {
  return [
    {
      name: "clear",
      description: "Clear conversation history",
      aliases: ["cls"],
      handler: async () => {
        ctx.clearMessages();
      },
    },
    {
      name: "exit",
      description: "Exit the application",
      aliases: ["quit", "q"],
      handler: async () => {
        ctx.exit();
      },
    },
    {
      name: "help",
      description: "Show help information",
      aliases: ["h", "?"],
      handler: async () => {
        // Fallback when panel is not used (e.g. direct /help invocation)
        const allCmds = ctx.getAllCommands();
        ctx.pushNotification("Help", formatHelp(allCmds));
      },
      panel: (): CommandPanelConfig => {
        const allCmds = ctx.getAllCommands();
        return {
          type: "content",
          title: "Help",
          content: formatHelp(allCmds),
        };
      },
    },
    {
      name: "theme",
      description: "Toggle dark/light theme",
      handler: async (args: string) => {
        const theme = args.trim() as "dark" | "light";
        if (theme === "dark" || theme === "light") {
          ctx.setTheme(theme);
          ctx.pushNotification("Theme", `Switched to ${theme} theme.`);
        } else {
          // Toggle
          const current = getActiveTheme();
          const next = current === "dark" ? "light" : "dark";
          ctx.setTheme(next);
          ctx.pushNotification("Theme", `Switched to ${next} theme.`);
        }
      },
      panel: (): CommandPanelConfig => {
        const current = getActiveTheme();
        return {
          type: "choice",
          title: "Theme",
          items: [
            { label: "🌙 Dark", value: "dark", current: current === "dark" },
            { label: "☀️  Light", value: "light", current: current === "light" },
          ],
          onSelect: (value: string) => {
            const theme = value as "dark" | "light";
            ctx.setTheme(theme);
            ctx.pushNotification("Theme", `Switched to ${theme} theme.`);
          },
        };
      },
    },
    {
      name: "version",
      description: "Show version information",
      handler: async () => {
        ctx.pushNotification("Version", "kimi-cli v2.0.0 (TypeScript)");
      },
    },
  ];
}

/**
 * Parse a slash command from input string.
 * Returns null if not a slash command.
 */
export function parseSlashCommand(
  input: string,
): { name: string; args: string } | null {
  if (!input.startsWith("/")) return null;
  const trimmed = input.slice(1).trim();
  if (!trimmed) return null;
  const spaceIdx = trimmed.indexOf(" ");
  if (spaceIdx === -1) {
    return { name: trimmed, args: "" };
  }
  return {
    name: trimmed.slice(0, spaceIdx),
    args: trimmed.slice(spaceIdx + 1).trim(),
  };
}

/**
 * Find a slash command by name or alias.
 */
export function findSlashCommand(
  commands: SlashCommand[],
  name: string,
): SlashCommand | undefined {
  return commands.find(
    (cmd) => cmd.name === name || cmd.aliases?.includes(name),
  );
}

function formatHelp(commands: SlashCommand[]): string {
  const lines = [
    "Kimi Code CLI — Help",
    "",
    "Keyboard Shortcuts:",
    "  Ctrl+X             Toggle agent/shell mode",
    "  Shift+Tab          Toggle plan mode",
    "  Ctrl+O             Edit in external editor",
    "  Ctrl+J / Alt+Enter Insert newline",
    "  Ctrl+V             Paste (supports images)",
    "  Ctrl+D             Exit",
    "  Ctrl+C             Interrupt",
    "",
    "Slash Commands:",
  ];

  // Deduplicate by name and sort
  const seen = new Set<string>();
  const sorted = commands
    .filter((c) => {
      if (seen.has(c.name)) return false;
      seen.add(c.name);
      return true;
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  for (const cmd of sorted) {
    const aliases = cmd.aliases?.length ? `, /${cmd.aliases.join(", /")}` : "";
    const nameStr = `/${cmd.name}${aliases}`;
    lines.push(`  ${nameStr.padEnd(22)} ${cmd.description}`);
  }

  lines.push("");
  return lines.join("\n");
}
