import type { EndpointConfig, EndpointStatus, LoadBalancerOptions, SelectedEndpoint } from "./types.js";
export declare class LoadBalancer {
    private readonly endpoints;
    private readonly options;
    private rrIndex;
    constructor(endpoints: Array<string | EndpointConfig>, options?: LoadBalancerOptions);
    getUrl(): string;
    getEndpoint(): SelectedEndpoint;
    getStatus(): EndpointStatus[];
    createFetch(): typeof fetch;
    fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
    requestJsonRpc<T>(payload: unknown, init?: RequestInit): Promise<T>;
    markHealthy(urlOrId: string): void;
    markUnhealthy(urlOrId: string, reason?: string): void;
    private normalizeEndpoint;
    private selectEndpoint;
    private selectRoundRobin;
    private applyEndpointToRequest;
    private markSuccess;
    private markFailure;
    private findEndpoint;
}
//# sourceMappingURL=loadBalancer.d.ts.map