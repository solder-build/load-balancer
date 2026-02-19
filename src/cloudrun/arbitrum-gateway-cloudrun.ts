import { RpcGateway } from "../gateway/index.js";

// GCE Load Balancer configuration
const PORT = parseInt(process.env.PORT || "8080", 10);

// Active and Passive gateway endpoints
const ACTIVE_GATEWAY = process.env.ACTIVE_GATEWAY || "http://34.126.125.90:3849";
const PASSIVE_GATEWAY = process.env.PASSIVE_GATEWAY || "http://34.126.177.240:3849";

// External fallback endpoints
const EXTERNAL_RPC_1 = process.env.EXTERNAL_RPC_1 || "https://arb1.arbitrum.io/rpc";
const EXTERNAL_RPC_2 = process.env.EXTERNAL_RPC_2 || "https://arbitrum-one.publicnode.com";
const EXTERNAL_RPC_3 = process.env.EXTERNAL_RPC_3 || "https://rpc.ankr.com/arbitrum";

// Arbitrum JSON-RPC methods
// Arbitrum is EVM-compatible and supports standard Ethereum methods
// plus Arbitrum-specific methods (arb_*)
// See: https://docs.arbitrum.io/build-decentralized-apps/arbitrum-vs-ethereum/rpc-methods
const ARBITRUM_READ_METHODS = [
  // Standard Ethereum methods (chain state)
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

  // Arbitrum-specific read methods
  "arb_blockNumber",
  "arb_getL1BaseFeeEstimate",
  "arb_getL1GasPriceEstimate",
  "arb_getPricesInWei",
  "arb_estimateRetryableTicketGasLimit",
];

const ARBITRUM_WRITE_METHODS = [
  "eth_sendRawTransaction",
  "eth_sendTransaction",
];

const ARBITRUM_DEBUG_METHODS = [
  "debug_traceTransaction",
  "debug_traceCall",
  "debug_traceBlockByNumber",
  "debug_traceBlockByHash",
];

const ARBITRUM_TRACE_METHODS = [
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

const ALL_ARBITRUM_METHODS = [
  ...ARBITRUM_READ_METHODS,
  ...ARBITRUM_WRITE_METHODS,
  ...ARBITRUM_DEBUG_METHODS,
  ...ARBITRUM_TRACE_METHODS,
];

// Create gateway with load balancing between active and passive
const gateway = new RpcGateway({
  port: PORT,
  host: "0.0.0.0",

  cors: {
    allowedOrigins: ["*"],
    allowedMethods: ["POST", "OPTIONS"],
    allowedHeaders: ["content-type", "x-api-key"],
  },

  allowedMethods: ALL_ARBITRUM_METHODS,
  maxBodyBytes: 1_000_000,
  healthCheckPath: "/health",

  routes: [
    {
      id: "arbitrum-ha",
      endpoints: [
        {
          url: ACTIVE_GATEWAY,
          timeoutMs: 30000,
        },
        {
          url: PASSIVE_GATEWAY,
          timeoutMs: 30000,
        },
        ...(EXTERNAL_RPC_1 ? [{
          url: EXTERNAL_RPC_1,
          timeoutMs: 30000,
        }] : []),
        ...(EXTERNAL_RPC_2 ? [{
          url: EXTERNAL_RPC_2,
          timeoutMs: 30000,
        }] : []),
        ...(EXTERNAL_RPC_3 ? [{
          url: EXTERNAL_RPC_3,
          timeoutMs: 30000,
        }] : []),
      ],
      options: {
        failureThreshold: 3,
        minHealthy: 1,
      },
    },
  ],
});

async function main(): Promise<void> {
  console.log("Starting Arbitrum One RPC Gateway on GCE Load Balancer...\n");
  console.log("Configuration:");
  console.log(`  Active Gateway:  ${ACTIVE_GATEWAY}`);
  console.log(`  Passive Gateway: ${PASSIVE_GATEWAY}`);
  console.log(`  External RPC 1:  ${EXTERNAL_RPC_1 || "(not configured)"}`);
  console.log(`  External RPC 2:  ${EXTERNAL_RPC_2 || "(not configured)"}`);
  console.log(`  External RPC 3:  ${EXTERNAL_RPC_3 || "(not configured)"}`);
  console.log(`  Port:            ${PORT}`);
  console.log(`  Allowed methods: ${ALL_ARBITRUM_METHODS.length} methods`);

  await gateway.start();

  console.log("\nRoutes status:");
  for (const route of gateway.getStatus()) {
    console.log(`  ${route.routeId}:`);
    for (const endpoint of route.endpoints) {
      console.log(`    - ${endpoint.url} (healthy: ${endpoint.healthy})`);
    }
  }

  console.log("\n✓ Arbitrum One RPC Gateway is running on GCE Load Balancer");
  console.log(`  HTTP: http://<external-ip>:${PORT}`);
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
