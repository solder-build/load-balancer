'use client';

import { useEffect, useState } from 'react';

interface EndpointHealth {
  id: string;
  name: string;
  url: string;
  healthy: boolean;
  status: number | null;
  responseTime: number | null;
  blockNumber: number | null;
  error?: string;
}

interface HealthData {
  timestamp: string;
  summary: {
    total: number;
    healthy: number;
    unhealthy: number;
  };
  endpoints: EndpointHealth[];
}

export default function HealthStatus() {
  const [data, setData] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchHealth = async () => {
      try {
        const response = await fetch('/api/health');

        if (!response.ok) {
          throw new Error('Failed to fetch health data');
        }

        const healthData = await response.json();
        setData(healthData);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };

    fetchHealth();
  }, []);

  if (loading) {
    return (
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
        <div className="animate-pulse space-y-4">
          <div className="h-4 bg-gray-700 rounded w-1/4"></div>
          <div className="space-y-3">
            <div className="h-20 bg-gray-700 rounded"></div>
            <div className="h-20 bg-gray-700 rounded"></div>
            <div className="h-20 bg-gray-700 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-900/20 border border-red-500 rounded-lg p-6">
        <p className="text-red-200">Error loading health data: {error}</p>
      </div>
    );
  }

  if (!data) {
    return null;
  }

  const getStatusBadge = (healthy: boolean) => {
    if (healthy) {
      return (
        <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-green-900/50 text-green-200 border border-green-500">
          ● Healthy
        </span>
      );
    }
    return (
      <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-red-900/50 text-red-200 border border-red-500">
        ● Unhealthy
      </span>
    );
  };

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <div className="text-sm text-gray-400 mb-1">Total Endpoints</div>
          <div className="text-3xl font-bold text-white">{data.summary.total}</div>
        </div>
        <div className="bg-green-900/20 border-green-500/50 rounded-lg p-6 border">
          <div className="text-sm text-green-400 mb-1">Healthy</div>
          <div className="text-3xl font-bold text-green-200">{data.summary.healthy}</div>
        </div>
        <div className="bg-red-900/20 border-red-500/50 rounded-lg p-6 border">
          <div className="text-sm text-red-400 mb-1">Unhealthy</div>
          <div className="text-3xl font-bold text-red-200">{data.summary.unhealthy}</div>
        </div>
      </div>

      {/* Endpoint Details */}
      <div className="space-y-4">
        {data.endpoints.map((endpoint) => (
          <div
            key={endpoint.id}
            className="bg-gray-800 rounded-lg p-6 border border-gray-700"
          >
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="text-lg font-semibold text-white mb-1">
                  {endpoint.name}
                </h3>
                <p className="text-sm text-gray-400 font-mono">{endpoint.url}</p>
              </div>
              {getStatusBadge(endpoint.healthy)}
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <div className="text-xs text-gray-400 mb-1">HTTP Status</div>
                <div className="text-sm font-medium text-white">
                  {endpoint.status || 'N/A'}
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-400 mb-1">Response Time</div>
                <div className="text-sm font-medium text-white">
                  {endpoint.responseTime ? `${endpoint.responseTime}ms` : 'N/A'}
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-400 mb-1">Block Number</div>
                <div className="text-sm font-medium text-white">
                  {endpoint.blockNumber ? `#${endpoint.blockNumber}` : 'N/A'}
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-400 mb-1">Status</div>
                <div className="text-sm font-medium text-white">
                  {endpoint.healthy ? '✓ Online' : '✗ Offline'}
                </div>
              </div>
            </div>

            {endpoint.error && (
              <div className="mt-4 p-3 bg-red-900/20 border border-red-500/50 rounded">
                <p className="text-sm text-red-200">Error: {endpoint.error}</p>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
