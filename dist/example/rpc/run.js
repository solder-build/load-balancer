import { LoadBalancer } from "../../loadBalancer.js";
import { RpcClient } from "./rpc.js";
const rpcUrls = [
    "https://api.devnet.solana.com",
    "https://elite.rpc.solanavibestation.com/?api_key=e74b083a2416270764a3c17b479a27b4",
];
async function main() {
    const balancer = new LoadBalancer(rpcUrls);
    console.log("==============DEBUG NOBODY===============");
    console.log(balancer);
    console.log(balancer.getUrl());
    console.log("==============DEBUG NOBODY===============");
    const client = new RpcClient({ endpoint: balancer.getUrl() });
    const slot = await client.getSlot();
    console.log("slot", slot.toString());
}
main().catch((error) => {
    console.error(error);
    process.exit(1);
});
//# sourceMappingURL=run.js.map