import { useState } from 'react'

function App() {
  const [score, setScore] = useState(0)

  return (
    <>
      {/* Retro Backgrounds */}
      <div className="arcade-bg" />
      <div className="grid-overlay" />
      <div className="crt-overlay" />

      {/* Main Content */}
      <div className="relative min-h-screen flex flex-col items-center justify-center p-8">
        {/* Header */}
        <header className="text-center mb-12 animate-float">
          <h1 className="text-2xl md:text-4xl font-arcade text-retro-cyan mb-4
                         drop-shadow-[3px_3px_0_#ff00ff]
                         animate-glow">
            🎮 VIRTUAL CLOSET ARCADE 🎮
          </h1>
          <p className="text-xs md:text-sm text-retro-pink">
            REACT + TYPESCRIPT + TAILWIND
          </p>
        </header>

        {/* Score Display */}
        <div className="bg-retro-purple border-4 border-retro-cyan p-6 mb-8 
                        shadow-[0_0_20px_rgba(0,217,255,0.5)]
                        hover:shadow-[0_0_30px_rgba(0,217,255,0.8)]
                        transition-all duration-300">
          <div className="text-center">
            <p className="text-xs text-retro-gray mb-2">SCORE</p>
            <p className="text-4xl text-retro-green font-arcade">{score}</p>
          </div>
        </div>

        {/* Start Button */}
        <button
          onClick={() => setScore(score + 100)}
          className="px-8 py-4 bg-gradient-to-r from-retro-pink to-retro-purple
                     border-4 border-retro-cyan text-retro-white font-arcade
                     text-sm uppercase shadow-[0_0_20px_rgba(0,217,255,0.5)]
                     hover:shadow-[0_0_30px_rgba(0,217,255,0.8)]
                     hover:scale-105 active:scale-95
                     transition-all duration-200
                     animate-glow"
        >
          START GAME
        </button>

        {/* Info */}
        <div className="mt-12 text-center max-w-2xl">
          <p className="text-xs text-retro-gray leading-relaxed">
            ✅ VITE + REACT + TYPESCRIPT<br />
            ✅ TAILWIND CSS + POSTCSS<br />
            ✅ ZUSTAND + IMMER + ZOD<br />
            ✅ RADIX UI + LUCIDE ICONS<br />
            ✅ @DND-KIT + CHART.JS<br />
            ✅ PWA + WORKBOX<br />
            ✅ VITEST + PLAYWRIGHT
          </p>
        </div>

        {/* Footer */}
        <footer className="absolute bottom-8 text-center">
          <p className="text-xs text-retro-gray">
            PRESS START TO BEGIN MIGRATION
          </p>
        </footer>
      </div>
    </>
  )
}

export default App
