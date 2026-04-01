/**
 * Wire server — stdio mode (reserved interface).
 * Corresponds to Python's wire/server.py
 *
 * This is a placeholder for the Wire server that communicates over stdio
 * using JSON-RPC. The full implementation will be added when the Soul
 * layer is ready.
 */

import { WIRE_PROTOCOL_VERSION } from "./protocol";

export interface WireServerOptions {
  /** Buffer limit for stdin reader (bytes). Default: 100MB */
  stdioBufferLimit?: number;
}

const DEFAULT_STDIO_BUFFER_LIMIT = 100 * 1024 * 1024;

/**
 * Wire server that communicates over stdio using JSON-RPC.
 * Placeholder — full implementation depends on the Soul layer.
 */
export class WireServer {
  private options: Required<WireServerOptions>;

  constructor(options: WireServerOptions = {}) {
    this.options = {
      stdioBufferLimit:
        options.stdioBufferLimit ?? DEFAULT_STDIO_BUFFER_LIMIT,
    };
  }

  get protocolVersion(): string {
    return WIRE_PROTOCOL_VERSION;
  }

  /**
   * Start the Wire server. Reads from stdin, writes to stdout.
   * TODO: implement when Soul layer is available.
   */
  async serve(): Promise<void> {
    throw new Error("WireServer.serve() is not yet implemented");
  }
}
