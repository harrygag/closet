'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

interface User {
  id: string;
  email: string;
  name: string | null;
  role: string;
  createdAt: string;
  lastLoginAt: string | null;
}

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchUser();
  }, []);

  const fetchUser = async () => {
    try {
      const response = await fetch('/api/auth/me');

      if (!response.ok) {
        router.push('/login');
        return;
      }

      const data = await response.json();
      setUser(data.user);
    } catch (error) {
      console.error('Failed to fetch user:', error);
      router.push('/login');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      router.push('/login');
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-pink-900 to-orange-900 flex items-center justify-center">
        <div className="text-white text-xl">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-pink-900 to-orange-900 p-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="bg-black/40 backdrop-blur-lg rounded-2xl p-6 mb-6 border border-white/20">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-pink-400 via-purple-400 to-orange-400 bg-clip-text text-transparent mb-2">
                Virtual Closet Arcade
              </h1>
              <p className="text-gray-300 text-sm">
                Welcome back, {user.email}!
              </p>
            </div>
            <button
              onClick={handleLogout}
              className="px-4 py-2 bg-red-500/20 border border-red-500/50 text-red-200 rounded-lg hover:bg-red-500/30 transition"
            >
              Logout
            </button>
          </div>
        </div>

        {/* User Info Card */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
          <div className="bg-black/40 backdrop-blur-lg rounded-xl p-6 border border-white/20">
            <div className="text-gray-400 text-sm mb-1">User ID</div>
            <div className="text-white font-mono text-xs break-all">{user.id}</div>
          </div>
          <div className="bg-black/40 backdrop-blur-lg rounded-xl p-6 border border-white/20">
            <div className="text-gray-400 text-sm mb-1">Role</div>
            <div className="text-pink-400 font-semibold text-lg">{user.role}</div>
          </div>
          <div className="bg-black/40 backdrop-blur-lg rounded-xl p-6 border border-white/20">
            <div className="text-gray-400 text-sm mb-1">Last Login</div>
            <div className="text-white text-sm">
              {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : 'First login!'}
            </div>
          </div>
        </div>

        {/* Available Features */}
        <div className="bg-black/40 backdrop-blur-lg rounded-2xl p-6 border border-white/20">
          <h2 className="text-2xl font-bold text-white mb-6">Available Features</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Inventory Tracking */}
            <div className="p-6 bg-gradient-to-br from-purple-500/20 to-pink-500/20 border border-purple-500/30 rounded-xl">
              <div className="text-2xl mb-3">📦</div>
              <h3 className="text-white font-semibold text-lg mb-2">Inventory Tracking</h3>
              <p className="text-gray-300 text-sm mb-4">
                Track your clothing items with purchase dates, costs, and sold prices
              </p>
              <div className="text-purple-400 text-sm font-medium">
                Smart storage & analytics
              </div>
            </div>

            {/* AI-Powered Analysis */}
            <a
              href="/api/aijobs"
              className="p-6 bg-gradient-to-br from-orange-500/20 to-yellow-500/20 border border-orange-500/30 rounded-xl hover:border-orange-400/50 transition"
            >
              <div className="text-2xl mb-3">🤖</div>
              <h3 className="text-white font-semibold text-lg mb-2">AI Analysis</h3>
              <p className="text-gray-300 text-sm mb-4">
                AI-powered pricing, condition grading, and brand normalization
              </p>
              <div className="text-orange-400 text-sm font-medium">
                POST /api/aijobs →
              </div>
            </a>

            {/* Semantic Search */}
            <div className="p-6 bg-gradient-to-br from-blue-500/20 to-cyan-500/20 border border-blue-500/30 rounded-xl">
              <div className="text-2xl mb-3">🔍</div>
              <h3 className="text-white font-semibold text-lg mb-2">Semantic Search</h3>
              <p className="text-gray-300 text-sm mb-4">
                Vector embeddings for finding similar items and smart recommendations
              </p>
              <div className="text-blue-400 text-sm font-medium">
                Powered by pgvector
              </div>
            </div>

            {/* Linear MCP */}
            <div className="p-6 bg-gradient-to-br from-green-500/20 to-emerald-500/20 border border-green-500/30 rounded-xl">
              <div className="text-2xl mb-3">📋</div>
              <h3 className="text-white font-semibold text-lg mb-2">Linear MCP Integration</h3>
              <p className="text-gray-300 text-sm mb-4">
                Human-in-the-loop review workflow for AI suggestions that need approval
              </p>
              <div className="text-green-400 text-sm font-medium">
                Configured
              </div>
            </div>
          </div>
        </div>

        {/* API Endpoints */}
        <div className="mt-6 bg-black/40 backdrop-blur-lg rounded-2xl p-6 border border-white/20">
          <h2 className="text-2xl font-bold text-white mb-4">API Endpoints</h2>

          <div className="space-y-2 font-mono text-sm">
            <div className="flex items-center gap-3 p-3 bg-white/5 rounded-lg">
              <span className="text-green-400 font-semibold">POST</span>
              <span className="text-gray-300">/api/auth/login</span>
              <span className="text-gray-500 text-xs">- Request magic link</span>
            </div>
            <div className="flex items-center gap-3 p-3 bg-white/5 rounded-lg">
              <span className="text-blue-400 font-semibold">GET</span>
              <span className="text-gray-300">/api/auth/verify</span>
              <span className="text-gray-500 text-xs">- Verify magic link token</span>
            </div>
            <div className="flex items-center gap-3 p-3 bg-white/5 rounded-lg">
              <span className="text-blue-400 font-semibold">GET</span>
              <span className="text-gray-300">/api/auth/me</span>
              <span className="text-gray-500 text-xs">- Get current user</span>
            </div>
            <div className="flex items-center gap-3 p-3 bg-white/5 rounded-lg">
              <span className="text-red-400 font-semibold">POST</span>
              <span className="text-gray-300">/api/auth/logout</span>
              <span className="text-gray-500 text-xs">- Logout current session</span>
            </div>
            <div className="flex items-center gap-3 p-3 bg-white/5 rounded-lg">
              <span className="text-green-400 font-semibold">POST</span>
              <span className="text-gray-300">/api/aijobs</span>
              <span className="text-gray-500 text-xs">- Create AI job</span>
            </div>
            <div className="flex items-center gap-3 p-3 bg-white/5 rounded-lg">
              <span className="text-blue-400 font-semibold">GET</span>
              <span className="text-gray-300">/api/aijobs</span>
              <span className="text-gray-500 text-xs">- List your AI jobs</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
