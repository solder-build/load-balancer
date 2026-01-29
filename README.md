# rpc-load-balancer

Chain-agnostic **load balancing + gateway** for JSON-RPC endpoints.

- **SDK**: `LoadBalancer` for selecting/health-tracking upstream RPC endpoints
- **Gateway**: `RpcGateway` HTTP server that forwards JSON-RPC to upstream pools (with routing rules)

> Status: **beta** — API may evolve.

## Features

- **Round-robin selection** with endpoint health tracking
- **Automatic failover** after configurable consecutive failures
- **Per-endpoint headers** + **optional timeouts**
- **Method-aware routing**
  - Route requests by JSON-RPC method (single or batch)
  - Global method allowlist
- **CORS support** for browser-based clients
- **ESM-first** package (`"type": "module"`)

## Requirements

- **Node.js**: recommended **>= 20** (some example dependencies expect Node 20+)

## Install

```bash
npm install rpc-load-balancer
```

## Quickstart

### SDK

```ts
import { LoadBalancer } from "rpc-load-balancer";

const lb = new LoadBalancer([
  "https://rpc1.example.com",
  "https://rpc2.example.com",
]);

// Use a rotating URL with any RPC client:
const url = lb.getUrl();

// Or send JSON-RPC directly:
const res = await lb.request({
  jsonrpc: "2.0",
  id: 1,
  method: "getSlot",
});
```

### Gateway

```ts
import { RpcGateway } from "rpc-load-balancer";

const gateway = new RpcGateway({
  port: 8080,
  routes: [
    {
      id: "default",
      endpoints: ["https://rpc1.example.com", "https://rpc2.example.com"],
    },
  ],
});

await gateway.start();
// Point your JSON-RPC client at: http://127.0.0.1:8080
```

## Usage

### Configure endpoints (SDK + Gateway)

Endpoints can be strings or objects (see `src/sdk/types.ts`):

```ts
const lb = new LoadBalancer([
  { url: "https://rpc1.example.com", headers: { Authorization: "Bearer x" } },
  { url: "https://rpc2.example.com", timeoutMs: 5_000 },
]);
```

### Route by JSON-RPC method (Gateway)

```ts
const gateway = new RpcGateway({
  port: 8080,
  defaultRouteId: "default",
  routes: [
    {
      id: "heavy",
      methods: ["getProgramAccounts", "getBlock"],
      endpoints: ["https://heavy.example.com"],
    },
    {
      id: "default",
      endpoints: ["https://rpc1.example.com", "https://rpc2.example.com"],
    },
  ],
});
```

### Allowlist methods (Gateway)

```ts
const gateway = new RpcGateway({
  port: 8080,
  allowedMethods: ["getSlot", "getBlockHeight"],
  routes: [{ id: "default", endpoints: ["https://rpc.example.com"] }],
});
```

## API (high level)

- **SDK**
  - `new LoadBalancer(endpoints, options?)`
  - `getUrl()`, `getEndpoint()`, `getStatus()`
  - `fetch(input, init?, methods?)`, `request(payload, init?)`
  - `createFetch()`, `getLastUsedEndpoint()`
  - `markHealthy(idOrUrl)`, `markUnhealthy(idOrUrl, reason?)`
- **Gateway**
  - `new RpcGateway(config)`
  - `start()`, `stop()`, `getStatus()`, `getBalancer(routeId)`

For the full type-level reference, see:
- `src/sdk/types.ts`
- `src/gateway/types.ts`

## Examples

See `src/example/`:

- `npm run gateway` — starts an example gateway
- `npm run client` or `npm run solana-client` — runs Solana-specific client example against the gateway
- `npm run sdk` — runs an SDK example

## Development

```bash
npm install
npm run build
```

### Tests

```bash
npm test
```

## Contributing

Issues and PRs are welcome. Please include:

- A clear description of the change and motivation
- Tests for new behavior (or an explanation if not possible)

## License

MIT
