'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const searchParams = useSearchParams();
  const errorParam = searchParams.get('error');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          redirectTo: searchParams.get('redirectTo') || '/dashboard',
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setSent(true);
      } else {
        setError(data.error || 'Failed to send magic link');
      }
    } catch (err) {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const getErrorMessage = () => {
    switch (errorParam) {
      case 'missing_token':
        return 'No authentication token provided.';
      case 'invalid_token':
        return 'Invalid or expired magic link.';
      case 'token_already_used':
        return 'This magic link has already been used.';
      case 'token_expired':
        return 'This magic link has expired. Please request a new one.';
      case 'server_error':
        return 'Server error. Please try again.';
      default:
        return null;
    }
  };

  const errorMessage = error || getErrorMessage();

  if (sent) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-pink-900 to-orange-900 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-black/40 backdrop-blur-lg rounded-2xl p-8 text-center border border-white/20">
          <div className="mb-6">
            <div className="mx-auto w-20 h-20 bg-gradient-to-br from-green-400 to-emerald-500 rounded-full flex items-center justify-center">
              <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
          </div>

          <h2 className="text-2xl font-bold text-white mb-4">
            Check your email!
          </h2>

          <p className="text-gray-300 mb-2">
            We've sent a magic link to:
          </p>

          <p className="text-pink-400 font-semibold text-lg mb-6">
            {email}
          </p>

          <p className="text-gray-400 text-sm mb-8">
            Click the link in the email to sign in. The link expires in 15 minutes.
          </p>

          <button
            onClick={() => {
              setSent(false);
              setEmail('');
            }}
            className="text-pink-400 hover:text-pink-300 underline text-sm"
          >
            Send to a different email
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-pink-900 to-orange-900 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-black/40 backdrop-blur-lg rounded-2xl p-8 border border-white/20">
        {/* Logo/Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-pink-400 via-purple-400 to-orange-400 bg-clip-text text-transparent mb-2">
            Virtual Closet Arcade
          </h1>
          <p className="text-gray-300 text-sm">
            AI-Powered Multi-Marketplace Reselling
          </p>
        </div>

        {/* Error Message */}
        {errorMessage && (
          <div className="mb-6 p-4 bg-red-500/20 border border-red-500/50 rounded-lg text-red-200 text-sm">
            {errorMessage}
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-2">
              Email address
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="you@example.com"
              className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-transparent"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 px-4 bg-gradient-to-r from-pink-500 via-purple-500 to-orange-500 text-white font-semibold rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Sending...' : 'Send Magic Link'}
          </button>
        </form>

        {/* Info */}
        <div className="mt-8 p-4 bg-white/5 rounded-lg border border-white/10">
          <h3 className="text-sm font-semibold text-white mb-2">
            🔐 Passwordless Sign-In
          </h3>
          <p className="text-xs text-gray-400 leading-relaxed">
            No password needed! We'll send you a secure magic link to sign in.
            The link works once and expires after 15 minutes.
          </p>
        </div>

        {/* Features List */}
        <div className="mt-6 space-y-2 text-xs text-gray-400">
          <div className="flex items-center gap-2">
            <span className="text-green-400">✓</span>
            <span>AI-powered pricing & condition grading</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-green-400">✓</span>
            <span>Smart inventory tracking & analytics</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-green-400">✓</span>
            <span>Semantic search with vector embeddings</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-green-400">✓</span>
            <span>Mobile-first design</span>
          </div>
        </div>
      </div>
    </div>
  );
}
