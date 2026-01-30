import type {
  AlertCallback,
  EndpointConfig,
  LoadBalancerOptions,
} from "../sdk/types.js";

/**
 * Configuration for a route in the gateway.
 * Each route maps specific RPC methods to a set of endpoints.
 */
export interface RouteConfig {
  /** Unique identifier for this route */
  id: string;
  /** RPC endpoints for this route */
  endpoints: Array<string | EndpointConfig>;
  /** Optional: specific methods this route handles. If omitted, handles all methods. */
  methods?: string[];
  /** Optional: load balancer options for this route */
  options?: LoadBalancerOptions;
}

/**
 * CORS configuration for the gateway.
 */
export interface CorsConfig {
  /** Allowed origins (default: ["*"]) */
  allowedOrigins?: string[];
  /** Allowed methods (default: ["POST", "OPTIONS"]) */
  allowedMethods?: string[];
  /** Allowed headers (default: ["content-type"]) */
  allowedHeaders?: string[];
}

/**
 * Telegram alert configuration for the gateway.
 */
export interface TelegramConfig {
  /** Telegram bot token */
  botToken: string;
  /** Telegram chat ID to send alerts to */
  chatId: string;
}

/**
 * Configuration for the RPC Gateway.
 */
export interface GatewayConfig {
  /** Port to listen on */
  port: number;
  /** Host to bind to (default: "0.0.0.0") */
  host?: string;
  /** Routes configuration - requests are matched to routes by method */
  routes: RouteConfig[];
  /** Optional: default route ID to use when no route matches */
  defaultRouteId?: string;
  /** Optional: global whitelist of allowed methods */
  allowedMethods?: string[];
  /** Optional: CORS configuration */
  cors?: CorsConfig;
  /** Optional: max request body size in bytes (default: 1MB) */
  maxBodyBytes?: number;
  /** Optional: Telegram alert configuration */
  telegram?: TelegramConfig;
  /** Optional: custom alert callback (overrides telegram if both provided) */
  onEndpointUnhealthy?: AlertCallback;
}

/**
 * Status of a route including all endpoint statuses.
 */
export interface RouteStatus {
  routeId: string;
  methods?: string[];
  endpoints: Array<{
    id: string;
    url: string;
    healthy: boolean;
    consecutiveFailures: number;
    lastLatencyMs?: number;
    lastError?: string;
  }>;
}

