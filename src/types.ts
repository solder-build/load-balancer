export type EndpointConfig = {
  url: string;
  weight?: number;
  priority?: number;
  headers?: Record<string, string>;
  timeoutMs?: number;
};

export type LoadBalancerOptions = {
  failureThreshold?: number;
  minHealthy?: number;
};

export type EndpointStatus = {
  id: string;
  url: string;
  healthy: boolean;
  consecutiveFailures: number;
  lastLatencyMs?: number;
  lastError?: string;
};

export type SelectedEndpoint = {
  id: string;
  url: string;
  weight: number;
  priority: number;
  headers: Record<string, string>;
  timeoutMs?: number;
};

