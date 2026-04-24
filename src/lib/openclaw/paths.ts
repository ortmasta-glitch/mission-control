/**
 * Self-discovering path resolution for OpenClaw.
 *
 * OPENCLAW_HOME priority:
 *   1. OPENCLAW_HOME env var
 *   2. OPENCLAW_STATE_DIR env var (alias)
 *   3. $HOME/.openclaw
 *
 * Binary path priority:
 *   1. OPENCLAW_BIN env var
 *   2. `which openclaw`
 *   3. Common install locations
 */

import { execFile } from "child_process";
import { promisify } from "util";
import { join } from "path";
import { access } from "fs/promises";
import { homedir } from "os";

const exec = promisify(execFile);

// ── OpenClaw home directory ──────────────────────

let _home: string | null = null;

export function getOpenClawHome(): string {
  if (_home) return _home;
  const explicit = process.env.OPENCLAW_HOME || process.env.OPENCLAW_STATE_DIR;
  if (explicit) {
    _home = explicit.endsWith(".openclaw") ? explicit : join(explicit, ".openclaw");
  } else {
    _home = join(homedir(), ".openclaw");
  }
  return _home;
}

/**
 * Returns the path to openclaw.json config file.
 * Canonical location: $OPENCLAW_HOME/openclaw.json
 */
let _configPath: string | null = null;
export function getConfigPath(): string {
  if (_configPath) return _configPath;
  _configPath = join(getOpenClawHome(), "openclaw.json");
  return _configPath;
}

/**
 * Read the openclaw.json config file.
 */
export async function readConfigFile(): Promise<Record<string, unknown>> {
  const { readFile } = await import("fs/promises");
  const configPath = join(getOpenClawHome(), "openclaw.json");
  try {
    return JSON.parse(await readFile(configPath, "utf-8"));
  } catch {
    return {};
  }
}

// ── Default workspace directory ──────────────────

let _workspace: string | null = null;

/**
 * Resolve the default agent workspace path.
 * Priority:
 *   1. OPENCLAW_WORKSPACE env var
 *   2. agents.defaults.workspace from openclaw.json
 *   3. $OPENCLAW_HOME/workspace
 */
export async function getDefaultWorkspace(): Promise<string> {
  if (_workspace) return _workspace;

  if (process.env.OPENCLAW_WORKSPACE) {
    _workspace = process.env.OPENCLAW_WORKSPACE;
    return _workspace;
  }

  try {
    const { readFile } = await import("fs/promises");
    const configPath = join(getOpenClawHome(), "openclaw.json");
    const raw = await readFile(configPath, "utf-8");
    const config = JSON.parse(raw);
    const ws = config?.agents?.defaults?.workspace;
    if (ws && typeof ws === "string") {
      _workspace = ws;
      return _workspace;
    }
  } catch {
    // Config doesn't exist or is invalid — fall through
  }

  _workspace = join(getOpenClawHome(), "workspace");
  return _workspace;
}

/** Synchronous accessor — uses cached value or falls back to convention. */
export function getDefaultWorkspaceSync(): string {
  return (
    _workspace ||
    process.env.OPENCLAW_WORKSPACE ||
    join(getOpenClawHome(), "workspace")
  );
}

// ── OpenClaw binary path ─────────────────────────

let _bin: string | null = null;
let _binDone = false;

const BIN_CANDIDATES = [
  "/opt/homebrew/bin/openclaw",
  "/usr/local/bin/openclaw",
  "/usr/bin/openclaw",
  join(homedir(), ".local/bin/openclaw"),
  join(homedir(), ".npm-global/bin/openclaw"),
];

async function fileExists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

export async function getOpenClawBin(): Promise<string> {
  if (_binDone && _bin) return _bin;

  if (process.env.OPENCLAW_BIN) {
    _bin = process.env.OPENCLAW_BIN;
    _binDone = true;
    return _bin;
  }

  try {
    const { stdout } = await exec("which", ["openclaw"], { timeout: 3000 });
    const resolved = stdout.trim();
    if (resolved) {
      _bin = resolved;
      _binDone = true;
      return _bin;
    }
  } catch {
    // continue
  }

  for (const c of BIN_CANDIDATES) {
    if (await fileExists(c)) {
      _bin = c;
      _binDone = true;
      return _bin;
    }
  }

  _bin = "openclaw";
  _binDone = true;
  return _bin;
}

/** Synchronous accessor — uses cached value or env. */
export function getOpenClawBinSync(): string {
  return _bin || process.env.OPENCLAW_BIN || "openclaw";
}

// ── Gateway URL ─────────────────────────────────

let _gatewayUrl: string | null = null;

/**
 * Resolve the gateway URL.
 * Priority:
 *   1. OPENCLAW_GATEWAY_URL env var
 *   2. gateway.port from openclaw.json → http://127.0.0.1:{port}
 *   3. http://127.0.0.1:18789
 */
export async function getGatewayUrl(): Promise<string> {
  if (_gatewayUrl) return _gatewayUrl;

  if (process.env.OPENCLAW_GATEWAY_URL) {
    _gatewayUrl = process.env.OPENCLAW_GATEWAY_URL;
    return _gatewayUrl;
  }

  try {
    const { readFile } = await import("fs/promises");
    const configPath = join(getOpenClawHome(), "openclaw.json");
    const raw = await readFile(configPath, "utf-8");
    const config = JSON.parse(raw);
    const port = config?.gateway?.port;
    if (port && typeof port === "number") {
      _gatewayUrl = `http://127.0.0.1:${port}`;
      return _gatewayUrl;
    }
  } catch {
    // Config doesn't exist or is invalid — fall through
  }

  _gatewayUrl = "http://127.0.0.1:18789";
  return _gatewayUrl;
}

/** Extract the port number from the resolved gateway URL. */
export async function getGatewayPort(): Promise<number> {
  const url = await getGatewayUrl();
  try {
    const parsed = new URL(url);
    const port = parseInt(parsed.port, 10);
    return isNaN(port) ? 18789 : port;
  } catch {
    return 18789;
  }
}

// ── Gateway auth token ──────────────────────────

let _gatewayToken: string | null = null;

/**
 * Resolve the Gateway auth token for HTTP transport.
 * Used by HttpTransport for Authorization: Bearer headers.
 *
 * Priority: env var → openclaw.json gateway.auth.token → empty string.
 */
export function getGatewayToken(): string {
  if (_gatewayToken !== null) return _gatewayToken;

  if (process.env.OPENCLAW_GATEWAY_TOKEN) {
    _gatewayToken = process.env.OPENCLAW_GATEWAY_TOKEN;
    return _gatewayToken;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { readFileSync } = require("fs") as typeof import("fs");
    const configPath = join(getOpenClawHome(), "openclaw.json");
    const raw = readFileSync(configPath, "utf-8");
    const config = JSON.parse(raw);
    const token = config?.gateway?.auth?.token;
    if (token && typeof token === "string") {
      _gatewayToken = token;
      return _gatewayToken;
    }
  } catch {
    // Config doesn't exist or is invalid — fall through
  }

  _gatewayToken = "";
  return _gatewayToken;
}