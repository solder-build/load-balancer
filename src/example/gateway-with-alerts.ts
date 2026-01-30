import { RpcGateway } from "../gateway/index.js";

const gateway = new RpcGateway({
  port: 8080,
  host: "0.0.0.0",
  cors: {
    allowedOrigins: ["*"],
  },
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN || "8109736454:AAGX4J9IcP5WCKRZUOaFm16TeOmwXdID7xI",
    chatId: process.env.TELEGRAM_CHAT_ID || "-1003451681211",
  },
  routes: [
    {
      id: "default",
      endpoints: [
        {
          url: "https://api.mainnet-beta.solana.com",
        },
        {
          url: "https://api.mainne-beta.solana.com",
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
  if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.TELEGRAM_CHAT_ID) {
    console.warn(
      "\n⚠️  Telegram alerts not configured. Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID environment variables.\n",
    );
  }

  await gateway.start();

  console.log("\nRoutes status:");
  for (const route of gateway.getStatus()) {
    console.log(`  ${route.routeId}:`);
    for (const endpoint of route.endpoints) {
      console.log(`    - ${endpoint.url} (healthy: ${endpoint.healthy})`);
    }
  }

  console.log("\nGateway is running. Press Ctrl+C to stop.");
  console.log("Alerts will be sent to Telegram when endpoints become unhealthy.\n");

  await testUnhealthyScenario(gateway);

  process.on("SIGINT", async () => {
    console.log("\nShutting down...");
    await gateway.stop();
    process.exit(0);
  });
}

/**
 * Test function to trigger unhealthy endpoint scenario.
 * This will simulate failures to trigger Telegram alerts.
 */
async function testUnhealthyScenario(gateway: RpcGateway): Promise<void> {
  console.log("\n" + "=".repeat(60));
  console.log("  Testing Unhealthy Endpoint Scenario");
  console.log("=".repeat(60));

  // Verify Telegram configuration
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!botToken || !chatId) {
    console.error("Telegram configuration not found. Please check your .env file.");
    return;
  }
  
  console.log("\n🔍 Verifying Telegram configuration...");
  console.log(`   Bot Token: ${botToken.substring(0, 10)}...${botToken.substring(botToken.length - 5)}`);
  console.log(`   Chat ID: ${chatId}`);
  
  try {
    const testUrl = `https://api.telegram.org/bot${botToken}/getMe`;
    const testResponse = await fetch(testUrl);
    if (testResponse.ok) {
      const botInfo = await testResponse.json();
      console.log(`   ✅ Bot verified: @${botInfo.result.username}`);
    } else {
      console.log(`   ⚠️  Could not verify bot (status: ${testResponse.status})`);
    }
  } catch (error) {
    console.log(`   ⚠️  Error verifying bot: ${error}`);
  }

  const balancer = gateway.getBalancer("default");
  if (!balancer) {
    console.error("Could not find default route balancer");
    return;
  }

  const status = balancer.getStatus();
  console.log("\n📊 Initial endpoint status:");
  status.forEach((ep) => {
    console.log(`  - ${ep.id}: ${ep.url}`);
    console.log(`    Healthy: ${ep.healthy}, Failures: ${ep.consecutiveFailures}`);
  });

  console.log("\n🧪 Testing scenario options:");
  console.log("  1. Manual test: Marking endpoint as unhealthy");
  console.log("  2. Direct test: Making requests directly to bad endpoint URL");

  console.log("\n--- Option 1: Manual Test ---");
  const testEndpoint = status.find((ep) => ep.url.includes("mainne-beta"));
  if (testEndpoint) {
    console.log(`\n⚠️  Manually marking endpoint as unhealthy: ${testEndpoint.url}`);
    console.log(`   Endpoint ID: ${testEndpoint.id}`);
    balancer.markUnhealthy(testEndpoint.id, "Manual test - simulating failure");
    console.log("✅ Alert callback triggered! Check logs above for Telegram status.");
    
    await new Promise((resolve) => setTimeout(resolve, 3000));
    
    const updatedStatus = balancer.getStatus();
    const updated = updatedStatus.find((ep) => ep.id === testEndpoint.id);
    console.log(`\n📊 Updated status: Healthy=${updated?.healthy}, Error=${updated?.lastError}`);
  } else {
    console.log("⚠️  Could not find test endpoint with 'mainne-beta'");
  }

  console.log("\n--- Option 2: Direct Test (Targeting Bad Endpoint) ---");
  const badEndpoint = status.find((ep) => ep.url.includes("mainne-beta"));
  if (badEndpoint) {
    console.log(`\n🎯 Making requests directly to bad endpoint: ${badEndpoint.url}`);
    console.log("   (This will fail immediately and trigger alert after 3 failures)");
    
    const failureThreshold = 3;
    console.log(`\nMaking ${failureThreshold} direct requests to bad endpoint...`);
    
    for (let i = 1; i <= failureThreshold; i++) {
      try {
        console.log(`  Request ${i}/${failureThreshold}...`);
        await fetch(badEndpoint.url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: i,
            method: "getSlot",
          }),
        });
      } catch (error) {
        console.log(`    ❌ Request failed (expected): ${error instanceof Error ? error.message : String(error)}`);
        if (i === failureThreshold) {
          console.log(`\n⚠️  Simulating ${failureThreshold} consecutive failures...`);
          for (let j = 0; j < failureThreshold; j++) {
            balancer.markUnhealthy(badEndpoint.id, `HTTP Error - Connection failed (test ${j + 1})`);
            await new Promise((resolve) => setTimeout(resolve, 100));
          }
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    
    console.log("\n✅ After 3 consecutive failures, alert should be sent!");
    console.log("   Check logs above for Telegram alert status.");
    
    await new Promise((resolve) => setTimeout(resolve, 3000));
    
    const finalStatus = balancer.getStatus();
    console.log("\n📊 Final endpoint status:");
    finalStatus.forEach((ep) => {
      const icon = ep.healthy ? "✅" : "❌";
      console.log(`  ${icon} ${ep.id}: ${ep.url}`);
      console.log(`     Healthy: ${ep.healthy}, Failures: ${ep.consecutiveFailures}`);
      if (ep.lastError) {
        console.log(`     Last Error: ${ep.lastError}`);
      }
    });
  } else {
    console.log("⚠️  Could not find bad endpoint for direct test");
  }

  console.log("\n" + "=".repeat(60));
  console.log("  Test Complete - Gateway continues running");
  console.log("=".repeat(60) + "\n");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

