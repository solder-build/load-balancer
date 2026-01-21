import { RpcGateway } from "../gateway/index.js";

const gateway = new RpcGateway({
  port: 8080,
  host: "0.0.0.0",
  cors: {
    allowedOrigins: ["*"],
  },
  routes: [
    {
      id: "default",
      endpoints: [
        {
          url: "https://elite.rpc.solanavibestation.com/?api_key=e74b083a2416270764a3c17b479a27b4",
        },
        {
          url: "https://api.mainnet-beta.solana.com",
        },
      ],
    },
  ],
});

async function main(): Promise<void> {
  await gateway.start();

  console.log("\nRoutes status:");
  for (const route of gateway.getStatus()) {
    console.log(`  ${route.routeId}:`);
    for (const endpoint of route.endpoints) {
      console.log(`    - ${endpoint.url} (healthy: ${endpoint.healthy})`);
    }
  }

  console.log("\nGateway is running. Press Ctrl+C to stop.\n");

  process.on("SIGINT", async () => {
    console.log("\nShutting down...");
    await gateway.stop();
    process.exit(0);
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

