/**
 * Notification manager — corresponds to Python notifications/
 * Basic notification send/receive and store.
 */

import { randomUUID } from "node:crypto";

// ── Types ───────────────────────────────────────────────

export type NotificationSeverity = "info" | "warning" | "error";
export type NotificationCategory = "tool" | "system" | "background" | "agent";
export type NotificationDeliveryStatus = "pending" | "delivered" | "claimed" | "expired";

export interface NotificationEvent {
  id: string;
  severity: NotificationSeverity;
  category: NotificationCategory;
  title: string;
  body: string;
  createdAt: number;
  sourceId?: string;
}

export interface NotificationView extends NotificationEvent {
  deliveryStatus: NotificationDeliveryStatus;
  deliveredAt?: number;
  claimedAt?: number;
}

// ── Store ───────────────────────────────────────────────

export class NotificationStore {
  private notifications = new Map<string, NotificationView>();

  add(event: NotificationEvent): NotificationView {
    const view: NotificationView = {
      ...event,
      deliveryStatus: "pending",
    };
    this.notifications.set(event.id, view);
    return view;
  }

  get(id: string): NotificationView | undefined {
    return this.notifications.get(id);
  }

  markDelivered(id: string): void {
    const n = this.notifications.get(id);
    if (n) {
      n.deliveryStatus = "delivered";
      n.deliveredAt = Date.now() / 1000;
    }
  }

  markClaimed(id: string): void {
    const n = this.notifications.get(id);
    if (n) {
      n.deliveryStatus = "claimed";
      n.claimedAt = Date.now() / 1000;
    }
  }

  listPending(): NotificationView[] {
    return [...this.notifications.values()].filter((n) => n.deliveryStatus === "pending");
  }

  listAll(): NotificationView[] {
    return [...this.notifications.values()].sort((a, b) => b.createdAt - a.createdAt);
  }
}

// ── Manager ─────────────────────────────────────────────

export type NotificationSink = (event: NotificationEvent) => void;

export class NotificationManager {
  private store = new NotificationStore();
  private sinks: NotificationSink[] = [];
  private claimStaleAfterMs: number;

  constructor(opts?: { claimStaleAfterMs?: number }) {
    this.claimStaleAfterMs = opts?.claimStaleAfterMs ?? 15_000;
  }

  addSink(sink: NotificationSink): void {
    this.sinks.push(sink);
  }

  notify(opts: {
    severity: NotificationSeverity;
    category: NotificationCategory;
    title: string;
    body: string;
    sourceId?: string;
  }): NotificationView {
    const event: NotificationEvent = {
      id: randomUUID(),
      severity: opts.severity,
      category: opts.category,
      title: opts.title,
      body: opts.body,
      createdAt: Date.now() / 1000,
      sourceId: opts.sourceId,
    };

    const view = this.store.add(event);

    for (const sink of this.sinks) {
      try {
        sink(event);
      } catch {
        // ignore
      }
    }

    return view;
  }

  claim(id: string): NotificationView | undefined {
    const view = this.store.get(id);
    if (view && view.deliveryStatus === "delivered") {
      this.store.markClaimed(id);
    }
    return view;
  }

  deliverPending(): NotificationView[] {
    const pending = this.store.listPending();
    for (const n of pending) {
      this.store.markDelivered(n.id);
    }
    return pending;
  }

  getStore(): NotificationStore {
    return this.store;
  }
}
