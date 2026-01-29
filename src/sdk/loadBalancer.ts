import type {
  EndpointConfig,
  EndpointStatus,
  LoadBalancerOptions,
  SelectedEndpoint,
} from "./types.js";

type InternalEndpoint = SelectedEndpoint & {
  consecutiveFailures: number;
  healthy: boolean;
  lastLatencyMs?: number;
  lastError?: string;
  methods?: Set<string>;
  blockedMethods?: Set<string>;
};

const DEFAULT_OPTIONS: Required<LoadBalancerOptions> = {
  failureThreshold: 3,
  minHealthy: 1,
};

/**
 * LoadBalancer distributes requests across multiple RPC endpoints
 * with health tracking and automatic failover.
 */
export class LoadBalancer {
  private readonly endpoints: InternalEndpoint[];
  private readonly options: Required<LoadBalancerOptions>;
  private rrIndex = 0;
  private _lastUsedEndpoint?: SelectedEndpoint;

  constructor(
    endpoints: Array<string | EndpointConfig>,
    options?: LoadBalancerOptions,
  ) {
    if (!endpoints.length) {
      throw new Error("LoadBalancer requires at least one endpoint.");
    }

    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.endpoints = endpoints.map((endpoint, index) =>
      this.normalizeEndpoint(endpoint, index),
    );
  }

  /**
   * Get the next URL using round-robin selection.
   */
  getUrl(): string {
    return this.selectEndpoint().url;
  }

  /**
   * Get the next endpoint with full configuration.
   */
  getEndpoint(): SelectedEndpoint {
    const endpoint = this.selectEndpoint();
    return {
      id: endpoint.id,
      url: endpoint.url,
      weight: endpoint.weight,
      priority: endpoint.priority,
      headers: { ...endpoint.headers },
      timeoutMs: endpoint.timeoutMs,
    };
  }

  /**
   * Get status of all endpoints.
   */
  getStatus(): EndpointStatus[] {
    return this.endpoints.map((endpoint) => ({
      id: endpoint.id,
      url: endpoint.url,
      healthy: endpoint.healthy,
      consecutiveFailures: endpoint.consecutiveFailures,
      lastLatencyMs: endpoint.lastLatencyMs,
      lastError: endpoint.lastError,
    }));
  }

  /**
   * Create a fetch function bound to this load balancer.
   */
  createFetch(): typeof fetch {
    return (input: RequestInfo | URL, init?: RequestInit) => {
      return this.fetch(input, init);
    };
  }

  /**
   * Get the last endpoint used by fetch() or request().
   */
  getLastUsedEndpoint(): SelectedEndpoint | undefined {
    return this._lastUsedEndpoint;
  }

  /**
   * Make a fetch request through the load balancer.
   * The input URL is ignored; the selected endpoint URL is used instead.
   * @param input - Request input (URL is ignored)
   * @param init - Request init options
   * @param methods - Optional array of RPC methods to filter endpoints by
   */
  async fetch(
    input: RequestInfo | URL,
    init?: RequestInit,
    methods?: string[],
  ): Promise<Response> {
    const endpoint = this.selectEndpoint(methods);
    this._lastUsedEndpoint = {
      id: endpoint.id,
      url: endpoint.url,
      weight: endpoint.weight,
      priority: endpoint.priority,
      headers: { ...endpoint.headers },
      timeoutMs: endpoint.timeoutMs,
    };
    const { url, requestInit } = this.buildRequest(endpoint, input, init);
    const start = Date.now();

    try {
      const response = await fetch(url, requestInit);
      if (response.ok) {
        this.markSuccess(endpoint, Date.now() - start);
      } else {
        endpoint.lastLatencyMs = Date.now() - start;
        this.markFailure(endpoint, `HTTP ${response.status}`);
      }
      return response;
    } catch (error) {
      this.markFailure(
        endpoint,
        error instanceof Error ? error.message : "Unknown error",
      );
      throw error;
    }
  }

  /**
   * Make a JSON-RPC request through the load balancer.
   */
  async request<T>(payload: unknown, init?: RequestInit): Promise<T> {
    const response = await this.fetch("http://localhost", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(init?.headers ? normalizeHeaders(init.headers) : {}),
      },
      body: JSON.stringify(payload),
      ...init,
    });

    return (await response.json()) as T;
  }

  /**
   * Manually mark an endpoint as healthy.
   */
  markHealthy(urlOrId: string): void {
    const endpoint = this.findEndpoint(urlOrId);
    if (!endpoint) return;
    endpoint.healthy = true;
    endpoint.consecutiveFailures = 0;
    endpoint.lastError = undefined;
  }

  /**
   * Manually mark an endpoint as unhealthy.
   */
  markUnhealthy(urlOrId: string, reason?: string): void {
    const endpoint = this.findEndpoint(urlOrId);
    if (!endpoint) return;
    endpoint.healthy = false;
    endpoint.lastError = reason;
  }

  private normalizeEndpoint(
    endpoint: string | EndpointConfig,
    index: number,
  ): InternalEndpoint {
    const config = typeof endpoint === "string" ? { url: endpoint } : endpoint;
    if (!config.url) {
      throw new Error("Endpoint must include a url.");
    }

    return {
      id: `endpoint-${index}`,
      url: config.url,
      weight: config.weight ?? 1,
      priority: config.priority ?? 0,
      headers: config.headers ?? {},
      timeoutMs: config.timeoutMs,
      consecutiveFailures: 0,
      healthy: true,
      methods: config.methods ? new Set(config.methods) : undefined,
      blockedMethods: config.blockedMethods ? new Set(config.blockedMethods) : undefined,
    };
  }

  private selectEndpoint(methods?: string[]): InternalEndpoint {
    let candidates = this.endpoints;

    // Filter by method whitelist/blocklist if methods are specified
    if (methods?.length) {
      candidates = candidates.filter((e) => this.endpointSupportsMethod(e, methods));
    }

    // Filter by health
    const healthy = candidates.filter((e) => e.healthy);
    const pool =
      healthy.length >= this.options.minHealthy ? healthy : candidates;

    if (!pool.length) {
      // Fall back to all endpoints if no candidates match
      const fallback = this.endpoints.filter((e) => e.healthy);
      return this.selectRoundRobin(fallback.length ? fallback : this.endpoints);
    }

    return this.selectRoundRobin(pool);
  }

  private endpointSupportsMethod(endpoint: InternalEndpoint, methods: string[]): boolean {
    // Check blocklist first
    if (endpoint.blockedMethods) {
      if (methods.some((m) => endpoint.blockedMethods?.has(m))) {
        return false;
      }
    }

    // Check whitelist
    if (endpoint.methods) {
      return methods.every((m) => endpoint.methods?.has(m));
    }

    return true;
  }

  private selectRoundRobin(pool: InternalEndpoint[]): InternalEndpoint {
    if (!pool.length) {
      throw new Error("No endpoints available.");
    }
    const endpoint = pool[this.rrIndex % pool.length];
    this.rrIndex = (this.rrIndex + 1) % pool.length;
    return endpoint;
  }

  private buildRequest(
    endpoint: InternalEndpoint,
    input: RequestInfo | URL,
    init?: RequestInit,
  ): { url: string; requestInit: RequestInit } {
    const request = input instanceof Request ? input.clone() : undefined;
    const inputHeaders = request?.headers;
    const initHeaders = init?.headers;

    const headers = new Headers();

    if (inputHeaders) {
      for (const [key, value] of inputHeaders.entries()) {
        headers.set(key, value);
      }
    }

    if (initHeaders) {
      for (const [key, value] of Object.entries(normalizeHeaders(initHeaders))) {
        headers.set(key, value);
      }
    }

    for (const [key, value] of Object.entries(endpoint.headers)) {
      headers.set(key, value);
    }

    const requestInit: RequestInit = {
      method: init?.method ?? request?.method ?? "POST",
      headers,
      body: init?.body ?? request?.body ?? undefined,
      redirect: init?.redirect ?? request?.redirect,
      signal: init?.signal ?? request?.signal,
    };

    if (endpoint.timeoutMs) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), endpoint.timeoutMs);
      requestInit.signal = controller.signal;

      const originalSignal = init?.signal ?? request?.signal;
      if (originalSignal) {
        originalSignal.addEventListener("abort", () => controller.abort(), {
          once: true,
        });
      }

      requestInit.signal.addEventListener("abort", () => clearTimeout(timeout), {
        once: true,
      });
    }

    return { url: endpoint.url, requestInit };
  }

  private markSuccess(endpoint: InternalEndpoint, latencyMs?: number): void {
    endpoint.consecutiveFailures = 0;
    endpoint.healthy = true;
    endpoint.lastError = undefined;
    if (latencyMs !== undefined) {
      endpoint.lastLatencyMs = latencyMs;
    }
  }

  private markFailure(endpoint: InternalEndpoint, reason?: string): void {
    endpoint.consecutiveFailures += 1;
    endpoint.lastError = reason;
    if (endpoint.consecutiveFailures >= this.options.failureThreshold) {
      endpoint.healthy = false;
    }
  }

  private findEndpoint(urlOrId: string): InternalEndpoint | undefined {
    return this.endpoints.find(
      (e) => e.id === urlOrId || e.url === urlOrId,
    );
  }
}

function normalizeHeaders(headers: HeadersInit): Record<string, string> {
  if (headers instanceof Headers) {
    return Object.fromEntries(headers.entries());
  }
  if (Array.isArray(headers)) {
    return Object.fromEntries(headers);
  }
  return headers;
}

