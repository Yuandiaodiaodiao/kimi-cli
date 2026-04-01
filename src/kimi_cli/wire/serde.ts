/**
 * Wire serialization/deserialization — corresponds to Python's wire/serde.py
 */

import {
  type WireMessageEnvelope,
  WireMessageEnvelopeSchema,
  fromEnvelope,
  toEnvelope,
} from "./types";

/**
 * Serialize a wire message to a JSON-friendly object.
 * @param typeName The wire type name (e.g. "TurnBegin", "StatusUpdate")
 * @param payload  The message payload as a plain object
 */
export function serializeWireMessage(
  typeName: string,
  payload: Record<string, unknown>
): Record<string, unknown> {
  return toEnvelope(typeName, payload) as Record<string, unknown>;
}

/**
 * Deserialize a JSON object into a validated wire message.
 * @param data Raw JSON object with `type` and `payload` fields
 * @returns The type name and parsed message
 * @throws if the type is unknown or the payload is invalid
 */
export function deserializeWireMessage(data: unknown): {
  typeName: string;
  message: unknown;
} {
  const envelope = WireMessageEnvelopeSchema.parse(data);
  return fromEnvelope(envelope);
}

/**
 * Serialize a wire message to a JSON string.
 */
export function serializeWireMessageToJSON(
  typeName: string,
  payload: Record<string, unknown>
): string {
  return JSON.stringify(serializeWireMessage(typeName, payload));
}

/**
 * Deserialize a JSON string into a validated wire message.
 */
export function deserializeWireMessageFromJSON(json: string): {
  typeName: string;
  message: unknown;
} {
  const data = JSON.parse(json);
  return deserializeWireMessage(data);
}
