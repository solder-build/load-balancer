import { NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';

const ENDPOINTS = [
  { id: 'load-balancer', name: 'Load Balancer', url: process.env.NEXT_PUBLIC_LOAD_BALANCER_URL },
  { id: 'active', name: 'Active Gateway', url: process.env.NEXT_PUBLIC_ACTIVE_GATEWAY_URL },
  { id: 'passive', name: 'Passive Gateway', url: process.env.NEXT_PUBLIC_PASSIVE_GATEWAY_URL },
];

interface HealthStatus {
  id: string;
  name: string;
  url: string;
  healthy: boolean;
  status: number | null;
  responseTime: number | null;
  blockNumber: number | null;
  error?: string;
}

async function checkEndpointHealth(endpoint: typeof ENDPOINTS[0]): Promise<HealthStatus> {
  const start = Date.now();

  try {
    // Check health endpoint
    const healthResponse = await fetch(`${endpoint.url}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    });

    const responseTime = Date.now() - start;

    if (!healthResponse.ok) {
      return {
        id: endpoint.id,
        name: endpoint.name,
        url: endpoint.url,
        healthy: false,
        status: healthResponse.status,
        responseTime,
        blockNumber: null,
        error: `HTTP ${healthResponse.status}`,
      };
    }

    // Try to get block number
    let blockNumber: number | null = null;
    try {
      const rpcResponse = await fetch(endpoint.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'starknet_blockNumber',
          params: [],
          id: 1,
        }),
        signal: AbortSignal.timeout(5000),
      });

      if (rpcResponse.ok) {
        const data = await rpcResponse.json();
        blockNumber = data.result || null;
      }
    } catch {
      // Ignore RPC errors, health check passed
    }

    return {
      id: endpoint.id,
      name: endpoint.name,
      url: endpoint.url,
      healthy: true,
      status: healthResponse.status,
      responseTime,
      blockNumber,
    };
  } catch (error) {
    return {
      id: endpoint.id,
      name: endpoint.name,
      url: endpoint.url,
      healthy: false,
      status: null,
      responseTime: Date.now() - start,
      blockNumber: null,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export async function GET() {
  const authenticated = await isAuthenticated();

  if (!authenticated) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const results = await Promise.all(ENDPOINTS.map(checkEndpointHealth));

  const summary = {
    total: results.length,
    healthy: results.filter(r => r.healthy).length,
    unhealthy: results.filter(r => !r.healthy).length,
  };

  return NextResponse.json({
    timestamp: new Date().toISOString(),
    summary,
    endpoints: results,
  });
}
