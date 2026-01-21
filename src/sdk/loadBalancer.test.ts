import { jest, describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import { LoadBalancer } from "./loadBalancer.js";

// Type for mock fetch
type MockFetch = jest.Mock<typeof fetch>;

describe("LoadBalancer", () => {
  describe("constructor", () => {
    it("should throw if no endpoints provided", () => {
      expect(() => new LoadBalancer([])).toThrow(
        "LoadBalancer requires at least one endpoint."
      );
    });

    it("should accept string endpoints", () => {
      const lb = new LoadBalancer(["https://rpc1.example.com"]);
      expect(lb.getUrl()).toBe("https://rpc1.example.com");
    });

    it("should accept endpoint config objects", () => {
      const lb = new LoadBalancer([
        { url: "https://rpc1.example.com", weight: 2 },
      ]);
      expect(lb.getUrl()).toBe("https://rpc1.example.com");
    });

    it("should throw if endpoint config has no url", () => {
      expect(() => new LoadBalancer([{ url: "" }])).toThrow(
        "Endpoint must include a url."
      );
    });

    it("should accept custom options", () => {
      const lb = new LoadBalancer(["https://rpc1.example.com"], {
        failureThreshold: 5,
        minHealthy: 2,
      });
      expect(lb.getStatus()[0].healthy).toBe(true);
    });
  });

  describe("getUrl", () => {
    it("should return endpoint URL", () => {
      const lb = new LoadBalancer(["https://rpc1.example.com"]);
      expect(lb.getUrl()).toBe("https://rpc1.example.com");
    });

    it("should round-robin across endpoints", () => {
      const lb = new LoadBalancer([
        "https://rpc1.example.com",
        "https://rpc2.example.com",
        "https://rpc3.example.com",
      ]);

      expect(lb.getUrl()).toBe("https://rpc1.example.com");
      expect(lb.getUrl()).toBe("https://rpc2.example.com");
      expect(lb.getUrl()).toBe("https://rpc3.example.com");
      expect(lb.getUrl()).toBe("https://rpc1.example.com");
    });
  });

  describe("getEndpoint", () => {
    it("should return full endpoint configuration", () => {
      const lb = new LoadBalancer([
        {
          url: "https://rpc1.example.com",
          weight: 2,
          priority: 1,
          headers: { Authorization: "Bearer token" },
          timeoutMs: 5000,
        },
      ]);

      const endpoint = lb.getEndpoint();
      expect(endpoint).toEqual({
        id: "endpoint-0",
        url: "https://rpc1.example.com",
        weight: 2,
        priority: 1,
        headers: { Authorization: "Bearer token" },
        timeoutMs: 5000,
      });
    });

    it("should apply default values", () => {
      const lb = new LoadBalancer(["https://rpc1.example.com"]);
      const endpoint = lb.getEndpoint();

      expect(endpoint.weight).toBe(1);
      expect(endpoint.priority).toBe(0);
      expect(endpoint.headers).toEqual({});
      expect(endpoint.timeoutMs).toBeUndefined();
    });
  });

  describe("getStatus", () => {
    it("should return status for all endpoints", () => {
      const lb = new LoadBalancer([
        "https://rpc1.example.com",
        "https://rpc2.example.com",
      ]);

      const status = lb.getStatus();
      expect(status).toHaveLength(2);
      expect(status[0]).toEqual({
        id: "endpoint-0",
        url: "https://rpc1.example.com",
        healthy: true,
        consecutiveFailures: 0,
        lastLatencyMs: undefined,
        lastError: undefined,
      });
    });
  });

  describe("markHealthy / markUnhealthy", () => {
    it("should mark endpoint unhealthy by URL", () => {
      const lb = new LoadBalancer(["https://rpc1.example.com"]);
      lb.markUnhealthy("https://rpc1.example.com", "Test error");

      const status = lb.getStatus()[0];
      expect(status.healthy).toBe(false);
      expect(status.lastError).toBe("Test error");
    });

    it("should mark endpoint unhealthy by ID", () => {
      const lb = new LoadBalancer(["https://rpc1.example.com"]);
      lb.markUnhealthy("endpoint-0");

      expect(lb.getStatus()[0].healthy).toBe(false);
    });

    it("should mark endpoint healthy and reset failures", () => {
      const lb = new LoadBalancer(["https://rpc1.example.com"]);
      lb.markUnhealthy("endpoint-0", "Error");
      lb.markHealthy("endpoint-0");

      const status = lb.getStatus()[0];
      expect(status.healthy).toBe(true);
      expect(status.consecutiveFailures).toBe(0);
      expect(status.lastError).toBeUndefined();
    });

    it("should do nothing for non-existent endpoint", () => {
      const lb = new LoadBalancer(["https://rpc1.example.com"]);
      lb.markUnhealthy("non-existent");
      expect(lb.getStatus()[0].healthy).toBe(true);
    });
  });

  describe("health-based selection", () => {
    it("should skip unhealthy endpoints", () => {
      const lb = new LoadBalancer([
        "https://rpc1.example.com",
        "https://rpc2.example.com",
      ]);

      lb.markUnhealthy("endpoint-0");

      // Should always return the healthy endpoint
      expect(lb.getUrl()).toBe("https://rpc2.example.com");
      expect(lb.getUrl()).toBe("https://rpc2.example.com");
    });

    it("should fall back to unhealthy if no healthy endpoints", () => {
      const lb = new LoadBalancer(["https://rpc1.example.com"]);
      lb.markUnhealthy("endpoint-0");

      expect(lb.getUrl()).toBe("https://rpc1.example.com");
    });

    it("should respect minHealthy threshold", () => {
      const lb = new LoadBalancer(
        ["https://rpc1.example.com", "https://rpc2.example.com"],
        { minHealthy: 2 }
      );

      lb.markUnhealthy("endpoint-0");

      // With minHealthy=2, only 1 healthy, so falls back to all
      const urls = [lb.getUrl(), lb.getUrl()];
      expect(urls).toContain("https://rpc1.example.com");
      expect(urls).toContain("https://rpc2.example.com");
    });
  });

  describe("fetch", () => {
    let originalFetch: typeof globalThis.fetch;
    let mockFetch: MockFetch;

    beforeEach(() => {
      originalFetch = globalThis.fetch;
      mockFetch = jest.fn() as MockFetch;
    });

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    it("should make request to selected endpoint", async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ result: "ok" }), { status: 200 })
      );
      globalThis.fetch = mockFetch as typeof fetch;

      const lb = new LoadBalancer(["https://rpc1.example.com"]);
      const response = await lb.fetch("http://ignored", {
        method: "POST",
        body: JSON.stringify({ method: "getSlot" }),
      });

      expect(mockFetch).toHaveBeenCalledWith(
        "https://rpc1.example.com",
        expect.objectContaining({ method: "POST" })
      );
      expect(response.status).toBe(200);
    });

    it("should merge endpoint headers with request headers", async () => {
      mockFetch.mockResolvedValue(new Response("{}", { status: 200 }));
      globalThis.fetch = mockFetch as typeof fetch;

      const lb = new LoadBalancer([
        {
          url: "https://rpc1.example.com",
          headers: { "X-Api-Key": "secret" },
        },
      ]);

      await lb.fetch("http://ignored", {
        headers: { "Content-Type": "application/json" },
      });

      const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      const headers = init.headers as Headers;
      expect(headers.get("X-Api-Key")).toBe("secret");
      expect(headers.get("Content-Type")).toBe("application/json");
    });

    it("should track latency on success", async () => {
      mockFetch.mockResolvedValue(new Response("{}", { status: 200 }));
      globalThis.fetch = mockFetch as typeof fetch;

      const lb = new LoadBalancer(["https://rpc1.example.com"]);
      await lb.fetch("http://ignored");

      const status = lb.getStatus()[0];
      expect(status.lastLatencyMs).toBeDefined();
      expect(status.healthy).toBe(true);
    });

    it("should mark failure on non-ok response", async () => {
      mockFetch.mockResolvedValue(new Response("{}", { status: 500 }));
      globalThis.fetch = mockFetch as typeof fetch;

      const lb = new LoadBalancer(["https://rpc1.example.com"]);
      await lb.fetch("http://ignored");

      const status = lb.getStatus()[0];
      expect(status.consecutiveFailures).toBe(1);
      expect(status.lastError).toBe("HTTP 500");
    });

    it("should mark unhealthy after threshold failures", async () => {
      mockFetch.mockResolvedValue(new Response("{}", { status: 500 }));
      globalThis.fetch = mockFetch as typeof fetch;

      const lb = new LoadBalancer(["https://rpc1.example.com"], {
        failureThreshold: 3,
      });

      await lb.fetch("http://ignored");
      await lb.fetch("http://ignored");
      expect(lb.getStatus()[0].healthy).toBe(true);

      await lb.fetch("http://ignored");
      expect(lb.getStatus()[0].healthy).toBe(false);
    });

    it("should throw and mark failure on network error", async () => {
      mockFetch.mockRejectedValue(new Error("Network error"));
      globalThis.fetch = mockFetch as typeof fetch;

      const lb = new LoadBalancer(["https://rpc1.example.com"]);

      await expect(lb.fetch("http://ignored")).rejects.toThrow("Network error");

      const status = lb.getStatus()[0];
      expect(status.consecutiveFailures).toBe(1);
      expect(status.lastError).toBe("Network error");
    });

    it("should set lastUsedEndpoint after fetch", async () => {
      mockFetch.mockResolvedValue(new Response("{}", { status: 200 }));
      globalThis.fetch = mockFetch as typeof fetch;

      const lb = new LoadBalancer(["https://rpc1.example.com"]);
      expect(lb.getLastUsedEndpoint()).toBeUndefined();

      await lb.fetch("http://ignored");

      const lastUsed = lb.getLastUsedEndpoint();
      expect(lastUsed).toBeDefined();
      expect(lastUsed?.url).toBe("https://rpc1.example.com");
    });
  });

  describe("request", () => {
    let originalFetch: typeof globalThis.fetch;
    let mockFetch: MockFetch;

    beforeEach(() => {
      originalFetch = globalThis.fetch;
      mockFetch = jest.fn() as MockFetch;
    });

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    it("should make JSON-RPC request and return parsed response", async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: 12345 }), {
          status: 200,
        })
      );
      globalThis.fetch = mockFetch as typeof fetch;

      const lb = new LoadBalancer(["https://rpc1.example.com"]);
      const result = await lb.request<{ result: number }>({
        jsonrpc: "2.0",
        id: 1,
        method: "getSlot",
      });

      expect(result.result).toBe(12345);

      const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(init.method).toBe("POST");
      expect((init.headers as Headers).get("content-type")).toBe(
        "application/json"
      );
    });
  });

  describe("createFetch", () => {
    let originalFetch: typeof globalThis.fetch;
    let mockFetch: MockFetch;

    beforeEach(() => {
      originalFetch = globalThis.fetch;
      mockFetch = jest.fn() as MockFetch;
    });

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    it("should return a fetch function bound to load balancer", async () => {
      mockFetch.mockResolvedValue(new Response("{}", { status: 200 }));
      globalThis.fetch = mockFetch as typeof fetch;

      const lb = new LoadBalancer(["https://rpc1.example.com"]);
      const customFetch = lb.createFetch();

      await customFetch("http://ignored");

      expect(mockFetch).toHaveBeenCalledWith(
        "https://rpc1.example.com",
        expect.anything()
      );
    });
  });

  describe("timeout handling", () => {
    let originalFetch: typeof globalThis.fetch;
    let mockFetch: MockFetch;

    beforeEach(() => {
      originalFetch = globalThis.fetch;
      mockFetch = jest.fn() as MockFetch;
    });

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    it("should apply timeout from endpoint config", async () => {
      mockFetch.mockImplementation(async (_url, init) => {
        // Check that signal is provided
        expect((init as RequestInit).signal).toBeDefined();
        return new Response("{}", { status: 200 });
      });
      globalThis.fetch = mockFetch as typeof fetch;

      const lb = new LoadBalancer([
        { url: "https://rpc1.example.com", timeoutMs: 1000 },
      ]);

      await lb.fetch("http://ignored");

      expect(mockFetch).toHaveBeenCalled();
    });
  });
});
