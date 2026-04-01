/**
 * Wire file — JSONL-based message log.
 * Corresponds to Python's wire/file.py
 */

import { z } from "zod/v4";
import {
  WIRE_PROTOCOL_LEGACY_VERSION,
  WIRE_PROTOCOL_VERSION,
} from "./protocol";
import {
  type WireMessageEnvelope,
  WireMessageEnvelopeSchema,
  fromEnvelope,
} from "./types";

// ── Record Types ───────────────────────────────────────────

export const WireFileMetadata = z.object({
  type: z.literal("metadata"),
  protocol_version: z.string(),
});
export type WireFileMetadata = z.infer<typeof WireFileMetadata>;

export const WireMessageRecord = z.object({
  timestamp: z.number(),
  message: WireMessageEnvelopeSchema,
});
export type WireMessageRecord = z.infer<typeof WireMessageRecord>;

// ── Parsing helpers ────────────────────────────────────────

/**
 * Parse a wire file metadata line; returns null if not metadata.
 */
export function parseWireFileMetadata(line: string): WireFileMetadata | null {
  try {
    const data = JSON.parse(line);
    const result = WireFileMetadata.safeParse(data);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

/**
 * Parse a wire file line into metadata or a message record.
 */
export function parseWireFileLine(
  line: string
): WireFileMetadata | WireMessageRecord {
  const metadata = parseWireFileMetadata(line);
  if (metadata !== null) return metadata;
  return WireMessageRecord.parse(JSON.parse(line));
}

// ── WireFile class ─────────────────────────────────────────

export class WireFile {
  readonly path: string;
  protocolVersion: string;

  constructor(path: string) {
    this.path = path;
    this.protocolVersion = WIRE_PROTOCOL_VERSION;
    this._initVersion();
  }

  private _initVersion(): void {
    const file = Bun.file(this.path);
    // Sync check — only at construction time
    // Bun.file().size is 0 for non-existent files
    try {
      // We cannot do sync reads easily with Bun.file, so we default
      // to current version and update lazily on first read.
    } catch {
      this.protocolVersion = WIRE_PROTOCOL_VERSION;
    }
  }

  get version(): string {
    return this.protocolVersion;
  }

  /**
   * Check if the wire file is empty (no message records).
   */
  async isEmpty(): Promise<boolean> {
    const file = Bun.file(this.path);
    if ((await file.exists()) === false) return true;

    const text = await file.text();
    const lines = text.split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      if (parseWireFileMetadata(trimmed) !== null) continue;
      return false;
    }
    return true;
  }

  /**
   * Iterate over all message records in the file.
   */
  async *iterRecords(): AsyncGenerator<WireMessageRecord> {
    const file = Bun.file(this.path);
    if ((await file.exists()) === false) return;

    const text = await file.text();
    const lines = text.split("\n");

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const parsed = parseWireFileLine(trimmed);
        if ("type" in parsed && parsed.type === "metadata") {
          // Update protocol version from file
          this.protocolVersion = (parsed as WireFileMetadata).protocol_version;
          continue;
        }
        yield parsed as WireMessageRecord;
      } catch (err) {
        console.error(`Failed to parse line in wire file ${this.path}:`, err);
        continue;
      }
    }
  }

  /**
   * Append a message to the wire file.
   */
  async appendMessage(
    typeName: string,
    payload: Record<string, unknown>,
    timestamp?: number
  ): Promise<void> {
    const record: WireMessageRecord = {
      timestamp: timestamp ?? Date.now() / 1000,
      message: { type: typeName, payload },
    };
    await this.appendRecord(record);
  }

  /**
   * Append a raw record to the wire file.
   */
  async appendRecord(record: WireMessageRecord): Promise<void> {
    const file = Bun.file(this.path);
    const exists = await file.exists();
    const needsHeader = !exists || file.size === 0;

    let content = "";
    if (needsHeader) {
      const metadata: WireFileMetadata = {
        type: "metadata",
        protocol_version: this.protocolVersion,
      };
      content += JSON.stringify(metadata) + "\n";
    }
    content += JSON.stringify(record) + "\n";

    // Bun.write with append
    const writer = Bun.file(this.path).writer();
    writer.write(content);
    await writer.flush();
    writer.end();
  }

  toString(): string {
    return this.path;
  }
}
