/**
 * Centralized terminal color theme definitions.
 * Corresponds to Python's ui/theme.py.
 *
 * All UI-facing colors live here so that switching between dark and light
 * terminal themes only requires changing the active ThemeName.
 */

import chalk, { type ChalkInstance } from "chalk";

export type ThemeName = "dark" | "light";

// ── Diff Colors ────────────────────────────────────────────

export interface DiffColors {
  addBg: string;
  delBg: string;
  addHl: string;
  delHl: string;
}

const DIFF_DARK: DiffColors = {
  addBg: "#12261e",
  delBg: "#2d1214",
  addHl: "#1a4a2e",
  delHl: "#5c1a1d",
};

const DIFF_LIGHT: DiffColors = {
  addBg: "#dafbe1",
  delBg: "#ffebe9",
  addHl: "#aff5b4",
  delHl: "#ffc1c0",
};

// ── Toolbar Colors ─────────────────────────────────────────

export interface ToolbarColors {
  separator: string;
  yoloLabel: string;
  planLabel: string;
  planPrompt: string;
  cwd: string;
  bgTasks: string;
  tip: string;
}

const TOOLBAR_DARK: ToolbarColors = {
  separator: "#4d4d4d",
  yoloLabel: "#ffff00",
  planLabel: "#00aaff",
  planPrompt: "#00aaff",
  cwd: "#666666",
  bgTasks: "#888888",
  tip: "#555555",
};

const TOOLBAR_LIGHT: ToolbarColors = {
  separator: "#d1d5db",
  yoloLabel: "#b45309",
  planLabel: "#2563eb",
  planPrompt: "#2563eb",
  cwd: "#6b7280",
  bgTasks: "#4b5563",
  tip: "#9ca3af",
};

// ── MCP Prompt Colors ──────────────────────────────────────

export interface MCPPromptColors {
  text: string;
  detail: string;
  connected: string;
  connecting: string;
  pending: string;
  failed: string;
}

const MCP_PROMPT_DARK: MCPPromptColors = {
  text: "#d4d4d4",
  detail: "#7c8594",
  connected: "#56d364",
  connecting: "#56a4ff",
  pending: "#f2cc60",
  failed: "#ff7b72",
};

const MCP_PROMPT_LIGHT: MCPPromptColors = {
  text: "#374151",
  detail: "#6b7280",
  connected: "#166534",
  connecting: "#1d4ed8",
  pending: "#92400e",
  failed: "#dc2626",
};

// ── Message Colors ─────────────────────────────────────────

export interface MessageColors {
  user: string;
  assistant: string;
  system: string;
  tool: string;
  error: string;
  dim: string;
  thinking: string;
  highlight: string;
}

const MESSAGE_DARK: MessageColors = {
  user: "#6fb7ff",
  assistant: "#d4d4d4",
  system: "#7c8594",
  tool: "#9ca3af",
  error: "#ff7b72",
  dim: "#555555",
  thinking: "#7c8594",
  highlight: "#56d364",
};

const MESSAGE_LIGHT: MessageColors = {
  user: "#1d4ed8",
  assistant: "#374151",
  system: "#6b7280",
  tool: "#4b5563",
  error: "#dc2626",
  dim: "#9ca3af",
  thinking: "#6b7280",
  highlight: "#166534",
};

// ── Chalk helpers ──────────────────────────────────────────

export interface ThemeStyles {
  user: ChalkInstance;
  assistant: ChalkInstance;
  system: ChalkInstance;
  tool: ChalkInstance;
  error: ChalkInstance;
  dim: ChalkInstance;
  thinking: ChalkInstance;
  highlight: ChalkInstance;
  bold: ChalkInstance;
  italic: ChalkInstance;
}

function makeStyles(colors: MessageColors): ThemeStyles {
  return {
    user: chalk.hex(colors.user),
    assistant: chalk.hex(colors.assistant),
    system: chalk.hex(colors.system),
    tool: chalk.hex(colors.tool),
    error: chalk.hex(colors.error),
    dim: chalk.hex(colors.dim),
    thinking: chalk.italic.hex(colors.thinking),
    highlight: chalk.hex(colors.highlight),
    bold: chalk.bold,
    italic: chalk.italic,
  };
}

// ── Public API ─────────────────────────────────────────────

let activeTheme: ThemeName = "dark";

export function setActiveTheme(theme: ThemeName): void {
  activeTheme = theme;
}

export function getActiveTheme(): ThemeName {
  return activeTheme;
}

export function getDiffColors(): DiffColors {
  return activeTheme === "light" ? DIFF_LIGHT : DIFF_DARK;
}

export function getToolbarColors(): ToolbarColors {
  return activeTheme === "light" ? TOOLBAR_LIGHT : TOOLBAR_DARK;
}

export function getMcpPromptColors(): MCPPromptColors {
  return activeTheme === "light" ? MCP_PROMPT_LIGHT : MCP_PROMPT_DARK;
}

export function getMessageColors(): MessageColors {
  return activeTheme === "light" ? MESSAGE_LIGHT : MESSAGE_DARK;
}

export function getStyles(): ThemeStyles {
  return makeStyles(getMessageColors());
}
