# Virtual Closet Arcade - AI Manager System Architecture
**Version:** 1.0.0  
**Date:** 2025-10-07  
**Architect:** System Design Team  
**Status:** Design Phase

---

## Executive Summary

This document defines the architectural blueprint for implementing a multi-agent AI development workflow for the Virtual Closet Arcade project. The system coordinates 8 specialized AI agents managed by a primary Closet Manager AI, following modern software development practices with automated quality gates and deployment pipelines.

---

## 1. Architecture Overview

### 1.1 System Architecture Type

**Classification:** Meta-Architecture + Application Architecture Hybrid

- **Meta-Architecture Layer:** Development workflow orchestration
- **Application Layer:** Vite + React + TypeScript web application
- **Integration Layer:** Linear MCP, GitHub, Vercel, MCP servers

### 1.2 Core Architectural Principles

1. **Separation of Concerns by Agent Specialty**
2. **Domain-Driven File Ownership**
3. **Quality Gates as Architectural Constraints**
4. **Documentation-First Development**
5. **Automated CI/CD with Manual Approval Gates**

---

## 2. Application Architecture (Product Layer)

### 2.1 Technology Stack Decision Matrix

| Layer | Technology | Rationale | Owner Agent |
|-------|-----------|-----------|-------------|
| **Build** | Vite + SWC | Fast HMR, minimal config | @Jordan |
| **Framework** | React 18 | Mature ecosystem, hooks | @Alex |
| **Language** | TypeScript (strict) | Type safety, better DX | All agents |
| **Styling** | Tailwind CSS | Utility-first, consistent | @Kai, @Taylor |
| **State** | Zustand + Immer | Minimal boilerplate | @Morgan |
| **Storage** | IndexedDB (idb) | Large data support | @Riley |
| **UI Components** | Radix UI | Accessibility built-in | @Alex |
| **Testing** | Vitest + Playwright | Fast, modern | @Jordan |
| **Deployment** | Vercel | Zero-config, edge network | @Jordan |

### 2.2 Directory Architecture by Agent Responsibility

```
closet-react/
├── src/
│   ├── components/          # PRIMARY: @Alex (Frontend)
│   │   ├── ui/             # SHARED: @Alex + @Taylor (styling)
│   │   ├── layout/         # @Alex with @Kai (design input)
│   │   ├── items/          # @Alex (implementation) + @Kai (design)
│   │   └── closet/         # @Alex + @Morgan (drag-drop logic)
│   │
│   ├── services/           # PRIMARY: @Morgan + @Riley (Backend Team)
│   │   ├── auth-service.ts          # @Morgan (business logic)
│   │   ├── item-service.ts          # @Riley (data operations)
│   │   ├── storage-service.ts       # @Riley (IndexedDB)
│   │   ├── backup-service.ts        # @Riley (data integrity)
│   │   └── analytics-service.ts     # @Morgan (calculations)
│   │
│   ├── store/              # PRIMARY: @Morgan (State Architecture)
│   │   ├── useItemStore.ts          # @Morgan
│   │   ├── useAuthStore.ts          # @Morgan
│   │   └── useUIStore.ts            # @Alex + @Morgan
│   │
│   ├── hooks/              # PRIMARY: @Alex (React Patterns)
│   │   ├── useAuth.ts
│   │   ├── useItems.ts
│   │   └── useDragDrop.ts
│   │
│   ├── types/              # SHARED: All agents
│   │   ├── item.types.ts            # Data models
│   │   ├── auth.types.ts
│   │   └── global.d.ts
│   │
│   ├── utils/              # SHARED: All agents
│   │   ├── formatters.ts            # @Alex
│   │   ├── validation.ts            # @Riley
│   │   └── constants.ts             # @Devin (documentation)
│   │
│   ├── styles/             # PRIMARY: @Kai + @Taylor (Design Team)
│   │   ├── index.css                # @Taylor (global)
│   │   ├── components.css           # @Kai (component-specific)
│   │   └── animations.css           # @Kai (motion design)
│   │
│   └── workers/            # PRIMARY: @Jordan (Performance)
│       └── photo-worker.ts          # @Jordan + @Riley
│
├── public/                 # PRIMARY: @Kai (Assets)
│   ├── icons/
│   └── manifest.json
│
├── tests/                  # PRIMARY: @Jordan (Quality Assurance)
│   ├── unit/
│   ├── integration/
│   └── e2e/
│
├── .github/workflows/      # PRIMARY: @Jordan (CI/CD)
│   └── deploy.yml
│
├── docs/                   # PRIMARY: @Devin (Documentation)
│   ├── architecture/
│   ├── api/
│   └── user-guides/
│
└── vercel.json            # PRIMARY: @Jordan (Deployment Config)
```

### 2.3 Data Flow Architecture

```
┌─────────────┐
│   React UI   │ @Alex (Components)
│  Components  │
└──────┬──────┘
       │
       ↓
┌─────────────┐
│   Zustand    │ @Morgan (State Management)
│    Store     │
└──────┬──────┘
       │
       ↓
┌─────────────┐
│  Services    │ @Morgan (Business Logic)
│    Layer     │ @Riley (Data Operations)
└──────┬──────┘
       │
       ↓
┌─────────────┐
│  IndexedDB   │ @Riley (Storage)
│  (via idb)   │
└─────────────┘
```

---

## 3. Development Workflow Architecture (Meta Layer)

### 3.1 Agent Coordination Model

**Pattern:** Hierarchical Task Distribution with Quality Gates

```
┌────────────────────────────────────────┐
│      CLOSET MANAGER AI (Orchestrator)  │
│  - Sprint Planning                     │
│  - Task Assignment                     │
│  - Code Review                         │
│  - Quality Gates                       │
│  - Deployment Authorization            │
└────────────────┬───────────────────────┘
                 │
        ┌────────┴────────┐
        │                 │
┌───────▼─────────┐  ┌────▼──────────┐
│  FRONTEND TEAM  │  │ BACKEND TEAM  │
├─────────────────┤  ├───────────────┤
│ @Alex (React)   │  │ @Morgan (API) │
│ @Kai (UX)       │  │ @Riley (Data) │
│ @Taylor (Style) │  │               │
└─────────────────┘  └───────────────┘
        │                 │
        └────────┬────────┘
                 │
    ┌────────────▼────────────┐
    │    SUPPORT TEAM         │
    ├─────────────────────────┤
    │ @Quinn (Coordination)   │
    │ @Devin (Documentation)  │
    │ @Jordan (DevOps)        │
    └─────────────────────────┘
```

### 3.2 Task Assignment Protocol

**Decision Tree for Task Distribution:**

```
NEW FEATURE REQUEST
        │
        ▼
  [Analyze Type]
        │
    ┌───┴───┐
    │       │
    ▼       ▼
 [UI]    [Backend]
    │       │
    ▼       ▼
  @Kai    @Riley
 (Design) (Data Model)
    │       │
    ▼       ▼
  @Alex   @Morgan
 (Impl.)  (Logic)
    │       │
    └───┬───┘
        ▼
    @Taylor
    (Style)
        │
        ▼
    @Jordan
    (Test)
        │
        ▼
    @Devin
    (Docs)
```

### 3.3 Quality Gate Architecture

**5-Stage Quality Pipeline:**

```
STAGE 1: Code Submission
├─ TypeScript type check
├─ ESLint validation
├─ Prettier formatting
└─ → PASS: Continue | FAIL: Return to agent

STAGE 2: Integration Testing
├─ Unit tests (Vitest)
├─ Component tests
├─ Integration tests
└─ → PASS: Continue | FAIL: Assign bug fix

STAGE 3: Performance Review
├─ Lighthouse audit (>90 score)
├─ Bundle size check (<500KB)
├─ Accessibility audit (WCAG AA)
└─ → PASS: Continue | FAIL: Optimize

STAGE 4: Documentation Verification
├─ README updated
├─ API docs complete
├─ User guide written
└─ → PASS: Continue | FAIL: Document

STAGE 5: Deployment Authorization
├─ Manager final review
├─ Preview deployment test
├─ Production readiness check
└─ → APPROVE: Deploy | REJECT: Fix issues
```

---

## 4. Deployment Architecture

### 4.1 Vercel Deployment Configuration

**Required Files:**

1. **vercel.json** (Owner: @Jordan)
```json
{
  "version": 2,
  "name": "virtual-closet-arcade",
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "framework": "vite",
  "routes": [
    { "src": "/(.*)", "dest": "/index.html" }
  ],
  "headers": [
    {
      "source": "/assets/(.*)",
      "headers": [
        { "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }
      ]
    }
  ]
}
```

2. **.github/workflows/deploy.yml** (Owner: @Jordan)
```yaml
name: Deploy to Vercel
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  quality-gates:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Setup Node
        uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
      - run: npm run typecheck
      - run: npm run lint
      - run: npm run test
      - run: npm run build

  deploy-preview:
    needs: quality-gates
    if: github.event_name == 'pull_request'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - run: vercel deploy --token=${{ secrets.VERCEL_TOKEN }}

  deploy-production:
    needs: quality-gates
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - run: vercel deploy --prod --token=${{ secrets.VERCEL_TOKEN }}
```

### 4.2 Deployment Flow Diagram

```
CODE COMMIT
    ↓
GitHub Actions Triggered
    ↓
┌──────────────────┐
│  Quality Gates   │
│  (All tests run) │
└────────┬─────────┘
         │
    ┌────┴────┐
    │         │
    ▼         ▼
  [PR]    [Main Branch]
    │         │
    ▼         ▼
Preview    Production
Deploy      Deploy
    │         │
    ▼         ▼
Manager    Auto-Deploy
Review      to Vercel
    │         │
    ▼         ▼
Approve    Monitor
or Reject   Metrics
```

---

## 5. Code Organization Standards

### 5.1 File Ownership Matrix

| Pattern | Owner Agent(s) | Restrictions |
|---------|---------------|--------------|
| `src/components/**/*.tsx` | @Alex (primary) | @Kai for design input only |
| `src/components/ui/*.tsx` | @Alex + @Taylor | Shared styling responsibility |
| `src/services/**/*.ts` | @Morgan + @Riley | Backend team exclusive |
| `src/store/**/*.ts` | @Morgan | State architecture decisions |
| `src/styles/**/*.css` | @Kai + @Taylor | Design team exclusive |
| `src/types/**/*.ts` | All agents | Shared type definitions |
| `src/utils/**/*.ts` | All agents | Utility functions |
| `src/workers/**/*.ts` | @Jordan | Performance optimization |
| `tests/**/*` | @Jordan | Quality assurance |
| `docs/**/*.md` | @Devin | Documentation specialist |
| `*.config.ts` | @Jordan | Build configuration |
| `vercel.json` | @Jordan | Deployment configuration |
| `.github/workflows/*` | @Jordan | CI/CD pipelines |

### 5.2 Coding Standards Enforcement

**TypeScript Strict Mode Rules:**
- All functions must have explicit return types
- No `any` types allowed (use `unknown` if necessary)
- All interfaces must be exported from `types/` directory
- Props must use TypeScript interfaces, not PropTypes

**React Component Rules:**
- Functional components only (no classes)
- Hooks must follow React naming convention (`use*`)
- One component per file
- Export named components, not default

**Service Layer Rules:**
- All services as classes with static methods
- All methods must have JSDoc comments
- Error handling required for all async operations
- All data operations must use TypeScript types

**Styling Rules:**
- Tailwind utility classes preferred
- Custom CSS only for complex animations
- No inline styles (use Tailwind or CSS modules)
- Follow design tokens from `tailwind.config.ts`

---

## 6. Agent Communication Protocols

### 6.1 Task Assignment Format

**Standard Task Assignment Structure:**

```markdown
@AgentName: TASK ASSIGNMENT

**Linear Issue:** #XXX
**Sprint:** Sprint N
**Priority:** High | Medium | Low
**Estimated Time:** X hours

**Description:**
[Clear, actionable description]

**Acceptance Criteria:**
- [ ] Criterion 1
- [ ] Criterion 2
- [ ] Criterion 3

**Dependencies:**
- Blocked by: @OtherAgent's task (if any)
- Required files: [List]
- Required APIs: [List]

**Technical Specs:**
- File path: src/path/to/file.tsx
- Technologies: [List]
- Existing patterns: [Reference similar code]

**Testing Requirements:**
- Unit tests: Yes/No
- Integration tests: [Description]
- Manual testing: [Steps]

**Deadline:** [ISO date]
```

### 6.2 Code Review Request Format

```markdown
@Manager: CODE REVIEW REQUEST

**Linear Issue:** #XXX
**Agent:** @AgentName
**Files Changed:** N files

**Summary:**
[Brief description of changes]

**Modified Files:**
- ✅ src/components/Example.tsx (new component)
- ✅ src/services/example-service.ts (new service)
- ✅ src/App.tsx (integration)

**Testing Completed:**
- ✅ Unit tests pass (X/X)
- ✅ TypeScript types validated
- ✅ Manual browser testing
- ✅ Responsive design verified
- ✅ Accessibility checked

**Performance Impact:**
- Bundle size: +XX KB
- Lighthouse score: XX/100

**Known Issues:** None | [List]

**Screenshots:** [If UI changes]

Ready for review and merge.
```

---

## 7. Linear MCP Integration Architecture

### 7.1 Issue Tracking Schema

**Linear Workspace Structure:**

```
PROJECT: Virtual Closet Arcade
│
├── TEAM: Frontend
│   ├── @Alex (Components)
│   ├── @Kai (Design)
│   └── @Taylor (Styling)
│
├── TEAM: Backend
│   ├── @Morgan (Logic)
│   └── @Riley (Data)
│
└── TEAM: Support
    ├── @Jordan (DevOps)
    ├── @Quinn (Coordination)
    └── @Devin (Docs)
```

**Issue Labels:**
- `agent:alex` - Frontend component work
- `agent:kai` - Design/UX work
- `agent:taylor` - Styling work
- `agent:morgan` - Backend logic
- `agent:riley` - Data layer
- `agent:jordan` - DevOps/testing
- `agent:quinn` - Coordination
- `agent:devin` - Documentation
- `sprint:N` - Sprint number
- `priority:high|medium|low`
- `status:blocked` - Has dependencies
- `type:bug|feature|refactor|docs`

### 7.2 Workflow States

```
TODO → IN_PROGRESS → IN_REVIEW → DONE
         ↑               ↓
         └─────BLOCKED───┘
```

---

## 8. Testing Architecture

### 8.1 Testing Strategy by Layer

| Test Type | Tool | Owner | Coverage Target |
|-----------|------|-------|-----------------|
| Unit Tests | Vitest | @Jordan | 80%+ |
| Component Tests | @testing-library/react | @Alex + @Jordan | All components |
| Integration Tests | Vitest | @Jordan | Critical paths |
| E2E Tests | Playwright | @Jordan | User workflows |
| Performance Tests | Lighthouse CI | @Jordan | Score >90 |
| Accessibility Tests | axe-core | @Kai + @Jordan | WCAG AA |

### 8.2 Test File Organization

```
tests/
├── unit/
│   ├── services/
│   │   ├── item-service.test.ts        # @Riley tests
│   │   ├── auth-service.test.ts        # @Morgan tests
│   │   └── storage-service.test.ts     # @Riley tests
│   │
│   ├── components/
│   │   ├── ItemCard.test.tsx           # @Alex tests
│   │   ├── ItemList.test.tsx           # @Alex tests
│   │   └── ClosetView.test.tsx         # @Alex tests
│   │
│   └── utils/
│       ├── formatters.test.ts
│       └── validation.test.ts
│
├── integration/
│   ├── item-workflow.test.ts           # @Jordan
│   ├── auth-flow.test.ts               # @Jordan
│   └── closet-view.test.ts             # @Jordan
│
└── e2e/
    ├── user-journey.spec.ts            # @Jordan
    ├── responsive.spec.ts              # @Jordan
    └── performance.spec.ts             # @Jordan
```

---

## 9. Documentation Architecture

### 9.1 Documentation Structure

```
docs/
├── architecture/
│   ├── AI-MANAGER-ARCHITECTURE.md      # This file
│   ├── ADR-001-state-management.md     # @Morgan
│   ├── ADR-002-styling-approach.md     # @Taylor
│   └── ADR-003-deployment.md           # @Jordan
│
├── api/
│   ├── services/
│   │   ├── item-service.md             # @Devin (from @Riley's code)
│   │   ├── auth-service.md             # @Devin (from @Morgan's code)
│   │   └── storage-service.md          # @Devin (from @Riley's code)
│   │
│   └── components/
│       ├── ItemCard.md                 # @Devin (from @Alex's code)
│       └── ClosetView.md               # @Devin (from @Alex's code)
│
├── user-guides/
│   ├── getting-started.md              # @Devin
│   ├── closet-view-guide.md            # @Devin
│   └── analytics-guide.md              # @Devin
│
└── development/
    ├── coding-standards.md             # @Devin
    ├── testing-guide.md                # @Jordan + @Devin
    └── deployment-guide.md             # @Jordan + @Devin
```

### 9.2 ADR (Architectural Decision Record) Template

```markdown
# ADR-XXX: [Decision Title]

**Date:** YYYY-MM-DD
**Status:** Proposed | Accepted | Deprecated
**Deciders:** @Manager, @AgentName
**Context:** [What led to this decision]

## Decision
[What we decided]

## Rationale
[Why we made this decision]

## Consequences
**Positive:**
- [Benefit 1]
- [Benefit 2]

**Negative:**
- [Trade-off 1]
- [Trade-off 2]

## Alternatives Considered
1. [Alternative 1] - Rejected because [reason]
2. [Alternative 2] - Rejected because [reason]

## Implementation
- Owner: @AgentName
- Timeline: [Timeframe]
- Related Issues: Linear #XXX
```

---

## 10. Performance Monitoring Architecture

### 10.1 Metrics to Track

**Build Metrics** (Owner: @Jordan)
- Bundle size (target: <500KB gzipped)
- Build time (target: <30s)
- Tree-shaking effectiveness

**Runtime Metrics** (Owner: @Jordan)
- First Contentful Paint (target: <1.5s)
- Largest Contentful Paint (target: <2.5s)
- Time to Interactive (target: <3.5s)
- Cumulative Layout Shift (target: <0.1)

**Database Metrics** (Owner: @Riley)
- IndexedDB query time (target: <100ms)
- Storage usage
- Backup/restore time

**User Experience Metrics** (Owner: @Kai)
- Navigation time between pages
- Search responsiveness
- Animation frame rate (target: 60fps)

### 10.2 Monitoring Implementation

**Vercel Analytics Integration:**
```typescript
// src/lib/analytics.ts (Owner: @Jordan)

import { Analytics } from '@vercel/analytics/react';

export function PerformanceMonitor() {
  return <Analytics />;
}
```

**Custom Performance Tracking:**
```typescript
// src/lib/performance.ts (Owner: @Jordan)

export class PerformanceTracker {
  static trackOperation(name: string, fn: () => void) {
    const start = performance.now();
    fn();
    const end = performance.now();
    console.log(`[PERF] ${name}: ${end - start}ms`);
  }
}
```

---

## 11. Security Architecture

### 11.1 Client-Side Security Measures

**Data Protection** (Owner: @Riley)
- IndexedDB encryption for sensitive data
- localStorage sanitization
- XSS prevention in user inputs

**Authentication** (Owner: @Morgan)
- Multi-user isolation
- Session management
- Secure credential storage

**Build Security** (Owner: @Jordan)
- Dependency vulnerability scanning
- CSP (Content Security Policy) headers
- HTTPS enforcement

### 11.2 Security Headers Configuration

```json
// vercel.json (Owner: @Jordan)
{
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "X-Frame-Options", "value": "DENY" },
        { "key": "X-XSS-Protection", "value": "1; mode=block" },
        { 
          "key": "Content-Security-Policy", 
          "value": "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';" 
        }
      ]
    }
  ]
}
```

---

## 12. Scalability Considerations

### 12.1 Future Growth Architecture

**Phase 1: Current (MVP)**
- Client-side only
- IndexedDB storage
- Single-user focus

**Phase 2: Enhanced (Future)**
- Backend API integration
- Cloud synchronization
- Multi-device support

**Phase 3: Enterprise (Long-term)**
- Real-time collaboration
- Team features
- Advanced analytics

### 12.2 Scalability Patterns

**Code Splitting Strategy:**
```typescript
// Lazy load heavy features (Owner: @Jordan)
const ClosetView = lazy(() => import('./components/ClosetView'));
const Analytics = lazy(() => import('./components/Analytics'));
```

**Virtual Scrolling:**
```typescript
// For large item lists (Owner: @Alex + @Jordan)
import { useVirtualizer } from '@tanstack/react-virtual';
```

**Web Workers for Heavy Operations:**
```typescript
// Photo processing (Owner: @Jordan)
const photoWorker = new Worker('./workers/photo-worker.ts');
```

---

## 13. Implementation Checklist

### 13.1 Immediate Actions (Week 1)

- [ ] **@Jordan:** Create `vercel.json` deployment configuration
- [ ] **@Jordan:** Set up GitHub Actions CI/CD pipeline
- [ ] **@Jordan:** Configure Vercel project and secrets
- [ ] **@Devin:** Create ADR template and first ADR
- [ ] **@Quinn:** Set up Linear workspace with agent labels
- [ ] **All Agents:** Review and acknowledge file ownership rules

### 13.2 Foundation Setup (Week 2)

- [ ] **@Morgan:** Define Zustand store architecture
- [ ] **@Riley:** Design IndexedDB schema
- [ ] **@Alex:** Create base UI component library
- [ ] **@Kai:** Establish Tailwind design tokens
- [ ] **@Taylor:** Create global styling patterns
- [ ] **@Jordan:** Set up testing infrastructure

### 13.3 Quality Infrastructure (Week 3)

- [ ] **@Jordan:** Implement Lighthouse CI
- [ ] **@Jordan:** Add bundle size monitoring
- [ ] **@Alex:** Write component test templates
- [ ] **@Riley:** Create service test suite
- [ ] **@Devin:** Document testing procedures
- [ ] **@Quinn:** Establish sprint workflow

---

## 14. Success Metrics

### 14.1 Development Velocity Metrics

- **Sprint Completion Rate:** >90% of assigned tasks
- **Code Review Time:** <2 hours average
- **Deployment Frequency:** 2-3 times per week
- **Blocker Resolution Time:** <4 hours

### 14.2 Quality Metrics

- **TypeScript Coverage:** 100% (strict mode)
- **Test Coverage:** >80%
- **Lighthouse Score:** >90 (all categories)
- **Zero Console Errors:** Production build
- **Bundle Size:** <500KB gzipped
- **Accessibility:** WCAG AA compliance

### 14.3 Team Collaboration Metrics

- **Agent Response Time:** <1 hour for task acknowledgment
- **Documentation Currency:** 100% features documented
- **ADR Coverage:** All major decisions recorded
- **Cross-Agent Collaboration:** Smooth handoffs, no bottlenecks

---

## 15. Risk Mitigation

### 15.1 Technical Risks

| Risk | Impact | Mitigation | Owner |
|------|--------|------------|-------|
| Bundle size exceeds limit | High | Code splitting, lazy loading | @Jordan |
| IndexedDB browser compatibility | Medium | Fallback to localStorage | @Riley |
| Complex state updates | Medium | Use Immer for immutability | @Morgan |
| Performance on low-end devices | High | Virtual scrolling, throttling | @Jordan |
| Accessibility gaps | High | Regular audits, automated testing | @Kai |

### 15.2 Process Risks

| Risk | Impact | Mitigation | Owner |
|------|--------|------------|-------|
| Agent blockers | High | Daily standup, quick escalation | @Quinn |
| Unclear requirements | Medium | ADRs for all major decisions | @Devin |
| Code conflicts | Medium | Clear file ownership, reviews | @Manager |
| Deployment issues | High | Preview deployments, rollback plan | @Jordan |
| Knowledge silos | Medium | Documentation, pair programming | @Devin |

---

## 16. Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-10-07 | Architect | Initial architecture design |

---

## 17. Appendices

### Appendix A: Agent Contact Matrix

| Agent | Role | GitHub Handle | Linear Label |
|-------|------|---------------|--------------|
| @Alex | Frontend Components | @alex-frontend | agent:alex |
| @Kai | UI/UX Design | @kai-design | agent:kai |
| @Taylor | Styling & CSS | @taylor-style | agent:taylor |
| @Morgan | Backend Logic | @morgan-backend | agent:morgan |
| @Riley | Data Layer | @riley-data | agent:riley |
| @Jordan | DevOps & Testing | @jordan-devops | agent:jordan |
| @Quinn | Coordination | @quinn-coord | agent:quinn |
| @Devin | Documentation | @devin-docs | agent:devin |

### Appendix B: Reference Documentation Links

- [React 18 Docs](https://react.dev)
- [TypeScript Handbook](https://www.typescriptlang.org/docs)
- [Tailwind CSS](https://tailwindcss.com)
- [Zustand](https://github.com/pmndrs/zustand)
- [Vercel Deployment](https://vercel.com/docs)
- [Vitest](https://vitest.dev)
- [Playwright](https://playwright.dev)

### Appendix C: Glossary

- **ADR:** Architectural Decision Record
- **MCP:** Model Context Protocol
- **PWA:** Progressive Web App
- **DX:** Developer Experience
- **HMR:** Hot Module Replacement
- **SWC:** Speedy Web Compiler
- **CSP:** Content Security Policy
- **WCAG:** Web Content Accessibility Guidelines

---

**END OF ARCHITECTURE DOCUMENT**
