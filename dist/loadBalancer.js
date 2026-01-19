const DEFAULT_OPTIONS = {
    failureThreshold: 3,
    minHealthy: 1,
};
export class LoadBalancer {
    endpoints;
    options;
    rrIndex = 0;
    constructor(endpoints, options) {
        if (!endpoints.length) {
            throw new Error("LoadBalancer requires at least one endpoint.");
        }
        this.options = { ...DEFAULT_OPTIONS, ...options };
        this.endpoints = endpoints.map((endpoint, index) => this.normalizeEndpoint(endpoint, index));
    }
    getUrl() {
        return this.selectEndpoint().url;
    }
    getEndpoint() {
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
    getStatus() {
        return this.endpoints.map((endpoint) => ({
            id: endpoint.id,
            url: endpoint.url,
            healthy: endpoint.healthy,
            consecutiveFailures: endpoint.consecutiveFailures,
            lastLatencyMs: endpoint.lastLatencyMs,
            lastError: endpoint.lastError,
        }));
    }
    createFetch() {
        return (input, init) => {
            return this.fetch(input, init);
        };
    }
    async fetch(input, init) {
        const endpoint = this.selectEndpoint();
        const { url, requestInit } = this.applyEndpointToRequest(endpoint, input, init);
        const start = Date.now();
        try {
            const response = await fetch(url, requestInit);
            this.markSuccess(endpoint, Date.now() - start);
            if (!response.ok) {
                this.markFailure(endpoint, `HTTP ${response.status}`);
            }
            return response;
        }
        catch (error) {
            this.markFailure(endpoint, error instanceof Error ? error.message : "Unknown error");
            throw error;
        }
    }
    async requestJsonRpc(payload, init) {
        const response = await this.fetch(this.getUrl(), {
            method: "POST",
            headers: {
                "content-type": "application/json",
                ...(init?.headers ? normalizeHeaders(init.headers) : {}),
            },
            body: JSON.stringify(payload),
            ...init,
        });
        const data = (await response.json());
        return data;
    }
    markHealthy(urlOrId) {
        const endpoint = this.findEndpoint(urlOrId);
        if (!endpoint) {
            return;
        }
        endpoint.healthy = true;
        endpoint.consecutiveFailures = 0;
        endpoint.lastError = undefined;
    }
    markUnhealthy(urlOrId, reason) {
        const endpoint = this.findEndpoint(urlOrId);
        if (!endpoint) {
            return;
        }
        endpoint.healthy = false;
        endpoint.lastError = reason;
    }
    normalizeEndpoint(endpoint, index) {
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
        };
    }
    selectEndpoint() {
        const healthy = this.endpoints.filter((endpoint) => endpoint.healthy);
        const pool = healthy.length >= this.options.minHealthy ? healthy : this.endpoints;
        return this.selectRoundRobin(pool);
    }
    selectRoundRobin(pool) {
        if (!pool.length) {
            throw new Error("No endpoints available.");
        }
        const endpoint = pool[this.rrIndex % pool.length];
        this.rrIndex = (this.rrIndex + 1) % pool.length;
        return endpoint;
    }
    applyEndpointToRequest(endpoint, input, init) {
        const request = input instanceof Request ? input.clone() : undefined;
        const inputHeaders = request ? request.headers : undefined;
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
        const requestInit = {
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
    markSuccess(endpoint, latencyMs) {
        endpoint.consecutiveFailures = 0;
        endpoint.healthy = true;
        endpoint.lastError = undefined;
        if (latencyMs !== undefined) {
            endpoint.lastLatencyMs = latencyMs;
        }
    }
    markFailure(endpoint, reason) {
        endpoint.consecutiveFailures += 1;
        endpoint.lastError = reason;
        if (endpoint.consecutiveFailures >= this.options.failureThreshold) {
            endpoint.healthy = false;
        }
    }
    findEndpoint(urlOrId) {
        return this.endpoints.find((endpoint) => endpoint.id === urlOrId || endpoint.url === urlOrId);
    }
}
function normalizeHeaders(headers) {
    if (headers instanceof Headers) {
        return Object.fromEntries(headers.entries());
    }
    if (Array.isArray(headers)) {
        return Object.fromEntries(headers);
    }
    return headers;
}
//# sourceMappingURL=loadBalancer.js.map