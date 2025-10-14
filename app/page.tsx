/**
 * Main landing page
 * Redirects to the Vite frontend or shows API status
 */

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-pink-900 to-orange-900 flex items-center justify-center p-4">
      <div className="max-w-2xl w-full bg-black/40 backdrop-blur-lg rounded-lg p-8 text-white border border-pink-500/30 shadow-2xl">
        <div className="flex items-center justify-center mb-8">
          <div className="w-16 h-16 bg-gradient-to-br from-pink-500 to-purple-500 rounded-lg flex items-center justify-center text-3xl font-bold">
            👕
          </div>
        </div>

        <h1 className="text-4xl font-bold text-center mb-4 bg-gradient-to-r from-pink-400 via-purple-400 to-orange-400 bg-clip-text text-transparent">
          Virtual Closet Arcade
        </h1>

        <p className="text-center text-gray-300 mb-8">
          AI-Powered Clothing Inventory Tracker & Analytics
        </p>

        <div className="space-y-4">
          <div className="bg-white/10 rounded-lg p-4 border border-pink-500/20">
            <h2 className="text-lg font-semibold mb-2 flex items-center">
              <span className="w-2 h-2 bg-green-400 rounded-full mr-2"></span>
              API Status: Online
            </h2>
            <p className="text-sm text-gray-400">
              All systems operational
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white/10 rounded-lg p-4 border border-purple-500/20">
              <div className="text-2xl mb-2">📦</div>
              <h3 className="font-semibold text-sm">Smart Storage</h3>
              <p className="text-xs text-gray-400 mt-1">Track inventory & profits</p>
            </div>
            <div className="bg-white/10 rounded-lg p-4 border border-orange-500/20">
              <div className="text-2xl mb-2">🤖</div>
              <h3 className="font-semibold text-sm">AI Analysis</h3>
              <p className="text-xs text-gray-400 mt-1">Pricing & condition</p>
            </div>
            <div className="bg-white/10 rounded-lg p-4 border border-blue-500/20">
              <div className="text-2xl mb-2">🔍</div>
              <h3 className="font-semibold text-sm">Semantic Search</h3>
              <p className="text-xs text-gray-400 mt-1">Vector embeddings</p>
            </div>
            <div className="bg-white/10 rounded-lg p-4 border border-green-500/20">
              <div className="text-2xl mb-2">📊</div>
              <h3 className="font-semibold text-sm">Analytics</h3>
              <p className="text-xs text-gray-400 mt-1">Costs & metrics</p>
            </div>
          </div>

          <div className="bg-white/10 rounded-lg p-4 border border-purple-500/20">
            <h3 className="font-semibold mb-2">API Endpoints:</h3>
            <ul className="text-sm space-y-1 text-gray-300">
              <li>• <code className="bg-black/30 px-2 py-1 rounded text-xs">POST /api/auth/login</code> - Passwordless sign-in</li>
              <li>• <code className="bg-black/30 px-2 py-1 rounded text-xs">POST /api/aijobs</code> - Create AI job</li>
              <li>• <code className="bg-black/30 px-2 py-1 rounded text-xs">GET /api/aijobs</code> - List your jobs</li>
              <li>• <code className="bg-black/30 px-2 py-1 rounded text-xs">POST /api/aijobs/[id]/apply</code> - Apply AI suggestion</li>
            </ul>
          </div>

          <div className="flex gap-4">
            <a
              href="https://github.com/harrygag/closet"
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 bg-white/10 hover:bg-white/20 transition-colors rounded-lg p-3 text-center border border-white/20"
            >
              📖 Documentation
            </a>
            <a
              href="https://github.com/harrygag/closet"
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-600 hover:to-purple-600 transition-colors rounded-lg p-3 text-center font-semibold"
            >
              View on GitHub
            </a>
          </div>
        </div>

        <div className="mt-8 text-center text-sm text-gray-500">
          <p>Powered by Next.js + Prisma + OpenAI</p>
          <p className="mt-2">🤖 Built with Claude Code</p>
        </div>
      </div>
    </div>
  );
}
