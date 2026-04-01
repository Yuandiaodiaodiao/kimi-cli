/**
 * YOLO mode dynamic injection — corresponds to Python soul/dynamic_injections/yolo_mode.py
 */

export const YOLO_MODE_REMINDER = `<system-reminder>
YOLO mode is active. All tool calls are auto-approved. Proceed without asking for confirmation.
</system-reminder>`;

export function getYoloModeInjection(active: boolean): string | null {
  return active ? YOLO_MODE_REMINDER : null;
}
