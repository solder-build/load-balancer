# RPC Load Balancer

A chain-agnostic load balancer for JSON-RPC endpoints with two main components:

- **SDK** - Core load balancing logic for programmatic use
- **Gateway** - HTTP server that routes RPC requests through load-balanced endpoints

## Project Structure

```
src/
  sdk/           # Core LoadBalancer class
  gateway/       # HTTP server for routing requests
  example/       # Usage examples
  index.ts       # Main exports
```

## Installation

```bash
npm install
npm run build
```

## Usage

### Gateway Mode (Recommended)

Run a gateway server that any RPC client can connect to:

```ts
import { RpcGateway } from "rpc-load-balancer";

const gateway = new RpcGateway({
  port: 8080,
  routes: [
    {
      id: "default",
      endpoints: [
        "https://rpc1.example.com",
        "https://rpc2.example.com",
      ],
    },
  ],
});

await gateway.start();
// RPC clients can now connect to http://localhost:8080
```

#### Method-Based Routing

Route specific methods to different endpoint pools:

```ts
const gateway = new RpcGateway({
  port: 8080,
  routes: [
    {
      id: "heavy",
      methods: ["getBlock", "getProgramAccounts"],
      endpoints: ["https://heavy-rpc.example.com"],
    },
    {
      id: "default",
      endpoints: ["https://rpc1.example.com", "https://rpc2.example.com"],
    },
  ],
  defaultRouteId: "default",
});
```

#### Method Whitelist

Only allow specific methods:

```ts
const gateway = new RpcGateway({
  port: 8080,
  allowedMethods: ["getSlot", "getBlockHeight", "getBalance"],
  routes: [{ id: "default", endpoints: ["https://rpc.example.com"] }],
});
```

### SDK Mode

Use the LoadBalancer directly in your application:

```ts
import { LoadBalancer } from "rpc-load-balancer";

const balancer = new LoadBalancer([
  "https://rpc1.example.com",
  "https://rpc2.example.com",
]);

// Get rotating URL for any RPC SDK
const url = balancer.getUrl();

// Make JSON-RPC request directly
const response = await balancer.request({
  jsonrpc: "2.0",
  id: 1,
  method: "getSlot",
});

// Use with fetch-based SDKs
const customFetch = balancer.createFetch();
```

## Examples

### Run Gateway Example

```bash
npm run gateway
```

This starts a gateway on port 8080. Connect any RPC client to `http://localhost:8080`.

### Run SDK Example

```bash
npm run sdk
```

This demonstrates programmatic usage of the LoadBalancer class.

## Configuration

### LoadBalancer Options

```ts
interface LoadBalancerOptions {
  failureThreshold?: number;  // Failures before marking unhealthy (default: 3)
  minHealthy?: number;        // Min healthy before fallback to all (default: 1)
}
```

### Endpoint Configuration

```ts
interface EndpointConfig {
  url: string;
  weight?: number;              // For weighted selection
  priority?: number;            // For priority-based selection
  headers?: Record<string, string>;
  timeoutMs?: number;
}

// Simple usage
const balancer = new LoadBalancer(["https://rpc1.com", "https://rpc2.com"]);

// With configuration
const balancer = new LoadBalancer([
  { url: "https://rpc1.com", weight: 2 },
  { url: "https://rpc2.com", headers: { "Authorization": "Bearer token" } },
]);
```

### Gateway Configuration

```ts
interface GatewayConfig {
  port: number;
  host?: string;                // Default: "0.0.0.0"
  routes: RouteConfig[];
  defaultRouteId?: string;      // Fallback route
  allowedMethods?: string[];    // Global method whitelist
  cors?: CorsConfig;
  maxBodyBytes?: number;        // Default: 1MB
}
```

## License

MIT
