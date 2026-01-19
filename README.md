# RPC Load Balancer

Minimal load balancer that can be used in-process to distribute requests across multiple RPC endpoints.

## Usage

```ts
import { LoadBalancer } from "./src/index.js";
import { Connection } from "@solana/web3.js";

const balancer = new LoadBalancer(
  ["https://rpc1.solana.com", "https://rpc2.solana.com"],
);

const connection = new Connection(balancer.getUrl(), {
  fetch: balancer.createFetch(),
});
```

If your SDK only accepts a URL, call `balancer.getUrl()` to rotate through
endpoints when you create the client.

## Example: Run the RpcClient

1. Edit `src/example/rpc/run.ts` and replace the URLs in `rpcUrls` with your own RPC endpoints.

2. Run the example:
```bash
npm run example
```

Or manually:
```bash
npm run build
node dist/example/rpc/run.js
```

