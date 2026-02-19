import { RpcGateway } from "../gateway/index.js";

// Gateway port (configurable via env)
const GATEWAY_PORT = parseInt(process.env.GATEWAY_PORT || "3850", 10);


/**
 * Example cURL request for interacting with this Ethereum gateway:
 *
 * Query the latest block number:
 *
 * curl -X POST http://localhost:3850 \
 *   -H "Content-Type: application/json" \
 *   -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}'
 *
 * Replace http://localhost:3850 if running on a different host/port.
 */


// Ethereum JSON-RPC methods
// See: https://ethereum.org/en/developers/docs/apis/json-rpc/
const ETHEREUM_READ_METHODS = [
  // Chain state
  "eth_blockNumber",
  "eth_chainId",
  "eth_syncing",
  "eth_gasPrice",
  "eth_maxPriorityFeePerGas",
  "eth_feeHistory",

  // Block methods
  "eth_getBlockByHash",
  "eth_getBlockByNumber",
  "eth_getBlockTransactionCountByHash",
  "eth_getBlockTransactionCountByNumber",
  "eth_getUncleByBlockHashAndIndex",
  "eth_getUncleByBlockNumberAndIndex",
  "eth_getUncleCountByBlockHash",
  "eth_getUncleCountByBlockNumber",
  "eth_getBlockReceipts",

  // Transaction methods
  "eth_getTransactionByHash",
  "eth_getTransactionByBlockHashAndIndex",
  "eth_getTransactionByBlockNumberAndIndex",
  "eth_getTransactionReceipt",
  "eth_getTransactionCount",

  // Account methods
  "eth_getBalance",
  "eth_getStorageAt",
  "eth_getCode",
  "eth_getProof",

  // Call/Estimate
  "eth_call",
  "eth_estimateGas",
  "eth_createAccessList",

  // Filter methods
  "eth_newFilter",
  "eth_newBlockFilter",
  "eth_newPendingTransactionFilter",
  "eth_uninstallFilter",
  "eth_getFilterChanges",
  "eth_getFilterLogs",
  "eth_getLogs",

  // Network/Node info
  "net_version",
  "net_listening",
  "net_peerCount",
  "web3_clientVersion",
  "web3_sha3",
];

const ETHEREUM_WRITE_METHODS = [
  // Transaction submission
  "eth_sendRawTransaction",
  "eth_sendTransaction",
];

const ETHEREUM_DEBUG_METHODS = [
  // Debug/Trace API (Geth-specific)
  "debug_traceTransaction",
  "debug_traceCall",
  "debug_traceBlockByNumber",
  "debug_traceBlockByHash",
  "debug_getBadBlocks",
  "debug_storageRangeAt",
];

const ETHEREUM_TRACE_METHODS = [
  // Trace API (Parity/OpenEthereum-style)
  "trace_call",
  "trace_callMany",
  "trace_rawTransaction",
  "trace_replayBlockTransactions",
  "trace_replayTransaction",
  "trace_block",
  "trace_filter",
  "trace_get",
  "trace_transaction",
];

// All allowed methods (full node functionality)
const ALL_ETHEREUM_METHODS = [
  ...ETHEREUM_READ_METHODS,
  ...ETHEREUM_WRITE_METHODS,
  ...ETHEREUM_DEBUG_METHODS,
  ...ETHEREUM_TRACE_METHODS,
];

const gateway = new RpcGateway({
  port: GATEWAY_PORT,
  host: "0.0.0.0",

  // CORS for browser-based dApps
  cors: {
    allowedOrigins: ["*"], // Restrict in production: ["https://yourdapp.com"]
    allowedMethods: ["POST", "OPTIONS"],
    allowedHeaders: ["content-type", "x-api-key"],
  },

  // Method gating - only allow standard Ethereum RPC methods
  allowedMethods: ALL_ETHEREUM_METHODS,

  // Max request body (prevent abuse)
  maxBodyBytes: 1_000_000, // 1MB

  // Health check endpoint for load balancer / Keepalived probes
  healthCheckPath: "/health",

  routes: [
    {
      id: "ethereum-local",
      endpoints: [
        {
          url: process.env.ETHEREUM_RPC_URL || "http://127.0.0.1:8545",
          timeoutMs: parseInt(process.env.ETHEREUM_RPC_TIMEOUT || "30000", 10),
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
  console.log("Starting Ethereum RPC Gateway...\n");
  const upstreamUrl = process.env.ETHEREUM_RPC_URL || "http://127.0.0.1:8545";
  console.log("Configuration:");
  console.log(`  Upstream: ${upstreamUrl}`);
  console.log(`  Gateway:  http://0.0.0.0:${GATEWAY_PORT}`);
  console.log(`  Allowed methods: ${ALL_ETHEREUM_METHODS.length} methods`);

  await gateway.start();

  console.log("\nRoutes status:");
  for (const route of gateway.getStatus()) {
    console.log(`  ${route.routeId}:`);
    for (const endpoint of route.endpoints) {
      console.log(`    - ${endpoint.url} (healthy: ${endpoint.healthy})`);
    }
  }

  console.log("\n Ethereum RPC Gateway is running");
  console.log(`  Clients can connect to: http://<VM_EXTERNAL_IP>:${GATEWAY_PORT}`);
  console.log("\nPress Ctrl+C to stop.\n");

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
