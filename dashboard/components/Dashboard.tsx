'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import HealthStatus from './HealthStatus';
import UsageStats from './UsageStats';

export default function Dashboard() {
  const router = useRouter();
  const [refreshInterval, setRefreshInterval] = useState(30); // seconds
  const [lastRefresh, setLastRefresh] = useState(Date.now());

  const handleLogout = async () => {
    await fetch('/api/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  };

  useEffect(() => {
    const interval = setInterval(() => {
      setLastRefresh(Date.now());
    }, refreshInterval * 1000);

    return () => clearInterval(interval);
  }, [refreshInterval]);

  return (
    <div className="min-h-screen bg-gray-900">
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold text-white">
                Starknet RPC Monitor
              </h1>
              <p className="text-sm text-gray-400 mt-1">
                Real-time health and usage monitoring
              </p>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-400">Refresh:</label>
                <select
                  value={refreshInterval}
                  onChange={(e) => setRefreshInterval(Number(e.target.value))}
                  className="bg-gray-700 text-white text-sm rounded px-3 py-1.5 border border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value={10}>10s</option>
                  <option value={30}>30s</option>
                  <option value={60}>1m</option>
                  <option value={300}>5m</option>
                </select>
              </div>
              <button
                onClick={handleLogout}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm rounded transition-colors"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="space-y-8">
          {/* Health Status Section */}
          <section>
            <h2 className="text-xl font-semibold text-white mb-4">
              Health Status
            </h2>
            <HealthStatus key={lastRefresh} />
          </section>

          {/* Usage Statistics Section */}
          <section>
            <h2 className="text-xl font-semibold text-white mb-4">
              Usage Statistics
            </h2>
            <UsageStats key={lastRefresh} />
          </section>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-gray-800 border-t border-gray-700 mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <p className="text-center text-sm text-gray-400">
            Last updated: {new Date(lastRefresh).toLocaleString()}
          </p>
        </div>
      </footer>
    </div>
  );
}
