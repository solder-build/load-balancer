import { RpcGateway } from "../gateway/index.js";
import { WebSocketServer, WebSocket } from "ws";
import type { IncomingMessage } from "http";

// Cloud Run configuration
const PORT = parseInt(process.env.PORT || "8080", 10);
const WS_PATH = process.env.WS_PATH || "/ws";

// Active and Passive gateway endpoints
const ACTIVE_GATEWAY = process.env.ACTIVE_GATEWAY || "http://34.126.125.90:3848";
const PASSIVE_GATEWAY = process.env.PASSIVE_GATEWAY || "http://34.126.177.240:3848";
const ACTIVE_WS = process.env.ACTIVE_WS || "ws://34.126.125.90:3848/ws";
const PASSIVE_WS = process.env.PASSIVE_WS || "ws://34.126.177.240:3848/ws";

// External fallback endpoints
const ALCHEMY_ENDPOINT = process.env.ALCHEMY_ENDPOINT || "";
const NETHERMIND_ENDPOINT = process.env.NETHERMIND_ENDPOINT || "https://free-rpc.nethermind.io/mainnet-juno";

// API Keys for WebSocket authentication (comma-separated)
const WS_API_KEYS = process.env.WS_API_KEYS
  ? process.env.WS_API_KEYS.split(",").map((k) => k.trim())
  : [];

// Starknet JSON-RPC methods
const STARKNET_READ_METHODS = [
  "starknet_specVersion",
  "starknet_getBlockWithTxHashes",
  "starknet_getBlockWithTxs",
  "starknet_getBlockWithReceipts",
  "starknet_getStateUpdate",
  "starknet_getStorageAt",
  "starknet_getTransactionStatus",
  "starknet_getMessagesStatus",
  "starknet_getTransactionByHash",
  "starknet_getTransactionByBlockIdAndIndex",
  "starknet_getTransactionReceipt",
  "starknet_getClass",
  "starknet_getClassHashAt",
  "starknet_getClassAt",
  "starknet_getBlockTransactionCount",
  "starknet_call",
  "starknet_estimateFee",
  "starknet_estimateMessageFee",
  "starknet_blockNumber",
  "starknet_blockHashAndNumber",
  "starknet_chainId",
  "starknet_syncing",
  "starknet_getEvents",
  "starknet_getNonce",
  "starknet_getStorageProof",
];

const STARKNET_WRITE_METHODS = [
  "starknet_addInvokeTransaction",
  "starknet_addDeclareTransaction",
  "starknet_addDeployAccountTransaction",
];

const STARKNET_TRACE_METHODS = [
  "starknet_traceTransaction",
  "starknet_traceBlockTransactions",
  "starknet_simulateTransactions",
];

const ALL_STARKNET_METHODS = [
  ...STARKNET_READ_METHODS,
  ...STARKNET_WRITE_METHODS,
  ...STARKNET_TRACE_METHODS,
];

/**
 * Extract API key from WebSocket upgrade request
 */
function extractApiKey(req: IncomingMessage): string | null {
  const headerApiKey = req.headers["x-api-key"];
  if (headerApiKey) {
    return Array.isArray(headerApiKey) ? headerApiKey[0] : headerApiKey;
  }

  const authHeader = req.headers["authorization"];
  if (authHeader) {
    const auth = Array.isArray(authHeader) ? authHeader[0] : authHeader;
    const match = auth.match(/^Bearer\s+(.+)$/i);
    if (match) {
      return match[1];
    }
  }

  const url = new URL(req.url || "", `http://${req.headers.host}`);
  const queryApiKey = url.searchParams.get("api_key");
  if (queryApiKey) {
    return queryApiKey;
  }

  return null;
}

/**
 * Create WebSocket proxy with load balancing between active and passive
 */
function createWebSocketProxy(
  clientWs: WebSocket,
  clientIp?: string,
): WebSocket {
  const timestamp = () => new Date().toISOString();

  // Simple round-robin: alternate between active and passive
  const useActive = Math.random() < 0.5;
  const upstreamWsUrl = useActive ? ACTIVE_WS : PASSIVE_WS;
  const upstream = useActive ? "ACTIVE" : "PASSIVE";

  console.log(`[${timestamp()}] [WS→${upstream}] ${clientIp} connecting to ${upstreamWsUrl}`);

  const upstreamWs = new WebSocket(upstreamWsUrl);

  // Forward messages from client to upstream
  clientWs.on("message", (data) => {
    if (upstreamWs.readyState === WebSocket.OPEN) {
      try {
        const payload = JSON.parse(data.toString());
        const method = payload.method || "unknown";
        console.log(`[${timestamp()}] [WS→${upstream}] ${clientIp} → ${method}`);
        upstreamWs.send(data);
      } catch {
        upstreamWs.send(data);
      }
    }
  });

  // Forward messages from upstream to client
  upstreamWs.on("message", (data) => {
    if (clientWs.readyState === WebSocket.OPEN) {
      try {
        const payload = JSON.parse(data.toString());
        if (payload.method === "subscription") {
          console.log(`[${timestamp()}] [${upstream}→WS] ${clientIp} ← notification`);
        } else {
          console.log(`[${timestamp()}] [${upstream}→WS] ${clientIp} ← response`);
        }
        clientWs.send(data);
      } catch {
        clientWs.send(data);
      }
    }
  });

  upstreamWs.on("open", () => {
    console.log(`[${timestamp()}] [WS→${upstream}] ${clientIp} ✓ connected`);
  });

  upstreamWs.on("error", (error) => {
    console.error(`[${timestamp()}] [${upstream}] ${clientIp} ERROR:`, error.message);
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(JSON.stringify({
        jsonrpc: "2.0",
        id: null,
        error: { code: -32603, message: "Upstream connection error" }
      }));
    }
  });

  upstreamWs.on("close", () => {
    console.log(`[${timestamp()}] [${upstream}] ${clientIp} disconnected`);
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.close();
    }
  });

  clientWs.on("close", () => {
    console.log(`[${timestamp()}] [WS] ${clientIp} disconnected`);
    if (upstreamWs.readyState === WebSocket.OPEN) {
      upstreamWs.close();
    }
  });

  return upstreamWs;
}

// Create gateway with load balancing between active and passive
const gateway = new RpcGateway({
  port: PORT,
  host: "0.0.0.0",

  cors: {
    allowedOrigins: ["*"],
    allowedMethods: ["POST", "OPTIONS"],
    allowedHeaders: ["content-type", "x-api-key"],
  },

  allowedMethods: ALL_STARKNET_METHODS,
  maxBodyBytes: 1_000_000,
  healthCheckPath: "/health",

  routes: [
    {
      id: "starknet-ha",
      endpoints: [
        {
          url: ACTIVE_GATEWAY,
          timeoutMs: 30000,
        },
        {
          url: PASSIVE_GATEWAY,
          timeoutMs: 30000,
        },
        ...(ALCHEMY_ENDPOINT ? [{
          url: ALCHEMY_ENDPOINT,
          timeoutMs: 30000,
        }] : []),
        {
          url: NETHERMIND_ENDPOINT,
          timeoutMs: 30000,
        },
      ],
      options: {
        failureThreshold: 3,
        minHealthy: 1,
      },
    },
  ],
});

async function main(): Promise<void> {
  console.log("Starting Starknet RPC Gateway on Cloud Run...\n");
  console.log("Configuration:");
  console.log(`  Active Gateway:  ${ACTIVE_GATEWAY}`);
  console.log(`  Passive Gateway: ${PASSIVE_GATEWAY}`);
  console.log(`  Alchemy:         ${ALCHEMY_ENDPOINT || "(not configured)"}`);
  console.log(`  Nethermind:      ${NETHERMIND_ENDPOINT}`);
  console.log(`  Active WS:       ${ACTIVE_WS}`);
  console.log(`  Passive WS:      ${PASSIVE_WS}`);
  console.log(`  Cloud Run Port:  ${PORT}`);
  console.log(`  WebSocket Path:  ${WS_PATH}`);
  console.log(`  WS API Keys:     ${WS_API_KEYS.length > 0 ? WS_API_KEYS.length + " configured" : "NONE (open access)"}`);

  await gateway.start();

  // Get the HTTP server from the gateway
  const httpServer = gateway.getHttpServer();

  if (!httpServer) {
    throw new Error("Failed to get HTTP server from gateway");
  }

  // Create WebSocket server
  const apiKeySet = new Set(WS_API_KEYS);
  const wss = new WebSocketServer({
    server: httpServer,
    path: WS_PATH,
    maxPayload: 1_000_000,
    verifyClient: (info, callback) => {
      // If no API keys configured, allow all connections
      if (apiKeySet.size === 0) {
        callback(true);
        return;
      }

      const apiKey = extractApiKey(info.req);

      if (!apiKey) {
        console.log(`WS rejected: No API key from ${info.req.socket.remoteAddress}`);
        callback(false, 401, "Unauthorized: API key required");
        return;
      }

      if (!apiKeySet.has(apiKey)) {
        console.log(`WS rejected: Invalid API key from ${info.req.socket.remoteAddress}`);
        callback(false, 403, "Forbidden: Invalid API key");
        return;
      }

      console.log(`WS accepted from ${info.req.socket.remoteAddress}`);
      callback(true);
    },
  });

  wss.on("connection", (ws, req) => {
    const clientIp = req.socket.remoteAddress;
    const timestamp = () => new Date().toISOString();

    console.log(`[${timestamp()}] [WS] ${clientIp} ✓ authenticated`);
    createWebSocketProxy(ws, clientIp);
  });

  console.log("\nRoutes status:");
  for (const route of gateway.getStatus()) {
    console.log(`  ${route.routeId}:`);
    for (const endpoint of route.endpoints) {
      console.log(`    - ${endpoint.url} (healthy: ${endpoint.healthy})`);
    }
  }

  console.log("\n✓ Starknet RPC Gateway is running on Cloud Run");
  console.log(`  HTTP:      https://<cloud-run-url>`);
  console.log(`  WebSocket: wss://<cloud-run-url>${WS_PATH}`);
  console.log("\nPress Ctrl+C to stop.\n");

  process.on("SIGTERM", async () => {
    console.log("\nReceived SIGTERM, shutting down gracefully...");
    wss.close();
    await gateway.stop();
    process.exit(0);
  });

  process.on("SIGINT", async () => {
    console.log("\nShutting down...");
    wss.close();
    await gateway.stop();
    process.exit(0);
  });
}

main().catch((error) => {
  console.error("Failed to start gateway:", error);
  process.exit(1);
});
