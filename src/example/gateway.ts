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
        "https://api.mainnet.solana.com"
      ],
    },
  ],
  defaultRouteId: "default",
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

