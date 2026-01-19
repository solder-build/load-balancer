import { createServer } from "node:http";
import type { IncomingMessage, Server, ServerResponse } from "node:http";
import { LoadBalancer } from "../sdk/loadBalancer.js";
import type { GatewayConfig, RouteStatus } from "./types.js";

interface InternalRoute {
  id: string;
  methods?: Set<string>;
  balancer: LoadBalancer;
}

const DEFAULT_MAX_BODY_BYTES = 1_000_000; // 1MB

/**
 * RPC Gateway - HTTP server that receives RPC requests and routes them
 * through load-balanced endpoints.
 *
 * @example
 * ```ts
 * const gateway = new RpcGateway({
 *   port: 8080,
 *   routes: [
 *     {
 *       id: "main",
 *       endpoints: ["https://rpc1.example.com", "https://rpc2.example.com"],
 *     },
 *   ],
 * });
 *
 * await gateway.start();
 * // RPC clients can now connect to http://localhost:8080
 * ```
 */
export class RpcGateway {
  private readonly config: GatewayConfig & { host: string; maxBodyBytes: number };
  private readonly routes: InternalRoute[];
  private server?: Server;

  constructor(config: GatewayConfig) {
    if (!config.routes.length) {
      throw new Error("RpcGateway requires at least one route.");
    }

    this.config = {
      ...config,
      host: config.host ?? "0.0.0.0",
      maxBodyBytes: config.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES,
    };

    this.routes = config.routes.map((route) => ({
      id: route.id,
      methods: route.methods ? new Set(route.methods) : undefined,
      balancer: new LoadBalancer(route.endpoints, route.options),
    }));
  }

  /**
   * Start the gateway server.
   */
  async start(): Promise<void> {
    if (this.server) {
      return;
    }

    this.server = createServer((req, res) => {
      void this.handleRequest(req, res);
    });

    await new Promise<void>((resolve, reject) => {
      this.server?.once("error", reject);
      this.server?.listen(this.config.port, this.config.host, () => {
        console.log(
          `RPC Gateway listening on http://${this.config.host}:${this.config.port}`,
        );
        resolve();
      });
    });
  }

  /**
   * Stop the gateway server.
   */
  async stop(): Promise<void> {
    if (!this.server) {
      return;
    }

    const server = this.server;
    this.server = undefined;

    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });

    console.log("RPC Gateway stopped.");
  }

  /**
   * Get status of all routes and their endpoints.
   */
  getStatus(): RouteStatus[] {
    return this.routes.map((route) => ({
      routeId: route.id,
      methods: route.methods ? Array.from(route.methods) : undefined,
      endpoints: route.balancer.getStatus(),
    }));
  }

  /**
   * Get a specific route's load balancer for direct access.
   */
  getBalancer(routeId: string): LoadBalancer | undefined {
    return this.routes.find((r) => r.id === routeId)?.balancer;
  }

  private async handleRequest(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    // Handle CORS
    if (this.applyCors(req, res)) {
      return;
    }

    // Only POST is supported for JSON-RPC
    if (req.method !== "POST") {
      res.writeHead(405, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "Only POST is supported." }));
      return;
    }

    // Read request body
    let rawBody: string;
    try {
      rawBody = await this.readBody(req);
    } catch {
      res.writeHead(413, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "Request body too large." }));
      return;
    }

    // Parse JSON
    let payload: unknown;
    try {
      payload = rawBody ? JSON.parse(rawBody) : null;
    } catch {
      this.sendJsonRpcError(res, null, -32700, "Parse error: Invalid JSON.");
      return;
    }

    // Extract methods from payload
    const methods = extractMethods(payload);
    if (!methods.length) {
      this.sendJsonRpcError(res, payload, -32600, "Invalid Request.");
      return;
    }

    // Check global method whitelist
    if (this.config.allowedMethods?.length) {
      const allowed = new Set(this.config.allowedMethods);
      const blocked = methods.find((m) => !allowed.has(m));
      if (blocked) {
        this.sendJsonRpcError(
          res,
          payload,
          -32601,
          `Method not allowed: ${blocked}`,
        );
        return;
      }
    }

    // Find matching route
    const route = this.findRoute(methods);
    if (!route) {
      this.sendJsonRpcError(res, payload, -32601, "Method not found.");
      return;
    }

    // Forward request to upstream
    const startTime = Date.now();

    try {
      const upstreamResponse = await route.balancer.fetch("http://upstream", {
        method: "POST",
        headers: this.filterRequestHeaders(req.headers),
        body: rawBody,
      });

      const duration = Date.now() - startTime;
      const endpoint = route.balancer.getLastUsedEndpoint();
      this.logRequest(methods, route.id, endpoint?.url, upstreamResponse.status, duration);

      res.writeHead(
        upstreamResponse.status,
        this.filterResponseHeaders(upstreamResponse.headers),
      );
      const body = Buffer.from(await upstreamResponse.arrayBuffer());
      res.end(body);
    } catch (error) {
      const duration = Date.now() - startTime;
      const endpoint = route.balancer.getLastUsedEndpoint();
      this.logRequest(methods, route.id, endpoint?.url, 502, duration, error);

      res.writeHead(502, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "Bad Gateway: Upstream request failed." }));
    }
  }

  private logRequest(
    methods: string[],
    routeId: string,
    endpointUrl: string | undefined,
    status: number,
    durationMs: number,
    error?: unknown,
  ): void {
    const timestamp = new Date().toISOString();
    const methodStr = methods.join(", ");
    const statusIcon = status >= 200 && status < 300 ? "✓" : "✗";
    const host = endpointUrl ? new URL(endpointUrl).host : "unknown";

    if (error) {
      console.log(
        `[${timestamp}] ${statusIcon} ${methodStr} → ${host} (${routeId}) ${status} ${durationMs}ms ERROR`,
      );
    } else {
      console.log(
        `[${timestamp}] ${statusIcon} ${methodStr} → ${host} (${routeId}) ${status} ${durationMs}ms`,
      );
    }
  }

  private findRoute(methods: string[]): InternalRoute | undefined {
    // First, try to find a route that explicitly handles all requested methods
    for (const route of this.routes) {
      if (!route.methods) {
        // Route handles all methods
        return route;
      }
      if (methods.every((m) => route.methods?.has(m))) {
        return route;
      }
    }

    // Fall back to default route if configured
    if (this.config.defaultRouteId) {
      return this.routes.find((r) => r.id === this.config.defaultRouteId);
    }

    return undefined;
  }

  private async readBody(req: IncomingMessage): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      let size = 0;
      const chunks: Buffer[] = [];

      req.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > this.config.maxBodyBytes) {
          reject(new Error("Body too large."));
          req.destroy();
          return;
        }
        chunks.push(chunk);
      });

      req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
      req.on("error", reject);
    });
  }

  private sendJsonRpcError(
    res: ServerResponse,
    payload: unknown,
    code: number,
    message: string,
  ): void {
    res.writeHead(200, { "content-type": "application/json" });

    const buildError = (p: unknown) => {
      const id =
        p && typeof p === "object" && "id" in p
          ? (p as { id?: unknown }).id
          : null;
      return { jsonrpc: "2.0", id: id ?? null, error: { code, message } };
    };

    if (Array.isArray(payload)) {
      res.end(JSON.stringify(payload.map(buildError)));
    } else {
      res.end(JSON.stringify(buildError(payload)));
    }
  }

  private applyCors(req: IncomingMessage, res: ServerResponse): boolean {
    const cors = this.config.cors;
    if (!cors) {
      return false;
    }

    const origin = req.headers.origin;
    const allowedOrigins = cors.allowedOrigins ?? ["*"];
    const allowOrigin =
      origin && allowedOrigins.includes(origin)
        ? origin
        : allowedOrigins[0] ?? "*";

    res.setHeader("Access-Control-Allow-Origin", allowOrigin);
    res.setHeader(
      "Access-Control-Allow-Methods",
      (cors.allowedMethods ?? ["POST", "OPTIONS"]).join(", "),
    );
    res.setHeader(
      "Access-Control-Allow-Headers",
      (cors.allowedHeaders ?? ["content-type"]).join(", "),
    );

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return true;
    }

    return false;
  }

  private filterRequestHeaders(
    headers: IncomingMessage["headers"],
  ): Record<string, string> {
    const result: Record<string, string> = {};
    const skip = new Set(["host", "content-length", "connection"]);

    for (const [key, value] of Object.entries(headers)) {
      if (!value || skip.has(key.toLowerCase())) {
        continue;
      }
      result[key] = Array.isArray(value) ? value.join(", ") : value;
    }

    return result;
  }

  private filterResponseHeaders(headers: Headers): Record<string, string> {
    const result: Record<string, string> = {};
    const skip = new Set([
      "content-length",
      "content-encoding",
      "transfer-encoding",
      "connection",
    ]);

    for (const [key, value] of headers.entries()) {
      if (!skip.has(key.toLowerCase())) {
        result[key] = value;
      }
    }

    return result;
  }
}

function extractMethods(payload: unknown): string[] {
  if (Array.isArray(payload)) {
    return payload
      .map((entry) =>
        entry && typeof entry === "object"
          ? (entry as { method?: unknown }).method
          : undefined,
      )
      .filter((m): m is string => typeof m === "string");
  }

  if (payload && typeof payload === "object") {
    const method = (payload as { method?: unknown }).method;
    return typeof method === "string" ? [method] : [];
  }

  return [];
}

