/**
 * Unified OpenClaw transport interface and types.
 *
 * Provides a single interface for all OpenClaw communication that works
 * over both CLI subprocesses (self-hosted) and HTTP to the Gateway
 * (hosted / remote). The transport is selected via the OPENCLAW_TRANSPORT
 * environment variable:
 *
 *   "cli"  (default) — spawns `openclaw` binary, reads local files
 *   "http"           — talks HTTP to the Gateway's /tools/invoke endpoint
 *   "auto"           — tries HTTP, falls back to CLI
 */

/** Transport mode for OpenClaw communication. */
export type TransportMode = "cli" | "http" | "auto";

/** Result of a CLI run when both stdout and stderr are captured. */
export type RunCliResult = {
  stdout: string;
  stderr: string;
  code: number | null;
};

/**
 * Unified OpenClaw client abstraction.
 *
 * This interface decouples Mission Control from the underlying transport
 * mechanism. All higher-level code should use this interface rather than
 * calling openclaw CLI or making raw HTTP requests.
 *
 * The WebSocket client (OpenClawClient in client.ts) handles real-time
 * streaming events. This interface handles request/response operations
 * (CLI commands, gateway RPC, file I/O).
 */
export interface OpenClawTransport {
  /** Resolve which transport should be used right now (effective mode). */
  resolveTransport(): Promise<TransportMode>;

  /** Run a CLI command and return parsed JSON (equivalent to runCliJson). */
  runJson<T>(args: string[], timeout?: number): Promise<T>;

  /** Run a CLI command and return raw stdout (equivalent to runCli). */
  run(args: string[], timeout?: number, stdin?: string): Promise<string>;

  /** Run a CLI command capturing stdout, stderr, exit code (equivalent to runCliCaptureBoth). */
  runCapture(args: string[], timeout?: number): Promise<RunCliResult>;

  /** Call a Gateway RPC method (equivalent to gatewayCall). */
  gatewayRpc<T>(
    method: string,
    params?: Record<string, unknown>,
    timeout?: number,
  ): Promise<T>;

  /** Read a file from the OpenClaw filesystem. */
  readFile(path: string): Promise<string>;

  /** Write a file to the OpenClaw filesystem. */
  writeFile(path: string, content: string): Promise<void>;

  /** List directory contents (file names only). */
  readdir(path: string): Promise<string[]>;

  /** HTTP request to the Gateway (health check, etc). */
  gatewayFetch(path: string, init?: RequestInit): Promise<Response>;

  /** The resolved transport mode. */
  getTransport(): TransportMode;
}

// ── Singleton ──────────────────────────────────────

let _transport: OpenClawTransport | null = null;

export function getTransportMode(): TransportMode {
  const mode = (
    process.env.OPENCLAW_TRANSPORT || "auto"
  ).toLowerCase() as string;
  if (mode === "http" || mode === "cli") return mode as TransportMode;
  return "auto";
}

/**
 * Returns the singleton OpenClawTransport for the current transport mode.
 * Lazy-loads the transport implementation on first call.
 */
export async function getTransport(): Promise<OpenClawTransport> {
  if (_transport) return _transport;

  const mode = getTransportMode();
  switch (mode) {
    case "http": {
      const { HttpTransport } = await import("./transports/http-transport");
      _transport = new HttpTransport();
      break;
    }
    case "auto": {
      const { AutoTransport } = await import("./transports/auto-transport");
      _transport = new AutoTransport();
      break;
    }
    default: {
      const { CliTransport } = await import("./transports/cli-transport");
      _transport = new CliTransport();
      break;
    }
  }
  return _transport;
}

/** Reset the singleton (for testing). */
export function resetTransport(): void {
  _transport = null;
}