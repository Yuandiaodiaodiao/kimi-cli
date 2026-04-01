/**
 * Session module — corresponds to Python session.py + session_state.py
 * Manages per-workdir sessions with context files and state persistence.
 */

import { z } from "zod/v4";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { getShareDir } from "./config.ts";
import { logger } from "./utils/logging.ts";

// ── Session State ───────────────────────────────────────

export const ApprovalStateData = z.object({
  yolo: z.boolean().default(false),
  auto_approve_actions: z.array(z.string()).default([]),
});
export type ApprovalStateData = z.infer<typeof ApprovalStateData>;

export const SessionState = z.object({
  version: z.number().int().default(1),
  approval: ApprovalStateData.default({} as any),
  additional_dirs: z.array(z.string()).default([]),
  custom_title: z.string().nullable().default(null),
  title_generated: z.boolean().default(false),
  title_generate_attempts: z.number().int().default(0),
  plan_mode: z.boolean().default(false),
  plan_session_id: z.string().nullable().default(null),
  plan_slug: z.string().nullable().default(null),
  wire_mtime: z.number().nullable().default(null),
  archived: z.boolean().default(false),
  archived_at: z.number().nullable().default(null),
  auto_archive_exempt: z.boolean().default(false),
});
export type SessionState = z.infer<typeof SessionState>;

const STATE_FILE_NAME = "state.json";

export async function loadSessionState(sessionDir: string): Promise<SessionState> {
  const stateFile = join(sessionDir, STATE_FILE_NAME);
  const file = Bun.file(stateFile);
  if (!(await file.exists())) {
    return SessionState.parse({});
  }
  try {
    const data = await file.json();
    return SessionState.parse(data);
  } catch {
    logger.warn(`Corrupted state file, using defaults: ${stateFile}`);
    return SessionState.parse({});
  }
}

export async function saveSessionState(state: SessionState, sessionDir: string): Promise<void> {
  const stateFile = join(sessionDir, STATE_FILE_NAME);
  await Bun.write(stateFile, JSON.stringify(state, null, 2));
}

// ── WorkDir Metadata ────────────────────────────────────

function getSessionsBaseDir(workDir: string): string {
  return join(getShareDir(), "sessions", workDir.replace(/\//g, "_").replace(/^_/, ""));
}

// ── Session class ───────────────────────────────────────

export class Session {
  readonly id: string;
  readonly workDir: string;
  readonly sessionsDir: string;
  readonly contextFile: string;
  readonly wireFile: string;
  state: SessionState;
  title: string;
  updatedAt: number;

  constructor(opts: {
    id: string;
    workDir: string;
    sessionsDir: string;
    contextFile: string;
    wireFile: string;
    state: SessionState;
    title?: string;
    updatedAt?: number;
  }) {
    this.id = opts.id;
    this.workDir = opts.workDir;
    this.sessionsDir = opts.sessionsDir;
    this.contextFile = opts.contextFile;
    this.wireFile = opts.wireFile;
    this.state = opts.state;
    this.title = opts.title ?? "Untitled";
    this.updatedAt = opts.updatedAt ?? 0;
  }

  get dir(): string {
    return join(this.sessionsDir, this.id);
  }

  get subagentsDir(): string {
    return join(this.dir, "subagents");
  }

  async isEmpty(): Promise<boolean> {
    if (this.state.custom_title) return false;

    const contextBunFile = Bun.file(this.contextFile);
    if (!(await contextBunFile.exists())) return true;

    try {
      const text = await contextBunFile.text();
      for (const line of text.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const parsed = JSON.parse(trimmed);
          if (typeof parsed.role === "string" && !parsed.role.startsWith("_")) {
            return false;
          }
        } catch {
          continue;
        }
      }
    } catch {
      return false;
    }
    return true;
  }

  async saveState(): Promise<void> {
    await Bun.$`mkdir -p ${this.dir}`.quiet();
    await saveSessionState(this.state, this.dir);
  }

  async delete(): Promise<void> {
    const sessionDir = join(this.sessionsDir, this.id);
    const file = Bun.file(sessionDir);
    if (await file.exists()) {
      await Bun.$`rm -rf ${sessionDir}`.quiet();
    }
  }

  async refresh(): Promise<void> {
    this.title = "Untitled";
    const contextBunFile = Bun.file(this.contextFile);
    if (await contextBunFile.exists()) {
      const stat = await Bun.$`stat -f %m ${this.contextFile} 2>/dev/null || stat -c %Y ${this.contextFile} 2>/dev/null`.quiet().text();
      this.updatedAt = Number.parseFloat(stat.trim()) || 0;
    } else {
      this.updatedAt = 0;
    }

    if (this.state.custom_title) {
      this.title = this.state.custom_title;
      return;
    }

    // Try to derive title from wire file first turn
    const wireBunFile = Bun.file(this.wireFile);
    if (await wireBunFile.exists()) {
      try {
        const text = await wireBunFile.text();
        for (const line of text.split("\n")) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            const record = JSON.parse(trimmed);
            if (record.type === "turn_begin" && record.user_input) {
              const raw = typeof record.user_input === "string"
                ? record.user_input
                : JSON.stringify(record.user_input);
              this.title = raw.slice(0, 50);
              return;
            }
          } catch {
            continue;
          }
        }
      } catch {
        // ignore
      }
    }
  }

  // ── Static factories ───────────────────────────────

  static async create(workDir: string, sessionId?: string): Promise<Session> {
    workDir = resolve(workDir);
    const sessionsDir = getSessionsBaseDir(workDir);
    const id = sessionId ?? randomUUID();
    const sessionDir = join(sessionsDir, id);
    await Bun.$`mkdir -p ${sessionDir}`.quiet();

    const contextFile = join(sessionDir, "context.jsonl");
    // Truncate if exists
    await Bun.write(contextFile, "");

    const session = new Session({
      id,
      workDir,
      sessionsDir,
      contextFile,
      wireFile: join(sessionDir, "wire.jsonl"),
      state: SessionState.parse({}),
    });
    await session.refresh();
    return session;
  }

  static async find(workDir: string, sessionId: string): Promise<Session | null> {
    workDir = resolve(workDir);
    const sessionsDir = getSessionsBaseDir(workDir);
    const sessionDir = join(sessionsDir, sessionId);

    const dirFile = Bun.file(join(sessionDir, "context.jsonl"));
    if (!(await dirFile.exists())) return null;

    const state = await loadSessionState(sessionDir);
    const session = new Session({
      id: sessionId,
      workDir,
      sessionsDir,
      contextFile: join(sessionDir, "context.jsonl"),
      wireFile: join(sessionDir, "wire.jsonl"),
      state,
    });
    await session.refresh();
    return session;
  }

  static async list(workDir: string): Promise<Session[]> {
    workDir = resolve(workDir);
    const sessionsDir = getSessionsBaseDir(workDir);

    const dirFile = Bun.file(sessionsDir);
    if (!(await dirFile.exists())) return [];

    let entries: string[];
    try {
      const output = await Bun.$`ls ${sessionsDir}`.quiet().text();
      entries = output.trim().split("\n").filter(Boolean);
    } catch {
      return [];
    }

    const sessions: Session[] = [];
    for (const entry of entries) {
      const sessionDir = join(sessionsDir, entry);
      const contextFile = join(sessionDir, "context.jsonl");
      const ctxFile = Bun.file(contextFile);
      if (!(await ctxFile.exists())) continue;

      const state = await loadSessionState(sessionDir);
      const session = new Session({
        id: entry,
        workDir,
        sessionsDir,
        contextFile,
        wireFile: join(sessionDir, "wire.jsonl"),
        state,
      });

      if (await session.isEmpty()) continue;
      await session.refresh();
      sessions.push(session);
    }

    sessions.sort((a, b) => b.updatedAt - a.updatedAt);
    return sessions;
  }
}
