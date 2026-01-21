import { describe, it, expect, beforeAll, afterAll, afterEach } from "@jest/globals";
import { RpcGateway } from "./server.js";
import { createServer, type Server } from "node:http";

// Helper to make HTTP requests
async function makeRequest(
  port: number,
  options: {
    method?: string;
    body?: unknown;
    headers?: Record<string, string>;
  } = {}
): Promise<{ status: number; body: unknown; headers: Record<string, string> }> {
  const response = await fetch(`http://127.0.0.1:${port}`, {
    method: options.method ?? "POST",
    headers: {
      "content-type": "application/json",
      ...options.headers,
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const headers: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    headers[key] = value;
  });

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    body = await response.text();
  }

  return { status: response.status, body, headers };
}

describe("RpcGateway", () => {
  describe("constructor", () => {
    it("should throw if no routes provided", () => {
      expect(
        () =>
          new RpcGateway({
            port: 9000,
            routes: [],
          })
      ).toThrow("RpcGateway requires at least one route.");
    });

    it("should accept valid configuration", () => {
      const gateway = new RpcGateway({
        port: 9000,
        routes: [
          {
            id: "default",
            endpoints: ["https://rpc.example.com"],
          },
        ],
      });
      expect(gateway).toBeInstanceOf(RpcGateway);
    });

    it("should accept custom host and maxBodyBytes", () => {
      const gateway = new RpcGateway({
        port: 9000,
        host: "127.0.0.1",
        maxBodyBytes: 500000,
        routes: [
          {
            id: "default",
            endpoints: ["https://rpc.example.com"],
          },
        ],
      });
      expect(gateway).toBeInstanceOf(RpcGateway);
    });
  });

  describe("getStatus", () => {
    it("should return status of all routes", () => {
      const gateway = new RpcGateway({
        port: 9000,
        routes: [
          {
            id: "main",
            endpoints: ["https://rpc1.example.com", "https://rpc2.example.com"],
          },
          {
            id: "heavy",
            methods: ["getProgramAccounts"],
            endpoints: ["https://heavy.example.com"],
          },
        ],
      });

      const status = gateway.getStatus();
      expect(status).toHaveLength(2);

      expect(status[0].routeId).toBe("main");
      expect(status[0].methods).toBeUndefined();
      expect(status[0].endpoints).toHaveLength(2);

      expect(status[1].routeId).toBe("heavy");
      expect(status[1].methods).toEqual(["getProgramAccounts"]);
      expect(status[1].endpoints).toHaveLength(1);
    });
  });

  describe("getBalancer", () => {
    it("should return load balancer for existing route", () => {
      const gateway = new RpcGateway({
        port: 9000,
        routes: [
          {
            id: "main",
            endpoints: ["https://rpc1.example.com"],
          },
        ],
      });

      const balancer = gateway.getBalancer("main");
      expect(balancer).toBeDefined();
      expect(balancer?.getUrl()).toBe("https://rpc1.example.com");
    });

    it("should return undefined for non-existent route", () => {
      const gateway = new RpcGateway({
        port: 9000,
        routes: [
          {
            id: "main",
            endpoints: ["https://rpc1.example.com"],
          },
        ],
      });

      expect(gateway.getBalancer("non-existent")).toBeUndefined();
    });
  });

  describe("start / stop", () => {
    let gateway: RpcGateway;
    const testPort = 19001;

    afterEach(async () => {
      try {
        await gateway?.stop();
      } catch {
        // Ignore
      }
    });

    it("should start and stop the server", async () => {
      gateway = new RpcGateway({
        port: testPort,
        host: "127.0.0.1",
        routes: [
          {
            id: "default",
            endpoints: ["https://rpc.example.com"],
          },
        ],
      });

      await gateway.start();

      // Server should be running
      const response = await fetch(`http://127.0.0.1:${testPort}`, {
        method: "OPTIONS",
      });
      expect(response.status).toBe(405); // No CORS configured

      await gateway.stop();

      // Server should be stopped - wait a bit for port to be released
      await new Promise((r) => setTimeout(r, 100));
      await expect(
        fetch(`http://127.0.0.1:${testPort}`)
      ).rejects.toThrow();
    }, 15000);

    it("should be idempotent for start", async () => {
      gateway = new RpcGateway({
        port: testPort,
        host: "127.0.0.1",
        routes: [
          {
            id: "default",
            endpoints: ["https://rpc.example.com"],
          },
        ],
      });

      await gateway.start();
      await gateway.start(); // Should not throw

      await gateway.stop();
    });

    it("should be idempotent for stop", async () => {
      gateway = new RpcGateway({
        port: testPort,
        host: "127.0.0.1",
        routes: [
          {
            id: "default",
            endpoints: ["https://rpc.example.com"],
          },
        ],
      });

      await gateway.start();
      await gateway.stop();
      await gateway.stop(); // Should not throw
    });
  });

  describe("HTTP handling", () => {
    let gateway: RpcGateway;
    let mockServer: Server;
    let mockServerPort: number;
    let gatewayPort: number;

    beforeAll(async () => {
      // Create a mock upstream server
      mockServerPort = 19100;
      mockServer = createServer((req, res) => {
        let body = "";
        req.on("data", (chunk) => (body += chunk));
        req.on("end", () => {
          const payload = JSON.parse(body);
          if (Array.isArray(payload)) {
            res.writeHead(200, { "content-type": "application/json" });
            res.end(
              JSON.stringify(
                payload.map((p: { id: number; method: string }) => ({
                  jsonrpc: "2.0",
                  id: p.id,
                  result: `mock-${p.method}`,
                }))
              )
            );
          } else {
            res.writeHead(200, { "content-type": "application/json" });
            res.end(
              JSON.stringify({
                jsonrpc: "2.0",
                id: payload.id,
                result: `mock-${payload.method}`,
              })
            );
          }
        });
      });

      await new Promise<void>((resolve) => {
        mockServer.listen(mockServerPort, "127.0.0.1", resolve);
      });

      // Create gateway pointing to mock server
      gatewayPort = 19101;
      gateway = new RpcGateway({
        port: gatewayPort,
        host: "127.0.0.1",
        routes: [
          {
            id: "default",
            endpoints: [`http://127.0.0.1:${mockServerPort}`],
          },
        ],
      });

      await gateway.start();
    });

    afterAll(async () => {
      await gateway.stop();
      await new Promise<void>((resolve, reject) => {
        mockServer.close((err) => (err ? reject(err) : resolve()));
      });
    });

    it("should reject non-POST requests", async () => {
      const response = await fetch(`http://127.0.0.1:${gatewayPort}`, {
        method: "GET",
      });

      expect(response.status).toBe(405);
      const body = await response.json();
      expect(body.error).toBe("Only POST is supported.");
    });

    it("should handle valid JSON-RPC request", async () => {
      const { status, body } = await makeRequest(gatewayPort, {
        body: { jsonrpc: "2.0", id: 1, method: "getSlot" },
      });

      expect(status).toBe(200);
      expect(body).toEqual({
        jsonrpc: "2.0",
        id: 1,
        result: "mock-getSlot",
      });
    });

    it("should handle batch requests", async () => {
      const { status, body } = await makeRequest(gatewayPort, {
        body: [
          { jsonrpc: "2.0", id: 1, method: "getSlot" },
          { jsonrpc: "2.0", id: 2, method: "getBlockHeight" },
        ],
      });

      expect(status).toBe(200);
      expect(body).toEqual([
        { jsonrpc: "2.0", id: 1, result: "mock-getSlot" },
        { jsonrpc: "2.0", id: 2, result: "mock-getBlockHeight" },
      ]);
    });

    it("should return parse error for invalid JSON", async () => {
      const response = await fetch(`http://127.0.0.1:${gatewayPort}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{ invalid json",
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.error.code).toBe(-32700);
      expect(body.error.message).toContain("Parse error");
    });

    it("should return invalid request for missing method", async () => {
      const { status, body } = await makeRequest(gatewayPort, {
        body: { jsonrpc: "2.0", id: 1 },
      });

      expect(status).toBe(200);
      expect((body as { error: { code: number } }).error.code).toBe(-32600);
    });
  });

  describe("CORS handling", () => {
    let gateway: RpcGateway;
    let testPort = 19200; // Use different port range to avoid conflicts

    afterEach(async () => {
      await gateway?.stop();
    });

    it("should handle OPTIONS preflight with CORS enabled", async () => {
      gateway = new RpcGateway({
        port: testPort,
        host: "127.0.0.1",
        cors: {
          allowedOrigins: ["https://example.com"],
          allowedMethods: ["POST"],
          allowedHeaders: ["content-type", "x-custom-header"],
        },
        routes: [
          {
            id: "default",
            endpoints: ["https://rpc.example.com"],
          },
        ],
      });

      await gateway.start();

      const response = await fetch(`http://127.0.0.1:${testPort}`, {
        method: "OPTIONS",
        headers: { Origin: "https://example.com" },
      });

      expect(response.status).toBe(204);
      expect(response.headers.get("access-control-allow-origin")).toBe(
        "https://example.com"
      );
      expect(response.headers.get("access-control-allow-methods")).toBe("POST");
      expect(response.headers.get("access-control-allow-headers")).toBe(
        "content-type, x-custom-header"
      );
    });

    it("should set CORS headers on normal requests", async () => {
      testPort = 19201; // Use unique port
      gateway = new RpcGateway({
        port: testPort,
        host: "127.0.0.1",
        cors: {
          allowedOrigins: ["*"],
        },
        routes: [
          {
            id: "default",
            endpoints: ["https://rpc.example.com"],
          },
        ],
      });

      await gateway.start();

      // This will fail upstream but we can still check CORS headers
      const response = await fetch(`http://127.0.0.1:${testPort}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Origin: "https://example.com",
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getSlot" }),
      });

      expect(response.headers.get("access-control-allow-origin")).toBe("*");
    }, 10000);
  });

  describe("method whitelist", () => {
    let gateway: RpcGateway;
    let mockServer: Server;
    const mockPort = 19103;
    const testPort = 19104;

    beforeAll(async () => {
      mockServer = createServer((req, res) => {
        let body = "";
        req.on("data", (chunk) => (body += chunk));
        req.on("end", () => {
          const payload = JSON.parse(body);
          res.writeHead(200, { "content-type": "application/json" });
          res.end(
            JSON.stringify({
              jsonrpc: "2.0",
              id: payload.id,
              result: "ok",
            })
          );
        });
      });

      await new Promise<void>((resolve) => {
        mockServer.listen(mockPort, "127.0.0.1", resolve);
      });
    });

    afterAll(async () => {
      await new Promise<void>((resolve, reject) => {
        mockServer.close((err) => (err ? reject(err) : resolve()));
      });
    });

    afterEach(async () => {
      await gateway?.stop();
    });

    it("should allow whitelisted methods", async () => {
      gateway = new RpcGateway({
        port: testPort,
        host: "127.0.0.1",
        allowedMethods: ["getSlot", "getBlockHeight"],
        routes: [
          {
            id: "default",
            endpoints: [`http://127.0.0.1:${mockPort}`],
          },
        ],
      });

      await gateway.start();

      const { status, body } = await makeRequest(testPort, {
        body: { jsonrpc: "2.0", id: 1, method: "getSlot" },
      });

      expect(status).toBe(200);
      expect((body as { result: string }).result).toBe("ok");
    });

    it("should reject non-whitelisted methods", async () => {
      const uniquePort = 19204; // Use unique port
      gateway = new RpcGateway({
        port: uniquePort,
        host: "127.0.0.1",
        allowedMethods: ["getSlot"],
        routes: [
          {
            id: "default",
            endpoints: [`http://127.0.0.1:${mockPort}`],
          },
        ],
      });

      await gateway.start();

      const { status, body } = await makeRequest(uniquePort, {
        body: { jsonrpc: "2.0", id: 1, method: "getProgramAccounts" },
      });

      expect(status).toBe(200);
      expect((body as { error: { code: number; message: string } }).error.code).toBe(-32601);
      expect((body as { error: { message: string } }).error.message).toContain(
        "Method not allowed"
      );
    });
  });

  describe("method-based routing", () => {
    let gateway: RpcGateway;
    let mockServer1: Server;
    let mockServer2: Server;
    const mockPort1 = 19305;
    const mockPort2 = 19306;
    let testPort = 19307;

    beforeAll(async () => {
      // Server 1 - marks responses with "server1"
      mockServer1 = createServer((req, res) => {
        let body = "";
        req.on("data", (chunk) => (body += chunk));
        req.on("end", () => {
          const payload = JSON.parse(body);
          res.writeHead(200, { "content-type": "application/json" });
          res.end(
            JSON.stringify({
              jsonrpc: "2.0",
              id: payload.id,
              result: "server1",
            })
          );
        });
      });

      // Server 2 - marks responses with "server2"
      mockServer2 = createServer((req, res) => {
        let body = "";
        req.on("data", (chunk) => (body += chunk));
        req.on("end", () => {
          const payload = JSON.parse(body);
          res.writeHead(200, { "content-type": "application/json" });
          res.end(
            JSON.stringify({
              jsonrpc: "2.0",
              id: payload.id,
              result: "server2",
            })
          );
        });
      });

      await Promise.all([
        new Promise<void>((resolve) =>
          mockServer1.listen(mockPort1, "127.0.0.1", resolve)
        ),
        new Promise<void>((resolve) =>
          mockServer2.listen(mockPort2, "127.0.0.1", resolve)
        ),
      ]);
    });

    afterAll(async () => {
      await Promise.all([
        new Promise<void>((resolve, reject) =>
          mockServer1.close((err) => (err ? reject(err) : resolve()))
        ),
        new Promise<void>((resolve, reject) =>
          mockServer2.close((err) => (err ? reject(err) : resolve()))
        ),
      ]);
    });

    afterEach(async () => {
      await gateway?.stop();
    });

    it("should route methods to specific routes", async () => {
      gateway = new RpcGateway({
        port: testPort,
        host: "127.0.0.1",
        routes: [
          {
            id: "heavy",
            methods: ["getProgramAccounts"],
            endpoints: [`http://127.0.0.1:${mockPort1}`],
          },
          {
            id: "default",
            endpoints: [`http://127.0.0.1:${mockPort2}`],
          },
        ],
      });

      await gateway.start();

      // Heavy method should go to server1
      const heavy = await makeRequest(testPort, {
        body: { jsonrpc: "2.0", id: 1, method: "getProgramAccounts" },
      });
      expect((heavy.body as { result: string }).result).toBe("server1");

      // Other methods should go to default (server2)
      const other = await makeRequest(testPort, {
        body: { jsonrpc: "2.0", id: 2, method: "getSlot" },
      });
      expect((other.body as { result: string }).result).toBe("server2");
    });

    it("should use defaultRouteId when no route matches", async () => {
      testPort = 19308; // Use unique port
      gateway = new RpcGateway({
        port: testPort,
        host: "127.0.0.1",
        defaultRouteId: "fallback",
        routes: [
          {
            id: "specific",
            methods: ["getSlot"],
            endpoints: [`http://127.0.0.1:${mockPort1}`],
          },
          {
            id: "fallback",
            methods: ["getBlockHeight"], // Only handles getBlockHeight
            endpoints: [`http://127.0.0.1:${mockPort2}`],
          },
        ],
      });

      await gateway.start();

      // Unknown method falls back to fallback route
      const result = await makeRequest(testPort, {
        body: { jsonrpc: "2.0", id: 1, method: "unknownMethod" },
      });
      expect((result.body as { result: string }).result).toBe("server2");
    });

    it("should return method not found when no route matches and no default", async () => {
      testPort = 19309; // Use unique port
      gateway = new RpcGateway({
        port: testPort,
        host: "127.0.0.1",
        routes: [
          {
            id: "specific",
            methods: ["getSlot"],
            endpoints: [`http://127.0.0.1:${mockPort1}`],
          },
        ],
      });

      await gateway.start();

      const result = await makeRequest(testPort, {
        body: { jsonrpc: "2.0", id: 1, method: "unknownMethod" },
      });
      expect((result.body as { error: { code: number } }).error.code).toBe(-32601);
    });
  });
});

