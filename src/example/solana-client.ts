import { createSolanaRpc } from "@solana/rpc";

const GATEWAY_URL = "http://127.0.0.1:8080";

function logSection(title: string): void {
  console.log("\n" + "=".repeat(60));
  console.log(`  ${title}`);
  console.log("=".repeat(60));
}

async function exampleFetch(): Promise<void> {
  logSection("Example 1: Using fetch");

  const response = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "getSlot",
    }),
  });

  const data = await response.json();
  console.log("\n✓ Request successful");
  console.log("Response:", JSON.stringify(data, null, 2));
}

async function exampleSolanaRpc(): Promise<void> {
  logSection("Example 2: Using Solana RPC client");

  const rpc = createSolanaRpc(GATEWAY_URL);

  console.log("\n📡 Making RPC requests through gateway...\n");

  const slot = await rpc.getSlot().send();
  console.log(`  Current slot:     ${slot.toLocaleString()}`);

  const blockHeight = await rpc.getBlockHeight().send();
  console.log(`  Block height:     ${blockHeight.toLocaleString()}`);

  console.log("\n🔄 Making multiple parallel requests (load-balanced):");
  const promises = [
    rpc.getSlot().send(),
    rpc.getSlot().send(),
    rpc.getSlot().send(),
  ];
  const slots = await Promise.all(promises);
  console.log(`  Slots: ${slots.map((s) => s.toLocaleString()).join(", ")}`);
  console.log("\n✓ All requests completed successfully");
}

async function exampleBatch(): Promise<void> {
  logSection("Example 3: Batch requests");

  console.log("\n📦 Sending batch request with 2 methods...\n");

  const response = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify([
      {
        jsonrpc: "2.0",
        id: 1,
        method: "getSlot",
      },
      {
        jsonrpc: "2.0",
        id: 2,
        method: "getBlockHeight",
      },
    ]),
  });

  const data = await response.json();
  console.log("✓ Batch request successful");
  console.log("\nResponse:");
  console.log(JSON.stringify(data, null, 2));
}

async function main(): Promise<void> {
  console.log("\n" + "╔".padEnd(60, "═") + "╗");
  console.log("║" + "  RPC Gateway Client Examples".padEnd(58) + "║");
  console.log("╚".padEnd(60, "═") + "╝");
  console.log(`\n📍 Gateway URL: ${GATEWAY_URL}`);
  console.log("💡 Make sure the gateway is running: npm run gateway\n");

  try {
    await exampleFetch();
    await exampleSolanaRpc();
    await exampleBatch();

    console.log("\n" + "═".repeat(60));
    console.log("  ✅ All examples completed successfully!");
    console.log("═".repeat(60) + "\n");
  } catch (error) {
    console.error("\n" + "═".repeat(60));
    console.error("  ❌ Error occurred");
    console.error("═".repeat(60));
    console.error("\n", error);
    console.error("\n💡 Make sure the gateway is running: npm run gateway\n");
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

