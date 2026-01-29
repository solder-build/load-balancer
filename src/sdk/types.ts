/**
 * Configuration for a single RPC endpoint.
 */
export interface EndpointConfig {
  /** The URL of the RPC endpoint */
  url: string;
  /** Optional weight for weighted selection (default: 1) */
  weight?: number;
  /** Optional priority for priority-based selection (default: 0) */
  priority?: number;
  /** Optional headers to include with requests to this endpoint */
  headers?: Record<string, string>;
  /** Optional timeout in milliseconds */
  timeoutMs?: number;
  /** Optional whitelist of methods this endpoint handles (if set, only these methods are allowed) */
  methods?: string[];
  /** Optional blocklist of methods this endpoint should not handle */
  blockedMethods?: string[];
}

/**
 * Options for the LoadBalancer.
 */
export interface LoadBalancerOptions {
  /** Number of consecutive failures before marking unhealthy (default: 3) */
  failureThreshold?: number;
  /** Minimum healthy endpoints before falling back to all (default: 1) */
  minHealthy?: number;
}

/**
 * A selected endpoint with all configuration applied.
 */
export interface SelectedEndpoint {
  id: string;
  url: string;
  weight: number;
  priority: number;
  headers: Record<string, string>;
  timeoutMs?: number;
}

/**
 * Status information for an endpoint.
 */
export interface EndpointStatus {
  id: string;
  url: string;
  healthy: boolean;
  consecutiveFailures: number;
  lastLatencyMs?: number;
  lastError?: string;
}

