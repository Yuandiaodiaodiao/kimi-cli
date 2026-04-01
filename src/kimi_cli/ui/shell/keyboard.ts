/**
 * Keyboard handling — corresponds to Python's ui/shell/keyboard.py
 * Uses Ink's useInput hook for keyboard events in the React tree.
 */

import { useInput, useApp } from "ink";
import { useCallback, useRef } from "react";

export type KeyAction =
  | "submit"
  | "interrupt"
  | "escape"
  | "history-prev"
  | "history-next"
  | "tab";

export interface UseKeyboardOptions {
  onAction: (action: KeyAction) => void;
  /** Whether keyboard input is active */
  active?: boolean;
}

/**
 * Hook that handles keyboard shortcuts for the shell.
 * Ctrl+C → interrupt, Escape → escape, Up/Down → history
 */
export function useKeyboard({ onAction, active = true }: UseKeyboardOptions) {
  const { exit } = useApp();
  const ctrlCCount = useRef(0);
  const ctrlCTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useInput(
    (input, key) => {
      // Ctrl+C: interrupt or exit on double-press
      if (input === "c" && key.ctrl) {
        ctrlCCount.current += 1;
        if (ctrlCCount.current >= 2) {
          exit();
          return;
        }
        if (ctrlCTimer.current) clearTimeout(ctrlCTimer.current);
        ctrlCTimer.current = setTimeout(() => {
          ctrlCCount.current = 0;
        }, 500);
        onAction("interrupt");
        return;
      }

      // Reset Ctrl+C count on any other key
      ctrlCCount.current = 0;

      if (key.escape) {
        onAction("escape");
        return;
      }

      if (key.upArrow) {
        onAction("history-prev");
        return;
      }

      if (key.downArrow) {
        onAction("history-next");
        return;
      }

      if (key.tab) {
        onAction("tab");
        return;
      }

      if (key.return) {
        onAction("submit");
        return;
      }
    },
    { isActive: active },
  );
}
