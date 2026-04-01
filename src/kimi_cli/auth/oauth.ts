/**
 * OAuth module — corresponds to Python auth/oauth.py
 * Device-code OAuth flow, token storage & refresh for Kimi Code.
 */

import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { hostname, platform, arch } from "node:os";
import { getShareDir } from "../config.ts";
import type { OAuthRef } from "../config.ts";
import { logger } from "../utils/logging.ts";

// ── Constants ───────────────────────────────────────────

const KIMI_CODE_CLIENT_ID = "17e5f671-d194-4dfb-9706-5516cb48c098";
export const KIMI_CODE_OAUTH_KEY = "oauth/kimi-code";
const DEFAULT_OAUTH_HOST = "https://auth.kimi.com";
const KEYRING_SERVICE = "kimi-code";
export const REFRESH_INTERVAL_SECONDS = 60;
export const REFRESH_THRESHOLD_SECONDS = 300;

// ── Errors ──────────────────────────────────────────────

export class OAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OAuthError";
  }
}

export class OAuthUnauthorized extends OAuthError {
  constructor(message = "OAuth credentials rejected.") {
    super(message);
    this.name = "OAuthUnauthorized";
  }
}

export class OAuthDeviceExpired extends OAuthError {
  constructor(message = "Device authorization expired.") {
    super(message);
    this.name = "OAuthDeviceExpired";
  }
}

// ── Token types ─────────────────────────────────────────

export type OAuthEventKind = "info" | "error" | "waiting" | "verification_url" | "success";

export interface OAuthEvent {
  type: OAuthEventKind;
  message: string;
  data?: Record<string, unknown>;
}

export interface OAuthToken {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  scope: string;
  token_type: string;
}

export interface DeviceAuthorization {
  user_code: string;
  device_code: string;
  verification_uri: string;
  verification_uri_complete: string;
  expires_in: number | null;
  interval: number;
}

// ── Helpers ─────────────────────────────────────────────

function oauthHost(): string {
  return process.env.KIMI_CODE_OAUTH_HOST ?? process.env.KIMI_OAUTH_HOST ?? DEFAULT_OAUTH_HOST;
}

function credentialsDir(): string {
  const dir = join(getShareDir(), "credentials");
  return dir;
}

function credentialsPath(key: string): string {
  const name = key.replace(/^oauth\//, "").split("/").pop() ?? key;
  return join(credentialsDir(), `${name}.json`);
}

function deviceIdPath(): string {
  return join(getShareDir(), "device_id");
}

export async function getDeviceId(): Promise<string> {
  const path = deviceIdPath();
  const file = Bun.file(path);
  if (await file.exists()) {
    return (await file.text()).trim();
  }
  const deviceId = randomUUID().replace(/-/g, "");
  await Bun.$`mkdir -p ${getShareDir()}`.quiet();
  await Bun.write(path, deviceId);
  return deviceId;
}

function deviceModel(): string {
  const sys = platform();
  const a = arch();
  if (sys === "darwin") return `macOS ${a}`;
  if (sys === "win32") return `Windows ${a}`;
  if (sys === "linux") return `Linux ${a}`;
  return `${sys} ${a}`;
}

export async function commonHeaders(): Promise<Record<string, string>> {
  return {
    "X-Msh-Platform": "kimi_cli",
    "X-Msh-Version": "2.0.0",
    "X-Msh-Device-Name": hostname(),
    "X-Msh-Device-Model": deviceModel(),
    "X-Msh-Device-Id": await getDeviceId(),
  };
}

// ── Token persistence (file-based) ─────────────────────

export async function loadTokens(ref: OAuthRef): Promise<OAuthToken | null> {
  const path = credentialsPath(ref.key);
  const file = Bun.file(path);
  if (!(await file.exists())) return null;
  try {
    return (await file.json()) as OAuthToken;
  } catch {
    return null;
  }
}

export async function saveTokens(ref: OAuthRef, token: OAuthToken): Promise<OAuthRef> {
  const path = credentialsPath(ref.key);
  await Bun.$`mkdir -p ${credentialsDir()}`.quiet();
  await Bun.write(path, JSON.stringify(token));
  return { storage: "file", key: ref.key };
}

export async function deleteTokens(ref: OAuthRef): Promise<void> {
  const path = credentialsPath(ref.key);
  const file = Bun.file(path);
  if (await file.exists()) {
    await Bun.$`rm -f ${path}`.quiet();
  }
}

// ── Device authorization flow ───────────────────────────

export async function requestDeviceAuthorization(): Promise<DeviceAuthorization> {
  const host = oauthHost().replace(/\/+$/, "");
  const headers = await commonHeaders();
  const res = await fetch(`${host}/api/oauth/device_authorization`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: KIMI_CODE_CLIENT_ID }),
  });
  const data = (await res.json()) as Record<string, unknown>;
  if (res.status !== 200) throw new OAuthError(`Device authorization failed: ${JSON.stringify(data)}`);
  return {
    user_code: String(data.user_code),
    device_code: String(data.device_code),
    verification_uri: String(data.verification_uri ?? ""),
    verification_uri_complete: String(data.verification_uri_complete),
    expires_in: data.expires_in ? Number(data.expires_in) : null,
    interval: Number(data.interval ?? 5),
  };
}

export async function refreshToken(refreshTokenValue: string): Promise<OAuthToken> {
  const host = oauthHost().replace(/\/+$/, "");
  const headers = await commonHeaders();
  const res = await fetch(`${host}/api/oauth/token`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: KIMI_CODE_CLIENT_ID,
      grant_type: "refresh_token",
      refresh_token: refreshTokenValue,
    }),
  });
  const data = (await res.json()) as Record<string, unknown>;
  if (res.status === 401 || res.status === 403) {
    throw new OAuthUnauthorized((data.error_description as string) ?? "Token refresh unauthorized.");
  }
  if (res.status !== 200) {
    throw new OAuthError((data.error_description as string) ?? "Token refresh failed.");
  }
  return {
    access_token: String(data.access_token),
    refresh_token: String(data.refresh_token),
    expires_at: Date.now() / 1000 + Number(data.expires_in),
    scope: String(data.scope),
    token_type: String(data.token_type),
  };
}

// ── OAuthManager ────────────────────────────────────────

export class OAuthManager {
  private config: { providers: Record<string, { api_key: string; oauth?: OAuthRef }> };
  private accessTokens = new Map<string, string>();

  constructor(config: { providers: Record<string, { api_key: string; oauth?: OAuthRef }> }) {
    this.config = config;
  }

  async initialize(): Promise<void> {
    for (const provider of Object.values(this.config.providers)) {
      if (provider.oauth) {
        const token = await loadTokens(provider.oauth);
        if (token) this.accessTokens.set(provider.oauth.key, token.access_token);
      }
    }
  }

  async resolveApiKey(apiKey: string, oauth?: OAuthRef): Promise<string> {
    if (oauth) {
      const cached = this.accessTokens.get(oauth.key);
      if (cached) return cached;
      const persisted = await loadTokens(oauth);
      if (persisted) {
        this.accessTokens.set(oauth.key, persisted.access_token);
        return persisted.access_token;
      }
      logger.warn(`OAuth ref present (key=${oauth.key}) but no access token; falling back to api_key`);
    }
    return apiKey;
  }

  async ensureFresh(): Promise<void> {
    for (const provider of Object.values(this.config.providers)) {
      if (!provider.oauth) continue;
      const token = await loadTokens(provider.oauth);
      if (!token || !token.refresh_token) continue;

      this.accessTokens.set(provider.oauth.key, token.access_token);

      const now = Date.now() / 1000;
      if (token.expires_at && token.expires_at > now && token.expires_at - now >= REFRESH_THRESHOLD_SECONDS) {
        continue;
      }
      try {
        const refreshed = await refreshToken(token.refresh_token);
        await saveTokens(provider.oauth, refreshed);
        this.accessTokens.set(provider.oauth.key, refreshed.access_token);
      } catch (err) {
        if (err instanceof OAuthUnauthorized) {
          this.accessTokens.delete(provider.oauth.key);
          await deleteTokens(provider.oauth);
        } else {
          logger.warn("Failed to refresh OAuth token", err);
        }
      }
    }
  }
}
