/**
 * Shell slash commands — corresponds to Python's ui/shell/slash.py.
 * Shell-level commands: /clear, /help, /exit, /theme, /version.
 */

import type { SlashCommand } from "../../types";

export type SlashCommandHandler = (args: string) => Promise<void>;

export interface ShellSlashContext {
  clearMessages: () => void;
  exit: () => void;
  setTheme: (theme: "dark" | "light") => void;
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
        // Help text is printed inline
        console.log(formatHelp());
      },
    },
    {
      name: "theme",
      description: "Toggle dark/light theme",
      handler: async (args: string) => {
        const theme = args.trim() as "dark" | "light";
        if (theme === "dark" || theme === "light") {
          ctx.setTheme(theme);
        } else {
          // Toggle
          ctx.setTheme("dark"); // TODO: read current and toggle
        }
      },
    },
    {
      name: "version",
      description: "Show version information",
      handler: async () => {
        console.log("kimi-cli v2.0.0 (TypeScript)");
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

function formatHelp(): string {
  const lines = [
    "",
    "  Kimi Code CLI — Commands",
    "",
    "  Slash Commands:",
    "    /help, /h, /?     Show this help",
    "    /clear, /cls       Clear conversation",
    "    /exit, /quit, /q   Exit",
    "    /theme [dark|light] Toggle theme",
    "    /version           Show version",
    "",
    "  Keyboard Shortcuts:",
    "    Ctrl+C             Interrupt / Exit (double press)",
    "    Ctrl+D             Exit",
    "    Up/Down            Navigate history",
    "    Enter              Submit message",
    "",
  ];
  return lines.join("\n");
}
