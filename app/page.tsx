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
          AI-Powered Clothing Reseller Platform
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

          <div className="bg-white/10 rounded-lg p-4 border border-purple-500/20">
            <h3 className="font-semibold mb-2">Available Endpoints:</h3>
            <ul className="text-sm space-y-1 text-gray-300">
              <li>• <code className="bg-black/30 px-2 py-1 rounded">POST /api/aijobs</code> - Create AI job</li>
              <li>• <code className="bg-black/30 px-2 py-1 rounded">GET /api/aijobs</code> - List jobs</li>
              <li>• <code className="bg-black/30 px-2 py-1 rounded">POST /api/aijobs/process</code> - Process jobs</li>
              <li>• <code className="bg-black/30 px-2 py-1 rounded">POST /api/aijobs/[id]/apply</code> - Apply suggestion</li>
            </ul>
          </div>

          <div className="bg-gradient-to-r from-pink-500/20 to-purple-500/20 rounded-lg p-4 border border-pink-500/30">
            <h3 className="font-semibold mb-2">🚀 Features:</h3>
            <ul className="text-sm space-y-1 text-gray-300">
              <li>✅ AI-powered normalization</li>
              <li>✅ Smart price suggestions</li>
              <li>✅ Condition grading</li>
              <li>✅ Marketplace publishing (10 platforms)</li>
              <li>✅ Linear MCP integration</li>
              <li>✅ OpenAI GPT-4o-mini</li>
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
