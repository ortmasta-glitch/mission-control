/**
 * OpenClaw transport abstraction — public API.
 *
 * This module re-exports the unified transport interface and factory
 * functions. Higher-level code should import from here rather than
 * reaching into individual transport modules.
 *
 * The existing WebSocket client (client.ts) handles real-time streaming
 * events. The transport layer handles request/response operations
 * (CLI commands, gateway RPC, file I/O) with automatic transport
 * selection (CLI, HTTP, or auto).
 *
 * Usage:
 *   import { getTransport, getTransportMode } from '@/lib/openclaw/transport';
 *   const transport = await getTransport();
 *   const sessions = await transport.runJson<SessionInfo[]>(['sessions', 'list']);
 */

export type { OpenClawTransport, TransportMode, RunCliResult } from "./transport-types";
export { getTransport, getTransportMode, resetTransport } from "./transport-types";

export { CliTransport } from "./transports/cli-transport";
export { HttpTransport } from "./transports/http-transport";
export { AutoTransport } from "./transports/auto-transport";

export { GatewayRpcClient, GatewayRpcError } from "./gateway-rpc";
export {
  runCli,
  runCliJson,
  runCliCaptureBoth,
  gatewayCall,
  parseJsonFromCliOutput,
} from "./cli";

export {
  getOpenClawHome,
  getConfigPath,
  readConfigFile,
  getDefaultWorkspace,
  getDefaultWorkspaceSync,
  getOpenClawBin,
  getOpenClawBinSync,
  getGatewayUrl,
  getGatewayPort,
  getGatewayToken,
} from "./paths";