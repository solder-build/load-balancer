import { LoadBalancer } from "../../loadBalancer.js";
import { createSolanaRpc } from "@solana/rpc";

const rpcUrls = [
  "https://api.devnet.solana.com",
];

async function main(): Promise<void> {
  const balancer = new LoadBalancer(rpcUrls);

  const client = createSolanaRpc(balancer.getUrl());

  const slot = await client.getSlot();
  console.log("slot", slot.toString());
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

