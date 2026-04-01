/**
 * CLI export command — corresponds to Python cli/export.py
 * Exports a session as a ZIP archive.
 */

import { Command } from "commander";
import { join, resolve } from "node:path";
import { readdirSync, statSync, readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";

function findSessionById(sessionId: string): string | null {
  const { getShareDir } = require("../config.ts");
  const sessionsRoot = join(getShareDir(), "sessions");
  if (!existsSync(sessionsRoot)) return null;

  try {
    for (const workDirHash of readdirSync(sessionsRoot)) {
      const workDirHashDir = join(sessionsRoot, workDirHash);
      try {
        if (!statSync(workDirHashDir).isDirectory()) continue;
      } catch {
        continue;
      }
      const candidate = join(workDirHashDir, sessionId);
      try {
        if (statSync(candidate).isDirectory()) return candidate;
      } catch {
        continue;
      }
    }
  } catch {
    // ignore
  }
  return null;
}

export const exportCommand = new Command("export")
  .description("Export a session as a ZIP archive.")
  .argument("<session-id>", "Session ID to export.")
  .option("-o, --output <path>", "Output ZIP file path. Default: session-{id}.zip in current directory.")
  .action(async (sessionId: string, options: { output?: string }) => {
    const sessionDir = findSessionById(sessionId);
    if (!sessionDir) {
      console.error(`Error: session '${sessionId}' not found.`);
      process.exit(1);
    }

    // Collect files
    let files: string[];
    try {
      files = readdirSync(sessionDir)
        .filter((f) => {
          try {
            return statSync(join(sessionDir, f)).isFile();
          } catch {
            return false;
          }
        })
        .sort();
    } catch {
      files = [];
    }

    if (files.length === 0) {
      console.error(`Error: session '${sessionId}' has no files.`);
      process.exit(1);
    }

    // Determine output path
    const outputPath = options.output
      ? resolve(options.output)
      : resolve(process.cwd(), `session-${sessionId}.zip`);

    // Use Bun's built-in zip capabilities or fall back to shell
    try {
      const outputDir = outputPath.substring(0, outputPath.lastIndexOf("/"));
      mkdirSync(outputDir, { recursive: true });

      // Use shell zip command
      const fileArgs = files.map((f) => join(sessionDir, f));
      await Bun.$`zip -j ${outputPath} ${fileArgs}`.quiet();
      console.log(outputPath);
    } catch (err) {
      console.error(`Error creating ZIP: ${err}`);
      process.exit(1);
    }
  });
