import { NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';

// Mock stats for now - in production, this would query actual metrics
export async function GET() {
  const authenticated = await isAuthenticated();

  if (!authenticated) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Generate mock stats - replace with actual metrics from logs/database
  const now = Date.now();
  const hourlyStats = Array.from({ length: 24 }, (_, i) => ({
    hour: new Date(now - (23 - i) * 60 * 60 * 1000).toISOString(),
    requests: Math.floor(Math.random() * 1000) + 100,
    errors: Math.floor(Math.random() * 50),
    avgResponseTime: Math.floor(Math.random() * 500) + 100,
  }));

  const methodStats = [
    { method: 'starknet_blockNumber', count: 1234, percentage: 35 },
    { method: 'starknet_getBlockWithTxHashes', count: 856, percentage: 24 },
    { method: 'starknet_call', count: 645, percentage: 18 },
    { method: 'starknet_getTransactionReceipt', count: 423, percentage: 12 },
    { method: 'starknet_estimateFee', count: 245, percentage: 7 },
    { method: 'others', count: 142, percentage: 4 },
  ];

  const stats = {
    timestamp: new Date().toISOString(),
    uptime: 123456, // seconds
    totalRequests: 3545,
    successfulRequests: 3412,
    failedRequests: 133,
    averageResponseTime: 245, // ms
    requestsPerSecond: 1.2,
    hourlyStats,
    methodStats,
    endpointDistribution: {
      loadBalancer: 100,
      active: 45,
      passive: 55,
    },
  };

  return NextResponse.json(stats);
}
