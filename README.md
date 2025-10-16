# 🎮 Virtual Closet Arcade - React Edition

Modern React + TypeScript rebuild of the Virtual Closet Arcade inventory management system.

## 🚀 Tech Stack

- **Build:** Vite + @vitejs/plugin-react-swc
- **Framework:** React 18.3 + TypeScript 5.3 (strict mode)
- **Styling:** Tailwind CSS + PostCSS + Autoprefixer
- **State:** Zustand + Immer
- **Validation:** Zod
- **Database:** idb (IndexedDB)
- **UI Components:** Radix UI
- **Icons:** Lucide React
- **DnD:** @dnd-kit
- **Charts:** Chart.js
- **PWA:** vite-plugin-pwa + Workbox
- **Testing:** Vitest + Playwright
- **Linting:** ESLint + Prettier + Husky

## 📦 Installation

```bash
npm install
```

## 🔧 Development

```bash
npm run dev          # Start dev server (http://localhost:5173)
npm run build        # Production build
npm run preview      # Preview production build
npm run typecheck    # TypeScript type checking
npm run lint         # Run ESLint
npm run lint:fix     # Fix ESLint errors
npm run format       # Format with Prettier
```

## 🧪 Testing

```bash
npm run test         # Run unit tests
npm run test:ui      # Vitest UI
npm run test:coverage # Coverage report
npm run e2e          # Run E2E tests
npm run e2e:ui       # Playwright UI
```

## 🚀 Deployment

### Vercel (Recommended)

1. Push to GitHub
2. Import project in Vercel
3. Deploy automatically

Or use Vercel CLI:

```bash
npm install -g vercel
vercel
```

### Build Settings

- **Build Command:** `npm run build`
- **Output Directory:** `dist`
- **Install Command:** `npm install`

## 🎨 Features

- ✅ Retro arcade aesthetic with Tailwind
- ✅ TypeScript strict mode
- ✅ PWA support
- ✅ Offline-first with IndexedDB
- ✅ Drag-and-drop functionality
- ✅ Chart.js analytics
- ✅ Radix UI components
- ✅ Full test coverage

## 📁 Project Structure

```
src/
├── components/      # React components
├── features/        # Feature modules
├── hooks/           # Custom hooks
├── lib/             # Utilities
├── services/        # Business logic
├── store/           # Zustand stores
├── types/           # TypeScript types
└── workers/         # Web Workers
```

## 🔄 Migration Status

- [x] Phase 1: Project setup
- [ ] Phase 2: TypeScript types
- [ ] Phase 3: Core services
- [ ] Phase 4: State management
- [ ] Phase 5: UI components
- [ ] Phase 6: Feature components
- [ ] Phase 7: Advanced features
- [ ] Phase 8: PWA & performance
- [ ] Phase 9: Testing
- [ ] Phase 10: Polish & deploy

## 📝 License

Private - All rights reserved
