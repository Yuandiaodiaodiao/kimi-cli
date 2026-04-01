/**
 * Tests for utils/logging.ts — logger.
 */
import { test, expect, describe, beforeEach, afterEach, mock } from "bun:test";
import { logger } from "../../src/kimi_cli/utils/logging.ts";

describe("Logger", () => {
  // Save original console methods
  const originalDebug = console.debug;
  const originalInfo = console.info;
  const originalWarn = console.warn;
  const originalError = console.error;

  let debugCalls: string[];
  let infoCalls: string[];
  let warnCalls: string[];
  let errorCalls: string[];

  beforeEach(() => {
    debugCalls = [];
    infoCalls = [];
    warnCalls = [];
    errorCalls = [];

    console.debug = (...args: any[]) => debugCalls.push(args.join(" "));
    console.info = (...args: any[]) => infoCalls.push(args.join(" "));
    console.warn = (...args: any[]) => warnCalls.push(args.join(" "));
    console.error = (...args: any[]) => errorCalls.push(args.join(" "));
  });

  afterEach(() => {
    console.debug = originalDebug;
    console.info = originalInfo;
    console.warn = originalWarn;
    console.error = originalError;
    // Reset to info
    logger.setLevel("info");
  });

  test("info level logs info, warn, error but not debug", () => {
    logger.setLevel("info");
    logger.debug("dbg");
    logger.info("inf");
    logger.warn("wrn");
    logger.error("err");

    expect(debugCalls.length).toBe(0);
    expect(infoCalls.length).toBe(1);
    expect(warnCalls.length).toBe(1);
    expect(errorCalls.length).toBe(1);
  });

  test("debug level logs everything", () => {
    logger.setLevel("debug");
    logger.debug("dbg");
    logger.info("inf");
    logger.warn("wrn");
    logger.error("err");

    expect(debugCalls.length).toBe(1);
    expect(infoCalls.length).toBe(1);
    expect(warnCalls.length).toBe(1);
    expect(errorCalls.length).toBe(1);
  });

  test("error level only logs errors", () => {
    logger.setLevel("error");
    logger.debug("dbg");
    logger.info("inf");
    logger.warn("wrn");
    logger.error("err");

    expect(debugCalls.length).toBe(0);
    expect(infoCalls.length).toBe(0);
    expect(warnCalls.length).toBe(0);
    expect(errorCalls.length).toBe(1);
  });

  test("warn level logs warn and error", () => {
    logger.setLevel("warn");
    logger.debug("dbg");
    logger.info("inf");
    logger.warn("wrn");
    logger.error("err");

    expect(debugCalls.length).toBe(0);
    expect(infoCalls.length).toBe(0);
    expect(warnCalls.length).toBe(1);
    expect(errorCalls.length).toBe(1);
  });

  test("log messages have level prefix", () => {
    logger.setLevel("debug");
    logger.debug("test message");
    expect(debugCalls[0]).toContain("[DEBUG]");

    logger.info("test message");
    expect(infoCalls[0]).toContain("[INFO]");
  });
});
