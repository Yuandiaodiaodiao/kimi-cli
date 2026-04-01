/**
 * Hook engine — corresponds to Python hooks/engine.py
 * Runs matching hooks (shell commands) in parallel on lifecycle events.
 */

import type { HookDef, HookEventType } from "../config.ts";
import { logger } from "../utils/logging.ts";

// ── Types ───────────────────────────────────────────────

export interface HookResult {
  action: "allow" | "block";
  reason: string;
  timedOut?: boolean;
}

export interface WireHookSubscription {
  id: string;
  event: string;
  matcher: string;
  timeout: number;
}

export type OnTriggered = (event: string, target: string, hookCount: number) => void;
export type OnResolved = (event: string, target: string, action: string, reason: string, durationMs: number) => void;

// ── Hook runner ─────────────────────────────────────────

async function runHook(
  command: string,
  inputData: Record<string, unknown>,
  opts?: { timeout?: number; cwd?: string },
): Promise<HookResult> {
  const timeout = (opts?.timeout ?? 30) * 1000;
  try {
    const proc = Bun.spawn(["sh", "-c", command], {
      stdin: new Blob([JSON.stringify(inputData)]),
      stdout: "pipe",
      stderr: "pipe",
      cwd: opts?.cwd,
    });

    const timer = setTimeout(() => proc.kill(), timeout);

    const exitCode = await proc.exited;
    clearTimeout(timer);

    if (exitCode === 0) {
      const stdout = await new Response(proc.stdout).text();
      try {
        const parsed = JSON.parse(stdout.trim());
        return {
          action: parsed.action === "block" ? "block" : "allow",
          reason: parsed.reason ?? "",
        };
      } catch {
        return { action: "allow", reason: "" };
      }
    }
    // Non-zero exit → fail open
    return { action: "allow", reason: "" };
  } catch {
    return { action: "allow", reason: "" };
  }
}

// ── Engine ──────────────────────────────────────────────

export class HookEngine {
  private hooks: HookDef[];
  private wireSubs: WireHookSubscription[] = [];
  private cwd?: string;
  private onTriggered?: OnTriggered;
  private onResolved?: OnResolved;
  private byEvent = new Map<string, HookDef[]>();
  private wireByEvent = new Map<string, WireHookSubscription[]>();

  constructor(opts?: {
    hooks?: HookDef[];
    cwd?: string;
    onTriggered?: OnTriggered;
    onResolved?: OnResolved;
  }) {
    this.hooks = opts?.hooks ? [...opts.hooks] : [];
    this.cwd = opts?.cwd;
    this.onTriggered = opts?.onTriggered;
    this.onResolved = opts?.onResolved;
    this.rebuildIndex();
  }

  private rebuildIndex(): void {
    this.byEvent.clear();
    for (const h of this.hooks) {
      const list = this.byEvent.get(h.event) ?? [];
      list.push(h);
      this.byEvent.set(h.event, list);
    }
    this.wireByEvent.clear();
    for (const s of this.wireSubs) {
      const list = this.wireByEvent.get(s.event) ?? [];
      list.push(s);
      this.wireByEvent.set(s.event, list);
    }
  }

  addHooks(hooks: HookDef[]): void {
    this.hooks.push(...hooks);
    this.rebuildIndex();
  }

  addWireSubscriptions(subs: WireHookSubscription[]): void {
    this.wireSubs.push(...subs);
    this.rebuildIndex();
  }

  setCallbacks(opts: { onTriggered?: OnTriggered; onResolved?: OnResolved }): void {
    this.onTriggered = opts.onTriggered;
    this.onResolved = opts.onResolved;
  }

  get hasHooks(): boolean {
    return this.hooks.length > 0 || this.wireSubs.length > 0;
  }

  hasHooksFor(event: HookEventType): boolean {
    return (this.byEvent.get(event)?.length ?? 0) > 0 || (this.wireByEvent.get(event)?.length ?? 0) > 0;
  }

  get summary(): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const [event, hooks] of this.byEvent) {
      counts[event] = (counts[event] ?? 0) + hooks.length;
    }
    for (const [event, subs] of this.wireByEvent) {
      counts[event] = (counts[event] ?? 0) + subs.length;
    }
    return counts;
  }

  private matchRegex(pattern: string, value: string): boolean {
    if (!pattern) return true;
    try {
      return new RegExp(pattern).test(value);
    } catch {
      logger.warn(`Invalid regex in hook matcher: ${pattern}`);
      return false;
    }
  }

  async trigger(
    event: HookEventType,
    opts: { matcherValue?: string; inputData: Record<string, unknown> },
  ): Promise<HookResult[]> {
    const matcherValue = opts.matcherValue ?? "";

    // Match server-side hooks
    const seenCommands = new Set<string>();
    const serverMatched: HookDef[] = [];
    for (const h of this.byEvent.get(event) ?? []) {
      if (!this.matchRegex(h.matcher, matcherValue)) continue;
      if (seenCommands.has(h.command)) continue;
      seenCommands.add(h.command);
      serverMatched.push(h);
    }

    const total = serverMatched.length;
    if (total === 0) return [];

    try {
      return await this.executeHooks(event, matcherValue, serverMatched, opts.inputData);
    } catch {
      logger.warn(`Hook engine error for ${event}, failing open`);
      return [];
    }
  }

  private async executeHooks(
    event: string,
    matcherValue: string,
    serverMatched: HookDef[],
    inputData: Record<string, unknown>,
  ): Promise<HookResult[]> {
    const total = serverMatched.length;

    if (this.onTriggered) {
      try {
        this.onTriggered(event, matcherValue, total);
      } catch {
        // ignore
      }
    }

    const t0 = performance.now();
    const tasks = serverMatched.map((h) =>
      runHook(h.command, inputData, { timeout: h.timeout, cwd: this.cwd }),
    );

    const results = await Promise.all(tasks);
    const durationMs = Math.round(performance.now() - t0);

    let action = "allow";
    let reason = "";
    for (const r of results) {
      if (r.action === "block") {
        action = "block";
        reason = r.reason;
        break;
      }
    }

    if (this.onResolved) {
      try {
        this.onResolved(event, matcherValue, action, reason, durationMs);
      } catch {
        // ignore
      }
    }

    return results;
  }
}
