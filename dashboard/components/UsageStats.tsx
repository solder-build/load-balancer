'use client';

import { useEffect, useState } from 'react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

interface HourlyStats {
  hour: string;
  requests: number;
  errors: number;
  avgResponseTime: number;
}

interface MethodStats {
  method: string;
  count: number;
  percentage: number;
}

interface StatsData {
  timestamp: string;
  uptime: number;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageResponseTime: number;
  requestsPerSecond: number;
  hourlyStats: HourlyStats[];
  methodStats: MethodStats[];
  endpointDistribution: {
    loadBalancer: number;
    active: number;
    passive: number;
  };
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

export default function UsageStats() {
  const [data, setData] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const response = await fetch('/api/stats');

        if (!response.ok) {
          throw new Error('Failed to fetch stats');
        }

        const statsData = await response.json();
        setData(statsData);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, []);

  if (loading) {
    return (
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
        <div className="animate-pulse space-y-4">
          <div className="h-4 bg-gray-700 rounded w-1/4"></div>
          <div className="h-64 bg-gray-700 rounded"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-900/20 border border-red-500 rounded-lg p-6">
        <p className="text-red-200">Error loading stats: {error}</p>
      </div>
    );
  }

  if (!data) {
    return null;
  }

  const formatUptime = (seconds: number) => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${days}d ${hours}h ${minutes}m`;
  };

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <div className="text-sm text-gray-400 mb-1">Total Requests</div>
          <div className="text-3xl font-bold text-white">
            {data.totalRequests.toLocaleString()}
          </div>
        </div>
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <div className="text-sm text-gray-400 mb-1">Success Rate</div>
          <div className="text-3xl font-bold text-green-400">
            {((data.successfulRequests / data.totalRequests) * 100).toFixed(1)}%
          </div>
        </div>
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <div className="text-sm text-gray-400 mb-1">Avg Response Time</div>
          <div className="text-3xl font-bold text-white">{data.averageResponseTime}ms</div>
        </div>
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <div className="text-sm text-gray-400 mb-1">Uptime</div>
          <div className="text-2xl font-bold text-white">{formatUptime(data.uptime)}</div>
        </div>
      </div>

      {/* Requests Over Time Chart */}
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
        <h3 className="text-lg font-semibold text-white mb-4">Requests Over Time (24h)</h3>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={data.hourlyStats}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis
              dataKey="hour"
              stroke="#9ca3af"
              tickFormatter={(value) => new Date(value).toLocaleTimeString([], { hour: '2-digit' })}
            />
            <YAxis stroke="#9ca3af" />
            <Tooltip
              contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151' }}
              labelStyle={{ color: '#fff' }}
            />
            <Legend />
            <Line
              type="monotone"
              dataKey="requests"
              stroke="#3b82f6"
              strokeWidth={2}
              name="Requests"
            />
            <Line
              type="monotone"
              dataKey="errors"
              stroke="#ef4444"
              strokeWidth={2}
              name="Errors"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Method Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Method Bar Chart */}
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <h3 className="text-lg font-semibold text-white mb-4">Top RPC Methods</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data.methodStats}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="method" stroke="#9ca3af" angle={-45} textAnchor="end" height={100} />
              <YAxis stroke="#9ca3af" />
              <Tooltip
                contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151' }}
                labelStyle={{ color: '#fff' }}
              />
              <Bar dataKey="count" fill="#3b82f6" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Method Pie Chart */}
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <h3 className="text-lg font-semibold text-white mb-4">Method Distribution</h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={data.methodStats}
                dataKey="percentage"
                nameKey="method"
                cx="50%"
                cy="50%"
                outerRadius={100}
                label={(entry) => `${entry.method}: ${entry.percentage}%`}
              >
                {data.methodStats.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151' }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Response Time Chart */}
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
        <h3 className="text-lg font-semibold text-white mb-4">Average Response Time (24h)</h3>
        <ResponsiveContainer width="100%" height={250}>
          <LineChart data={data.hourlyStats}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis
              dataKey="hour"
              stroke="#9ca3af"
              tickFormatter={(value) => new Date(value).toLocaleTimeString([], { hour: '2-digit' })}
            />
            <YAxis stroke="#9ca3af" unit="ms" />
            <Tooltip
              contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151' }}
              labelStyle={{ color: '#fff' }}
            />
            <Line
              type="monotone"
              dataKey="avgResponseTime"
              stroke="#10b981"
              strokeWidth={2}
              name="Avg Response Time (ms)"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
