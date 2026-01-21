# RPC Load Balancer

A chain-agnostic load balancer for JSON-RPC endpoints with two main components:

- **SDK** - Core load balancing logic for programmatic use
- **Gateway** - HTTP server that routes RPC requests through load-balanced endpoints

## Table of Contents

- [Installation](#installation)
- [Quick Start](#quick-start)
- [SDK Documentation](#sdk-documentation)
  - [LoadBalancer Class](#loadbalancer-class)
  - [Configuration Options](#configuration-options)
  - [Methods](#methods)
  - [Health Tracking](#health-tracking)
- [Gateway Documentation](#gateway-documentation)
  - [RpcGateway Class](#rpcgateway-class)
  - [Gateway Configuration](#gateway-configuration)
  - [Method-Based Routing](#method-based-routing)
  - [CORS Configuration](#cors-configuration)
- [Examples](#examples)
- [Testing](#testing)
- [API Reference](#api-reference)

## Installation

```bash
npm install rpc-load-balancer
```

Or build from source:

```bash
git clone <repository>
cd load-balancer
npm install
npm run build
```

## Quick Start

### SDK Mode

Use the LoadBalancer directly in your application:

```typescript
import { LoadBalancer } from "rpc-load-balancer";

const balancer = new LoadBalancer([
  "https://rpc1.example.com",
  "https://rpc2.example.com",
]);

// Get rotating URL for any RPC client
const url = balancer.getUrl();

// Make JSON-RPC request directly
const response = await balancer.request({
  jsonrpc: "2.0",
  id: 1,
  method: "getSlot",
});
```

### Gateway Mode

Run a gateway server that any RPC client can connect to:

```typescript
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

---

## SDK Documentation

### LoadBalancer Class

The `LoadBalancer` class distributes requests across multiple RPC endpoints with automatic health tracking and failover.

#### Constructor

```typescript
new LoadBalancer(
  endpoints: Array<string | EndpointConfig>,
  options?: LoadBalancerOptions
)
```

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `endpoints` | `Array<string \| EndpointConfig>` | List of RPC endpoint URLs or configuration objects |
| `options` | `LoadBalancerOptions` | Optional configuration for the load balancer |

**Example:**

```typescript
// Simple string endpoints
const lb = new LoadBalancer([
  "https://rpc1.example.com",
  "https://rpc2.example.com",
]);

// With configuration objects
const lb = new LoadBalancer([
  { 
    url: "https://rpc1.example.com",
    weight: 2,
    headers: { "Authorization": "Bearer token" },
    timeoutMs: 5000,
  },
  { 
    url: "https://rpc2.example.com",
    priority: 1,
  },
]);

// With options
const lb = new LoadBalancer(endpoints, {
  failureThreshold: 5,
  minHealthy: 2,
});
```

### Configuration Options

#### EndpointConfig

```typescript
interface EndpointConfig {
  url: string;              // Required: The RPC endpoint URL
  weight?: number;          // Optional: Weight for selection (default: 1)
  priority?: number;        // Optional: Priority level (default: 0)
  headers?: Record<string, string>;  // Optional: Headers to include
  timeoutMs?: number;       // Optional: Request timeout in milliseconds
  methods?: string[];       // Optional: Whitelist of methods this endpoint handles
  blockedMethods?: string[]; // Optional: Methods this endpoint should not handle
}
```

#### LoadBalancerOptions

```typescript
interface LoadBalancerOptions {
  failureThreshold?: number;  // Consecutive failures before unhealthy (default: 3)
  minHealthy?: number;        // Minimum healthy endpoints before fallback (default: 1)
}
```

### Methods

#### `getUrl(): string`

Returns the URL of the next endpoint using round-robin selection.

```typescript
const url = balancer.getUrl();
// "https://rpc1.example.com"
```

#### `getEndpoint(): SelectedEndpoint`

Returns the full endpoint configuration for the next selected endpoint.

```typescript
const endpoint = balancer.getEndpoint();
// {
//   id: "endpoint-0",
//   url: "https://rpc1.example.com",
//   weight: 1,
//   priority: 0,
//   headers: {},
//   timeoutMs: undefined
// }
```

#### `getStatus(): EndpointStatus[]`

Returns health status for all endpoints.

```typescript
const status = balancer.getStatus();
// [
//   {
//     id: "endpoint-0",
//     url: "https://rpc1.example.com",
//     healthy: true,
//     consecutiveFailures: 0,
//     lastLatencyMs: 45,
//     lastError: undefined
//   },
//   ...
// ]
```

#### `fetch(input, init?, methods?): Promise<Response>`

Makes a fetch request through the load balancer. The URL in `input` is ignored; the selected endpoint URL is used instead.

```typescript
const response = await balancer.fetch("http://ignored", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getSlot" }),
});
```

#### `request<T>(payload, init?): Promise<T>`

Makes a JSON-RPC request and returns the parsed response.

```typescript
const result = await balancer.request<{ result: number }>({
  jsonrpc: "2.0",
  id: 1,
  method: "getSlot",
});
console.log(result.result); // 12345
```

#### `createFetch(): typeof fetch`

Creates a fetch function bound to the load balancer. Useful for SDKs that accept a custom fetch function.

```typescript
import { createSolanaRpc } from "@solana/rpc";

const customFetch = balancer.createFetch();
const rpc = createSolanaRpc("http://ignored", { fetch: customFetch });
```

#### `getLastUsedEndpoint(): SelectedEndpoint | undefined`

Returns the last endpoint used by `fetch()` or `request()`.

```typescript
await balancer.fetch("http://ignored", { ... });
const lastEndpoint = balancer.getLastUsedEndpoint();
console.log(lastEndpoint?.url); // "https://rpc1.example.com"
```

#### `markHealthy(urlOrId: string): void`

Manually marks an endpoint as healthy.

```typescript
balancer.markHealthy("endpoint-0");
// or
balancer.markHealthy("https://rpc1.example.com");
```

#### `markUnhealthy(urlOrId: string, reason?: string): void`

Manually marks an endpoint as unhealthy.

```typescript
balancer.markUnhealthy("endpoint-0", "Rate limited");
```

### Health Tracking

The LoadBalancer automatically tracks endpoint health:

1. **Success**: Resets failure count, marks healthy, records latency
2. **HTTP Error (4xx/5xx)**: Increments failure count, records error
3. **Network Error**: Increments failure count, records error message
4. **Threshold Exceeded**: Marks endpoint unhealthy after `failureThreshold` consecutive failures

When selecting an endpoint:
- Healthy endpoints are preferred
- If healthy endpoints < `minHealthy`, falls back to all endpoints
- Uses round-robin selection within the available pool

---

## Gateway Documentation

### RpcGateway Class

The `RpcGateway` class provides an HTTP server that receives JSON-RPC requests and routes them through load-balanced endpoints.

#### Constructor

```typescript
new RpcGateway(config: GatewayConfig)
```

**Example:**

```typescript
const gateway = new RpcGateway({
  port: 8080,
  host: "0.0.0.0",
  routes: [
    {
      id: "default",
      endpoints: ["https://rpc1.example.com", "https://rpc2.example.com"],
    },
  ],
  cors: {
    allowedOrigins: ["*"],
  },
});
```

### Gateway Configuration

#### GatewayConfig

```typescript
interface GatewayConfig {
  port: number;                    // Port to listen on
  host?: string;                   // Host to bind to (default: "0.0.0.0")
  routes: RouteConfig[];           // Route configurations
  defaultRouteId?: string;         // Fallback route when no match
  allowedMethods?: string[];       // Global method whitelist
  cors?: CorsConfig;               // CORS configuration
  maxBodyBytes?: number;           // Max request body size (default: 1MB)
}
```

#### RouteConfig

```typescript
interface RouteConfig {
  id: string;                      // Unique route identifier
  endpoints: Array<string | EndpointConfig>;  // RPC endpoints
  methods?: string[];              // Methods this route handles
  options?: LoadBalancerOptions;   // Load balancer options
}
```

### Methods

#### `start(): Promise<void>`

Starts the gateway server.

```typescript
await gateway.start();
console.log("Gateway running on port 8080");
```

#### `stop(): Promise<void>`

Stops the gateway server.

```typescript
await gateway.stop();
```

#### `getStatus(): RouteStatus[]`

Returns status of all routes and their endpoints.

```typescript
const status = gateway.getStatus();
// [
//   {
//     routeId: "default",
//     methods: undefined,
//     endpoints: [
//       { id: "endpoint-0", url: "...", healthy: true, ... }
//     ]
//   }
// ]
```

#### `getBalancer(routeId: string): LoadBalancer | undefined`

Gets the LoadBalancer instance for a specific route.

```typescript
const balancer = gateway.getBalancer("default");
balancer?.markUnhealthy("endpoint-0", "Manual override");
```

### Method-Based Routing

Route specific RPC methods to different endpoint pools:

```typescript
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

Routes are matched in order:
1. First route where all requested methods match the `methods` array
2. First route with no `methods` specified (handles all)
3. Route specified by `defaultRouteId`

### Method Whitelist

Restrict which RPC methods are allowed globally:

```typescript
const gateway = new RpcGateway({
  port: 8080,
  allowedMethods: ["getSlot", "getBlockHeight", "getBalance"],
  routes: [{ id: "default", endpoints: ["https://rpc.example.com"] }],
});
```

Requests with non-whitelisted methods receive a `-32601 Method not allowed` error.

### CORS Configuration

```typescript
interface CorsConfig {
  allowedOrigins?: string[];   // Default: ["*"]
  allowedMethods?: string[];   // Default: ["POST", "OPTIONS"]
  allowedHeaders?: string[];   // Default: ["content-type"]
}
```

**Example:**

```typescript
const gateway = new RpcGateway({
  port: 8080,
  cors: {
    allowedOrigins: ["https://myapp.com", "https://staging.myapp.com"],
    allowedMethods: ["POST", "OPTIONS"],
    allowedHeaders: ["content-type", "authorization"],
  },
  routes: [{ id: "default", endpoints: ["https://rpc.example.com"] }],
});
```

---

## Examples

### Run Gateway Example

```bash
npm run gateway
```

Starts a gateway on port 8080 connecting to Solana mainnet RPCs.

### Run Client Example

```bash
npm run client
```

Demonstrates making requests to the gateway using fetch and the Solana RPC client.

### SDK with Solana

```typescript
import { LoadBalancer } from "rpc-load-balancer";
import { createSolanaRpc } from "@solana/rpc";

const balancer = new LoadBalancer([
  "https://api.mainnet-beta.solana.com",
  "https://rpc.ankr.com/solana",
]);

// Option 1: Use custom fetch
const rpc = createSolanaRpc("http://ignored", {
  fetch: balancer.createFetch(),
});

// Option 2: Use rotating URL
const rpc = createSolanaRpc(balancer.getUrl());

const slot = await rpc.getSlot().send();
```

### Gateway with Multiple Routes

```typescript
import { RpcGateway } from "rpc-load-balancer";

const gateway = new RpcGateway({
  port: 8080,
  cors: { allowedOrigins: ["*"] },
  routes: [
    {
      id: "archive",
      methods: ["getBlock", "getTransaction"],
      endpoints: [
        { url: "https://archive.example.com", timeoutMs: 30000 },
      ],
    },
    {
      id: "realtime",
      methods: ["getSlot", "getBlockHeight"],
      endpoints: [
        "https://fast1.example.com",
        "https://fast2.example.com",
      ],
      options: { failureThreshold: 2 },
    },
    {
      id: "default",
      endpoints: ["https://general.example.com"],
    },
  ],
  defaultRouteId: "default",
});

await gateway.start();
```

---

## Testing

Run the test suite:

```bash
npm test
```

Run tests in watch mode:

```bash
npm run test:watch
```

Run tests with coverage:

```bash
npm run test:coverage
```

### Test Structure

```
src/
  sdk/
    loadBalancer.ts        # SDK implementation
    loadBalancer.test.ts   # SDK unit tests
    types.ts               # SDK types
  gateway/
    server.ts              # Gateway implementation
    server.test.ts         # Gateway unit tests
    types.ts               # Gateway types
```

---

## API Reference

### Types

#### SelectedEndpoint

```typescript
interface SelectedEndpoint {
  id: string;
  url: string;
  weight: number;
  priority: number;
  headers: Record<string, string>;
  timeoutMs?: number;
}
```

#### EndpointStatus

```typescript
interface EndpointStatus {
  id: string;
  url: string;
  healthy: boolean;
  consecutiveFailures: number;
  lastLatencyMs?: number;
  lastError?: string;
}
```

#### RouteStatus

```typescript
interface RouteStatus {
  routeId: string;
  methods?: string[];
  endpoints: EndpointStatus[];
}
```

### Exports

```typescript
// Main entry point
import { 
  LoadBalancer,
  RpcGateway,
  // Types
  type EndpointConfig,
  type EndpointStatus,
  type LoadBalancerOptions,
  type SelectedEndpoint,
  type CorsConfig,
  type GatewayConfig,
  type RouteConfig,
  type RouteStatus,
} from "rpc-load-balancer";

// SDK only
import { LoadBalancer } from "rpc-load-balancer/sdk";

// Gateway only
import { RpcGateway } from "rpc-load-balancer/gateway";
```

---

## License

MIT
