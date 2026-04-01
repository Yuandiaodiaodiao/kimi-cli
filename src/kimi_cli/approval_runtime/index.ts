/**
 * Approval runtime — corresponds to Python approval_runtime/
 * Manages approval requests lifecycle: create, wait, resolve, cancel.
 */

import { randomUUID } from "node:crypto";
import { logger } from "../utils/logging.ts";

// ── Types ───────────────────────────────────────────────

export type ApprovalResponseKind = "approve" | "approve_for_session" | "reject";
export type ApprovalSourceKind = "foreground_turn" | "background_agent";
export type ApprovalStatus = "pending" | "resolved" | "cancelled";
export type ApprovalRuntimeEventKind = "request_created" | "request_resolved";

export interface ApprovalSource {
  kind: ApprovalSourceKind;
  id: string;
  agentId?: string;
  subagentType?: string;
}

export interface ApprovalRequestRecord {
  id: string;
  toolCallId: string;
  sender: string;
  action: string;
  description: string;
  display: unknown[];
  source: ApprovalSource;
  createdAt: number;
  status: ApprovalStatus;
  resolvedAt: number | null;
  response: ApprovalResponseKind | null;
  feedback: string;
}

export interface ApprovalRuntimeEvent {
  kind: ApprovalRuntimeEventKind;
  request: ApprovalRequestRecord;
}

// ── Errors ──────────────────────────────────────────────

export class ApprovalCancelledError extends Error {
  constructor(requestId: string) {
    super(`Approval cancelled: ${requestId}`);
    this.name = "ApprovalCancelledError";
  }
}

// ── Waiter (promise-based future) ───────────────────────

interface Waiter {
  resolve: (value: [ApprovalResponseKind, string]) => void;
  reject: (reason: Error) => void;
  promise: Promise<[ApprovalResponseKind, string]>;
}

function createWaiter(): Waiter {
  let resolve!: Waiter["resolve"];
  let reject!: Waiter["reject"];
  const promise = new Promise<[ApprovalResponseKind, string]>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { resolve, reject, promise };
}

// ── Runtime ─────────────────────────────────────────────

export type EventSubscriber = (event: ApprovalRuntimeEvent) => void;

export class ApprovalRuntime {
  private requests = new Map<string, ApprovalRequestRecord>();
  private waiters = new Map<string, Waiter>();
  private subscribers = new Map<string, EventSubscriber>();

  createRequest(opts: {
    requestId?: string;
    toolCallId: string;
    sender: string;
    action: string;
    description: string;
    display?: unknown[];
    source: ApprovalSource;
  }): ApprovalRequestRecord {
    const request: ApprovalRequestRecord = {
      id: opts.requestId ?? randomUUID(),
      toolCallId: opts.toolCallId,
      sender: opts.sender,
      action: opts.action,
      description: opts.description,
      display: opts.display ?? [],
      source: opts.source,
      createdAt: Date.now() / 1000,
      status: "pending",
      resolvedAt: null,
      response: null,
      feedback: "",
    };
    this.requests.set(request.id, request);
    this.publishEvent({ kind: "request_created", request });
    return request;
  }

  async waitForResponse(requestId: string): Promise<[ApprovalResponseKind, string]> {
    const request = this.requests.get(requestId);
    if (!request) throw new Error(`Approval request not found: ${requestId}`);

    if (request.status === "cancelled") {
      throw new ApprovalCancelledError(requestId);
    }
    if (request.status === "resolved" && request.response) {
      return [request.response, request.feedback];
    }

    let waiter = this.waiters.get(requestId);
    if (!waiter) {
      waiter = createWaiter();
      this.waiters.set(requestId, waiter);
    }
    return waiter.promise;
  }

  resolve(requestId: string, response: ApprovalResponseKind, feedback = ""): boolean {
    const request = this.requests.get(requestId);
    if (!request || request.status !== "pending") return false;

    request.status = "resolved";
    request.response = response;
    request.feedback = feedback;
    request.resolvedAt = Date.now() / 1000;

    const waiter = this.waiters.get(requestId);
    if (waiter) {
      waiter.resolve([response, feedback]);
      this.waiters.delete(requestId);
    }
    this.publishEvent({ kind: "request_resolved", request });
    return true;
  }

  cancelBySource(sourceKind: ApprovalSourceKind, sourceId: string): number {
    let cancelled = 0;
    for (const [requestId, request] of this.requests) {
      if (request.status !== "pending") continue;
      if (request.source.kind !== sourceKind || request.source.id !== sourceId) continue;

      request.status = "cancelled";
      request.response = "reject";
      request.resolvedAt = Date.now() / 1000;

      const waiter = this.waiters.get(requestId);
      if (waiter) {
        waiter.reject(new ApprovalCancelledError(requestId));
        this.waiters.delete(requestId);
      }
      this.publishEvent({ kind: "request_resolved", request });
      cancelled++;
    }
    return cancelled;
  }

  listPending(): ApprovalRequestRecord[] {
    return [...this.requests.values()]
      .filter((r) => r.status === "pending")
      .sort((a, b) => a.createdAt - b.createdAt);
  }

  getRequest(requestId: string): ApprovalRequestRecord | undefined {
    return this.requests.get(requestId);
  }

  subscribe(callback: EventSubscriber): string {
    const token = randomUUID();
    this.subscribers.set(token, callback);
    return token;
  }

  unsubscribe(token: string): void {
    this.subscribers.delete(token);
  }

  private publishEvent(event: ApprovalRuntimeEvent): void {
    for (const cb of this.subscribers.values()) {
      try {
        cb(event);
      } catch (err) {
        logger.error("Approval runtime event subscriber failed", err);
      }
    }
  }
}
