import { RpcGateway } from "../gateway/index.js";
import type { IncomingMessage, ServerResponse } from "http";

// GCE Load Balancer configuration
const PORT = parseInt(process.env.PORT || "8080", 10);

// Active and Passive gateway endpoints
const ACTIVE_GATEWAY = process.env.ACTIVE_GATEWAY || "http://34.126.125.90:3850";
const PASSIVE_GATEWAY = process.env.PASSIVE_GATEWAY || "http://34.126.177.240:3850";

// External fallback endpoints
const EXTERNAL_RPC_1 = process.env.EXTERNAL_RPC_1 || "https://eth.llamarpc.com";
const EXTERNAL_RPC_2 = process.env.EXTERNAL_RPC_2 || "https://ethereum.publicnode.com";
const EXTERNAL_RPC_3 = process.env.EXTERNAL_RPC_3 || "https://1rpc.io/eth";

// Ethereum JSON-RPC methods
const ETHEREUM_READ_METHODS = [
  "eth_blockNumber", "eth_chainId", "eth_syncing", "eth_gasPrice",
  "eth_maxPriorityFeePerGas", "eth_feeHistory",
  "eth_getBlockByHash", "eth_getBlockByNumber",
  "eth_getBlockTransactionCountByHash", "eth_getBlockTransactionCountByNumber",
  "eth_getUncleByBlockHashAndIndex", "eth_getUncleByBlockNumberAndIndex",
  "eth_getUncleCountByBlockHash", "eth_getUncleCountByBlockNumber", "eth_getBlockReceipts",
  "eth_getTransactionByHash", "eth_getTransactionByBlockHashAndIndex",
  "eth_getTransactionByBlockNumberAndIndex", "eth_getTransactionReceipt", "eth_getTransactionCount",
  "eth_getBalance", "eth_getStorageAt", "eth_getCode", "eth_getProof",
  "eth_call", "eth_estimateGas", "eth_createAccessList",
  "eth_newFilter", "eth_newBlockFilter", "eth_newPendingTransactionFilter",
  "eth_uninstallFilter", "eth_getFilterChanges", "eth_getFilterLogs", "eth_getLogs",
  "net_version", "net_listening", "net_peerCount", "web3_clientVersion", "web3_sha3",
];

const ETHEREUM_WRITE_METHODS = ["eth_sendRawTransaction", "eth_sendTransaction"];

const ETHEREUM_DEBUG_METHODS = [
  "debug_traceTransaction", "debug_traceCall",
  "debug_traceBlockByNumber", "debug_traceBlockByHash",
  "debug_getBadBlocks", "debug_storageRangeAt",
];

const ETHEREUM_TRACE_METHODS = [
  "trace_call", "trace_callMany", "trace_rawTransaction",
  "trace_replayBlockTransactions", "trace_replayTransaction",
  "trace_block", "trace_filter", "trace_get", "trace_transaction",
];

const ALL_ETHEREUM_METHODS = [
  ...ETHEREUM_READ_METHODS, ...ETHEREUM_WRITE_METHODS,
  ...ETHEREUM_DEBUG_METHODS, ...ETHEREUM_TRACE_METHODS,
];

// ── In-memory stats ──────────────────────────────────────────────────────────

const _stats = {
  startTime: Date.now(),
  total: 0, success: 0, failed: 0,
  responseTimes: [] as number[],
  methods: {} as Record<string, number>,
  hourly: new Map<string, { req: number; err: number; ms: number }>(),
};

function _hourKey(d = new Date()): string {
  const h = new Date(d);
  h.setMinutes(0, 0, 0);
  return h.toISOString();
}

function _recordRequest(method: string | null, ms: number, ok: boolean): void {
  _stats.total++;
  ok ? _stats.success++ : _stats.failed++;
  _stats.responseTimes.push(ms);
  if (_stats.responseTimes.length > 5000) _stats.responseTimes.shift();
  if (method) _stats.methods[method] = (_stats.methods[method] || 0) + 1;
  const key = _hourKey();
  const b = _stats.hourly.get(key) ?? { req: 0, err: 0, ms: 0 };
  b.req++; if (!ok) b.err++; b.ms += ms;
  _stats.hourly.set(key, b);
  const cutoff = _hourKey(new Date(Date.now() - 25 * 3600_000));
  for (const k of _stats.hourly.keys()) if (k < cutoff) _stats.hourly.delete(k);
}

function _buildStats(): object {
  const uptime = Math.floor((Date.now() - _stats.startTime) / 1000);
  const avgMs = _stats.responseTimes.length
    ? Math.round(_stats.responseTimes.reduce((a, b) => a + b, 0) / _stats.responseTimes.length)
    : 0;
  const now = Date.now();
  const hourlyStats = Array.from({ length: 24 }, (_, i) => {
    const d = new Date(now - (23 - i) * 3600_000);
    d.setMinutes(0, 0, 0);
    const b = _stats.hourly.get(d.toISOString());
    return {
      hour: d.toISOString(),
      requests: b?.req ?? 0,
      errors: b?.err ?? 0,
      avgResponseTime: b && b.req > 0 ? Math.round(b.ms / b.req) : 0,
    };
  });
  const totalM = Object.values(_stats.methods).reduce((a, b) => a + b, 0);
  const top5 = Object.entries(_stats.methods)
    .sort(([, a], [, b]) => b - a).slice(0, 5)
    .map(([method, count]) => ({
      method, count,
      percentage: totalM > 0 ? Math.round(count / totalM * 100) : 0,
    }));
  if (top5.length > 0) {
    const topCount = top5.reduce((a, b) => a + b.count, 0);
    const othersCount = _stats.total - topCount;
    if (othersCount > 0) {
      top5.push({
        method: "others", count: othersCount,
        percentage: Math.max(0, 100 - top5.reduce((a, b) => a + b.percentage, 0)),
      });
    }
  }
  return {
    timestamp: new Date().toISOString(),
    uptime,
    totalRequests: _stats.total,
    successfulRequests: _stats.success,
    failedRequests: _stats.failed,
    averageResponseTime: avgMs,
    requestsPerSecond: uptime > 0 ? Math.round(_stats.total / uptime * 10) / 10 : 0,
    hourlyStats,
    methodStats: top5,
  };
}

// ── Gateway ──────────────────────────────────────────────────────────────────

const gateway = new RpcGateway({
  port: PORT,
  host: "0.0.0.0",
  cors: {
    allowedOrigins: ["*"],
    allowedMethods: ["POST", "OPTIONS"],
    allowedHeaders: ["content-type", "x-api-key"],
  },
  allowedMethods: ALL_ETHEREUM_METHODS,
  maxBodyBytes: 1_000_000,
  healthCheckPath: "/health",
  routes: [
    {
      id: "ethereum-ha",
      endpoints: [
        { url: ACTIVE_GATEWAY, timeoutMs: 30000 },
        { url: PASSIVE_GATEWAY, timeoutMs: 30000 },
        ...(EXTERNAL_RPC_1 ? [{ url: EXTERNAL_RPC_1, timeoutMs: 30000 }] : []),
        ...(EXTERNAL_RPC_2 ? [{ url: EXTERNAL_RPC_2, timeoutMs: 30000 }] : []),
        ...(EXTERNAL_RPC_3 ? [{ url: EXTERNAL_RPC_3, timeoutMs: 30000 }] : []),
      ],
      options: { failureThreshold: 3, minHealthy: 1 },
    },
  ],
});

async function main(): Promise<void> {
  console.log("Starting Ethereum RPC Gateway on GCE Load Balancer...\n");
  console.log("Configuration:");
  console.log(`  Active Gateway:  ${ACTIVE_GATEWAY}`);
  console.log(`  Passive Gateway: ${PASSIVE_GATEWAY}`);
  console.log(`  External RPC 1:  ${EXTERNAL_RPC_1 || "(not configured)"}`);
  console.log(`  External RPC 2:  ${EXTERNAL_RPC_2 || "(not configured)"}`);
  console.log(`  External RPC 3:  ${EXTERNAL_RPC_3 || "(not configured)"}`);
  console.log(`  Port:            ${PORT}`);
  console.log(`  Allowed methods: ${ALL_ETHEREUM_METHODS.length} methods`);

  await gateway.start();

  // ── Attach stats interceptor ────────────────────────────────────────────
  const httpServer = gateway.getHttpServer()!;
  const existing = httpServer.listeners("request").slice() as ((
    req: IncomingMessage, res: ServerResponse
  ) => void)[];
  httpServer.removeAllListeners("request");

  httpServer.on("request", (req: IncomingMessage, res: ServerResponse) => {
    // Serve real-time stats
    if (req.url === "/stats" && req.method === "GET") {
      res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
      res.end(JSON.stringify(_buildStats()));
      return;
    }

    // Track POST requests (JSON-RPC)
    if (req.method === "POST") {
      const start = Date.now();
      let method: string | null = null;
      const chunks: Buffer[] = [];
      req.on("data", (chunk: Buffer) => chunks.push(chunk));
      req.once("end", () => {
        try {
          const body = JSON.parse(Buffer.concat(chunks).toString());
          method = Array.isArray(body) ? (body[0]?.method ?? null) : (body.method ?? null);
        } catch { /* ignore */ }
      });
      const origEnd = (res.end as (...args: unknown[]) => unknown).bind(res);
      let tracked = false;
      (res as unknown as Record<string, unknown>).end = function (...args: unknown[]) {
        if (!tracked) {
          tracked = true;
          _recordRequest(method, Date.now() - start, res.statusCode < 400);
        }
        return origEnd(...args);
      };
    }

    for (const fn of existing) fn.call(httpServer, req, res);
  });
  // ── End stats interceptor ───────────────────────────────────────────────

  console.log("\nRoutes status:");
  for (const route of gateway.getStatus()) {
    console.log(`  ${route.routeId}:`);
    for (const endpoint of route.endpoints) {
      console.log(`    - ${endpoint.url} (healthy: ${endpoint.healthy})`);
    }
  }

  console.log("\n✓ Ethereum RPC Gateway is running on GCE Load Balancer");
  console.log(`  HTTP:  http://<external-ip>:${PORT}`);
  console.log(`  Stats: http://<external-ip>:${PORT}/stats`);
  console.log("\nPress Ctrl+C to stop.\n");

  process.on("SIGTERM", async () => {
    console.log("\nReceived SIGTERM, shutting down gracefully...");
    await gateway.stop();
    process.exit(0);
  });

  process.on("SIGINT", async () => {
    console.log("\nShutting down...");
    await gateway.stop();
    process.exit(0);
  });
}

main().catch((error) => {
  console.error("Failed to start gateway:", error);
  process.exit(1);
});
