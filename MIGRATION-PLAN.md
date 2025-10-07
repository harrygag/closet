# Virtual Closet Arcade - React/TypeScript Migration Plan

## 🎯 Project Overview

**Current:** Vanilla JS + HTML + CSS
**Target:** Vite + React + TypeScript + Tailwind + Modern Stack

## 📦 Complete Tech Stack

### Core
- **Build:** Vite + @vitejs/plugin-react-swc
- **Lang:** TypeScript (strict mode)
- **Router:** react-router-dom
- **State:** Zustand + Immer
- **Forms:** Zod validation + controlled inputs

### Styling
- **CSS:** TailwindCSS + PostCSS + Autoprefixer
- **UI:** @radix-ui/react primitives
- **Icons:** lucide-react
- **Theme:** Retro arcade aesthetic maintained

### Data & Storage
- **Client DB:** idb (IndexedDB wrapper)
- **Preferences:** localStorage
- **Dates:** date-fns
- **Recurrence:** rrule (optional)

### Workers & PWA
- **Web Workers:** Via Vite bundling
- **PWA:** vite-plugin-pwa (Workbox)
- **Crypto:** Web Crypto API
- **Files:** File System Access API / OPFS

### UX Utilities
- **DnD:** @dnd-kit/core
- **Command:** cmdk (optional)
- **Charts:** chart.js

### Testing & Quality
- **Unit:** Vitest + @testing-library/react
- **E2E:** Playwright
- **Lint:** ESLint + Prettier
- **Hooks:** Husky + lint-staged

## 🗂️ New Project Structure

```
closet-react/
├── public/
│   ├── icons/
│   └── manifest.json
├── src/
│   ├── assets/
│   │   └── styles/
│   │       └── globals.css
│   ├── components/
│   │   ├── ui/              # Radix UI wrappers
│   │   ├── layout/          # Header, Nav, etc.
│   │   ├── items/           # Item cards, grid
│   │   ├── modals/          # Item modal, view modal
│   │   └── closet/          # Closet view components
│   ├── features/
│   │   ├── auth/
│   │   ├── items/
│   │   ├── backup/
│   │   ├── analytics/
│   │   └── export/
│   ├── hooks/               # Custom React hooks
│   ├── lib/
│   │   ├── db.ts           # IndexedDB setup
│   │   ├── storage.ts      # localStorage utils
│   │   └── utils.ts
│   ├── services/
│   │   ├── item-service.ts
│   │   ├── auth-service.ts
│   │   ├── backup-service.ts
│   │   └── photo-service.ts
│   ├── store/              # Zustand stores
│   │   ├── item-store.ts
│   │   ├── auth-store.ts
│   │   └── ui-store.ts
│   ├── types/              # TypeScript types
│   │   ├── item.ts
│   │   ├── auth.ts
│   │   └── global.d.ts
│   ├── workers/
│   │   └── photo-worker.ts
│   ├── App.tsx
│   ├── main.tsx
│   └── vite-env.d.ts
├── tests/
│   ├── unit/
│   └── e2e/
├── .eslintrc.cjs
├── .prettierrc
├── postcss.config.cjs
├── tailwind.config.ts
├── tsconfig.json
├── tsconfig.node.json
├── vite.config.ts
├── vitest.config.ts
├── playwright.config.ts
└── package.json
```

## 📝 Migration Phases

### Phase 1: Project Setup (Week 1)
- [ ] Initialize Vite + React + TypeScript project
- [ ] Configure Tailwind + PostCSS
- [ ] Setup ESLint + Prettier + Husky
- [ ] Configure tsconfig with strict mode
- [ ] Install all core dependencies
- [ ] Setup Vitest + Playwright

### Phase 2: Type Definitions (Week 1)
- [ ] Define Item interface
- [ ] Define User/Auth interfaces
- [ ] Define Store state types
- [ ] Define API/Service types
- [ ] Create Zod schemas for validation

### Phase 3: Core Services Migration (Week 2)
- [ ] Migrate storage-service.ts
- [ ] Migrate item-service.ts with idb
- [ ] Migrate auth-service.ts
- [ ] Migrate backup-service.ts
- [ ] Migrate photo-storage-service.ts
- [ ] Setup Web Workers for photos

### Phase 4: State Management (Week 2)
- [ ] Create item store with Zustand
- [ ] Create auth store
- [ ] Create UI store (modals, filters)
- [ ] Implement Immer for immutable updates
- [ ] Add persistence middleware

### Phase 5: UI Components - Base (Week 3)
- [ ] Create Radix UI wrapper components
- [ ] Build Button component
- [ ] Build Input component
- [ ] Build Modal component
- [ ] Build Select component
- [ ] Build Card component

### Phase 6: Feature Components (Week 3-4)
- [ ] Header component
- [ ] Stats dashboard
- [ ] Item card component
- [ ] Items grid with virtualization
- [ ] Filter controls
- [ ] Search component
- [ ] Add/Edit item modal

### Phase 7: Advanced Features (Week 4)
- [ ] Closet view with @dnd-kit
- [ ] Photo upload with Web Workers
- [ ] Backup manager
- [ ] Export/Import functionality
- [ ] Analytics dashboard with Chart.js
- [ ] Command palette with cmdk

### Phase 8: PWA & Performance (Week 5)
- [ ] Configure vite-plugin-pwa
- [ ] Setup service worker
- [ ] Implement offline support
- [ ] Add app manifest
- [ ] Optimize bundle size
- [ ] Implement code splitting

### Phase 9: Testing (Week 5)
- [ ] Write unit tests for services
- [ ] Write component tests
- [ ] Write integration tests
- [ ] Write E2E tests with Playwright
- [ ] Achieve 80%+ coverage

### Phase 10: Polish & Deploy (Week 6)
- [ ] Maintain retro arcade aesthetic with Tailwind
- [ ] Add animations with Framer Motion
- [ ] Performance optimization
- [ ] Accessibility audit
- [ ] Deploy to Vercel/Netlify
- [ ] Documentation

## 🎨 Retro Aesthetic in Tailwind

```tsx
// Example component with retro styling
const RetroButton = () => (
  <button className="
    px-6 py-3
    bg-gradient-to-r from-pink-500 to-purple-600
    border-4 border-cyan-400
    text-white font-['Press_Start_2P']
    text-xs uppercase
    shadow-[0_0_20px_rgba(0,255,255,0.5)]
    hover:shadow-[0_0_30px_rgba(0,255,255,0.8)]
    active:scale-95
    transition-all duration-200
    pixelated
  ">
    Start
  </button>
)
```

## 📊 Key Migrations

### Vanilla JS → React Hooks

**Before:**
```javascript
class ItemService {
    constructor() {
        this.items = [];
    }
    loadItems() {
        this.items = StorageService.loadItems();
    }
}
```

**After:**
```typescript
// Zustand store
export const useItemStore = create<ItemStore>()(
    persist(
        immer((set) => ({
            items: [],
            loadItems: async () => {
                const items = await db.items.toArray();
                set((state) => {
                    state.items = items;
                });
            },
        })),
        { name: 'item-store' }
    )
);

// In component
const { items, loadItems } = useItemStore();
useEffect(() => {
    loadItems();
}, []);
```

### LocalStorage → IndexedDB with idb

**Before:**
```javascript
localStorage.setItem('items', JSON.stringify(items));
```

**After:**
```typescript
import { openDB } from 'idb';

const db = await openDB('closet-db', 1, {
    upgrade(db) {
        db.createObjectStore('items', { keyPath: 'id' });
        db.createObjectStore('photos', { keyPath: 'id' });
    },
});

await db.put('items', item);
const items = await db.getAll('items');
```

## 🚀 Package.json Scripts

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "typecheck": "tsc --noEmit",
    "lint": "eslint src --ext ts,tsx",
    "lint:fix": "eslint src --ext ts,tsx --fix",
    "format": "prettier --write \"src/**/*.{ts,tsx,css}\"",
    "test": "vitest",
    "test:ui": "vitest --ui",
    "test:coverage": "vitest --coverage",
    "e2e": "playwright test",
    "e2e:ui": "playwright test --ui",
    "prepare": "husky install"
  }
}
```

## 💰 Estimated Timeline

- **Setup & Config:** 1 week
- **Core Migration:** 2 weeks  
- **UI Components:** 2 weeks
- **Advanced Features:** 1 week
- **Testing & Polish:** 1 week

**Total:** ~6-7 weeks for complete migration

## 🎯 Success Criteria

- [ ] 100% feature parity with current app
- [ ] TypeScript strict mode - 0 errors
- [ ] 80%+ test coverage
- [ ] Lighthouse score 90+ (all categories)
- [ ] Bundle size < 500KB gzipped
- [ ] First contentful paint < 1.5s
- [ ] Maintains retro arcade aesthetic
- [ ] Offline-first PWA functionality

## 🔄 Next Steps

1. **Create new repo:** `closet-react`
2. **Initialize Vite project:** `npm create vite@latest`
3. **Install dependencies:** All packages listed above
4. **Start Phase 1:** Project setup and configuration
5. **Parallel development:** Can run alongside existing app

Would you like me to start Phase 1 now?
