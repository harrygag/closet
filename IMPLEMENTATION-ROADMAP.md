# AI Manager System - Implementation Roadmap
**Version:** 1.0.0  
**Date:** 2025-10-07  
**Status:** Architecture Complete → Ready for Implementation

---

## Executive Summary

This roadmap provides a structured, phased approach to implementing the AI Manager System for Virtual Closet Arcade. The architecture design is complete - this document guides the transition from **Architect mode** to **Code mode** for actual implementation.

### Architecture Completion Status ✅

| Document | Status | Purpose |
|----------|--------|---------|
| [`AI-MANAGER-ARCHITECTURE.md`](AI-MANAGER-ARCHITECTURE.md) | ✅ Complete | Full system architecture |
| [`QUALITY-GATES-CHECKLIST.md`](QUALITY-GATES-CHECKLIST.md) | ✅ Complete | Quality assurance process |
| [`MIGRATION-PLAN.md`](MIGRATION-PLAN.md) | ✅ Complete | React migration strategy |
| `IMPLEMENTATION-ROADMAP.md` | ✅ This document | Implementation guide |

---

## Phase-Based Implementation Strategy

### Overview Timeline

```
PHASE 1: Foundation (Week 1)        ← START HERE
    ↓
PHASE 2: CI/CD Infrastructure (Week 1-2)
    ↓
PHASE 3: Agent Workflow Setup (Week 2)
    ↓
PHASE 4: Quality Automation (Week 2-3)
    ↓
PHASE 5: Sprint Execution (Week 3+)
    ↓
PHASE 6: Monitoring & Optimization (Ongoing)
```

---

## Phase 1: Foundation Setup 🏗️
**Duration:** 3-5 days  
**Mode Required:** Code mode  
**Owner:** @Jordan (DevOps Lead)

### 1.1 Vercel Deployment Configuration

**Action Items:**

1. **Create `closet-react/vercel.json`**
```json
{
  "version": 2,
  "name": "virtual-closet-arcade",
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "framework": "vite",
  "installCommand": "npm install",
  "routes": [
    {
      "src": "/sw.js",
      "headers": {
        "Cache-Control": "public, max-age=0, must-revalidate",
        "Service-Worker-Allowed": "/"
      },
      "dest": "/sw.js"
    },
    {
      "src": "/(.*)",
      "dest": "/index.html"
    }
  ],
  "headers": [
    {
      "source": "/assets/(.*)",
      "headers": [
        {
          "key": "Cache-Control",
          "value": "public, max-age=31536000, immutable"
        }
      ]
    },
    {
      "source": "/(.*)",
      "headers": [
        {
          "key": "X-Content-Type-Options",
          "value": "nosniff"
        },
        {
          "key": "X-Frame-Options",
          "value": "DENY"
        },
        {
          "key": "X-XSS-Protection",
          "value": "1; mode=block"
        },
        {
          "key": "Content-Security-Policy",
          "value": "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self'"
        }
      ]
    }
  ],
  "rewrites": [
    {
      "source": "/(.*)",
      "destination": "/index.html"
    }
  ]
}
```

2. **Configure Vercel Project**
```bash
# Install Vercel CLI
npm install -g vercel@latest

# Login to Vercel
vercel login

# Link project (run from closet-react/)
vercel link

# Set environment variables (if any)
vercel env add VITE_APP_VERSION production
```

3. **Test Deployment**
```bash
# Deploy to preview
vercel

# Test preview URL
# Verify all routes work
# Check security headers

# Deploy to production (after testing)
vercel --prod
```

**Verification Checklist:**
- [ ] vercel.json created with security headers
- [ ] Vercel project linked to GitHub repo
- [ ] Preview deployment successful
- [ ] Production deployment successful
- [ ] All routes working (SPA routing)
- [ ] PWA manifest loading
- [ ] Security headers verified (use securityheaders.com)

**Estimated Time:** 2-3 hours

---

### 1.2 GitHub Repository Setup

**Action Items:**

1. **Repository Structure**
```bash
# Ensure proper .gitignore
cat >> closet-react/.gitignore << EOF
# Vercel
.vercel

# Environment
.env
.env.local
.env.production

# Testing
coverage/
.nyc_output/

# Build
dist/
.vite/
EOF
```

2. **Branch Protection Rules**
- Navigate to GitHub Settings → Branches
- Protect `main` branch:
  - ✅ Require pull request reviews (1 reviewer minimum)
  - ✅ Require status checks (CI must pass)
  - ✅ Require branches to be up to date
  - ✅ Include administrators
  - ❌ Allow force pushes (disabled)
  - ❌ Allow deletions (disabled)

3. **GitHub Secrets Setup**
```
Settings → Secrets and Variables → Actions
Add:
- VERCEL_TOKEN (from Vercel account settings)
- VERCEL_ORG_ID (from Vercel project settings)
- VERCEL_PROJECT_ID (from Vercel project settings)
```

**Verification Checklist:**
- [ ] .gitignore updated
- [ ] Branch protection enabled on main
- [ ] GitHub secrets configured
- [ ] Repository webhooks active

**Estimated Time:** 1 hour

---

## Phase 2: CI/CD Infrastructure 🚀
**Duration:** 2-3 days  
**Mode Required:** Code mode  
**Owner:** @Jordan (DevOps)

### 2.1 GitHub Actions Workflow

**Action Items:**

1. **Create `.github/workflows/ci.yml`**
```yaml
name: CI/CD Pipeline

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

env:
  NODE_VERSION: '18'

jobs:
  quality-gates:
    name: Quality Gates
    runs-on: ubuntu-latest
    timeout-minutes: 10
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v4
        
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'
          cache-dependency-path: closet-react/package-lock.json
      
      - name: Install dependencies
        working-directory: ./closet-react
        run: npm ci
      
      - name: TypeScript type check
        working-directory: ./closet-react
        run: npm run typecheck
      
      - name: ESLint
        working-directory: ./closet-react
        run: npm run lint
      
      - name: Prettier check
        working-directory: ./closet-react
        run: npm run format -- --check
      
      - name: Run unit tests
        working-directory: ./closet-react
        run: npm run test -- --run --coverage
      
      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: ./closet-react/coverage/coverage-final.json
          flags: unittests
      
      - name: Build
        working-directory: ./closet-react
        run: npm run build
      
      - name: Check bundle size
        working-directory: ./closet-react
        run: |
          SIZE=$(du -sb dist | cut -f1)
          MAX_SIZE=524288000  # 500MB uncompressed
          if [ $SIZE -gt $MAX_SIZE ]; then
            echo "Bundle size $SIZE exceeds maximum $MAX_SIZE"
            exit 1
          fi
          echo "Bundle size: $SIZE bytes ✅"

  lighthouse:
    name: Lighthouse Audit
    runs-on: ubuntu-latest
    needs: quality-gates
    if: github.event_name == 'pull_request'
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'
          cache-dependency-path: closet-react/package-lock.json
      
      - name: Install dependencies
        working-directory: ./closet-react
        run: npm ci
      
      - name: Build
        working-directory: ./closet-react
        run: npm run build
      
      - name: Run Lighthouse CI
        working-directory: ./closet-react
        run: |
          npm install -g @lhci/cli@0.13.x
          lhci autorun
        env:
          LHCI_GITHUB_APP_TOKEN: ${{ secrets.GITHUB_TOKEN }}

  deploy-preview:
    name: Deploy Preview
    runs-on: ubuntu-latest
    needs: quality-gates
    if: github.event_name == 'pull_request'
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v4
      
      - name: Deploy to Vercel Preview
        uses: amondnet/vercel-action@v25
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
          working-directory: ./closet-react
          scope: ${{ secrets.VERCEL_ORG_ID }}
      
      - name: Comment PR with Preview URL
        uses: actions/github-script@v7
        with:
          script: |
            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: `## 🚀 Preview Deployment\n\nYour changes have been deployed to preview:\n\n🔗 ${{ steps.deploy.outputs.preview-url }}\n\n### Quality Checks\n- ✅ TypeScript: Passed\n- ✅ ESLint: Passed\n- ✅ Tests: Passed\n- ✅ Build: Successful`
            })

  deploy-production:
    name: Deploy Production
    runs-on: ubuntu-latest
    needs: quality-gates
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v4
      
      - name: Deploy to Vercel Production
        uses: amondnet/vercel-action@v25
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
          vercel-args: '--prod'
          working-directory: ./closet-react
          scope: ${{ secrets.VERCEL_ORG_ID }}
      
      - name: Create Release
        uses: actions/create-release@v1
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        with:
          tag_name: v${{ github.run_number }}
          release_name: Release v${{ github.run_number }}
          body: |
            ## 🎮 Virtual Closet Arcade - Production Release
            
            **Commit:** ${{ github.sha }}
            **Deployed:** ${{ steps.deploy.outputs.preview-url }}
            
            ### Changes
            ${{ github.event.head_commit.message }}
          draft: false
          prerelease: false
```

2. **Create `closet-react/lighthouserc.json`**
```json
{
  "ci": {
    "collect": {
      "staticDistDir": "./dist",
      "numberOfRuns": 3
    },
    "assert": {
      "preset": "lighthouse:recommended",
      "assertions": {
        "categories:performance": ["error", {"minScore": 0.9}],
        "categories:accessibility": ["error", {"minScore": 0.9}],
        "categories:best-practices": ["error", {"minScore": 0.9}],
        "categories:seo": ["error", {"minScore": 0.9}]
      }
    },
    "upload": {
      "target": "temporary-public-storage"
    }
  }
}
```

**Verification Checklist:**
- [ ] GitHub Actions workflow created
- [ ] Lighthouse CI configured
- [ ] CI runs on PRs and main branch
- [ ] All quality gates passing
- [ ] Preview deployments working
- [ ] Production deployments working
- [ ] GitHub release creation working

**Estimated Time:** 4-6 hours

---

## Phase 3: Agent Workflow Setup 📋
**Duration:** 2-3 days  
**Mode Required:** Documentation (Architect) + Setup (Code)  
**Owner:** @Quinn (Coordination) + Manager

### 3.1 Linear MCP Integration

**Action Items:**

1. **Linear Workspace Structure**
```
PROJECT: Virtual Closet Arcade
├── TEAM: Frontend (@Alex, @Kai, @Taylor)
├── TEAM: Backend (@Morgan, @Riley)
└── TEAM: Platform (@Jordan, @Quinn, @Devin)

LABELS:
- agent:alex | agent:kai | agent:taylor
- agent:morgan | agent:riley
- agent:jordan | agent:quinn | agent:devin
- priority:critical | priority:high | priority:medium | priority:low
- type:feature | type:bug | type:refactor | type:docs
- sprint:1 | sprint:2 | ... (increment per sprint)
- status:blocked
```

2. **Issue Templates**

Create Linear issue templates for common task types:

**Frontend Component Template:**
```markdown
## 🎨 Frontend Component: [Name]

**Agent:** @Alex
**Dependencies:** [List or None]
**Sprint:** Sprint X

### Description
[Component purpose and behavior]

### Acceptance Criteria
- [ ] Component renders correctly
- [ ] Props properly typed with TypeScript
- [ ] Responsive design (mobile, tablet, desktop)
- [ ] Accessibility verified (keyboard nav, ARIA labels)
- [ ] Unit tests written and passing

### Technical Specs
- **File:** `src/components/[category]/[Name].tsx`
- **Styling:** Tailwind CSS (design from @Kai)
- **State:** [Zustand store or local state]
- **Props:** [Interface definition]

### Testing
- [ ] Unit tests for all user interactions
- [ ] Snapshot test for UI consistency
- [ ] Manual browser testing

### Design Reference
[Link to @Kai's design or description]
```

**Backend Service Template:**
```markdown
## ⚙️ Backend Service: [Name]

**Agent:** @Morgan or @Riley
**Dependencies:** [List or None]
**Sprint:** Sprint X

### Description
[Service purpose and operations]

### Acceptance Criteria
- [ ] All CRUD operations implemented
- [ ] TypeScript interfaces defined
- [ ] Error handling for all edge cases
- [ ] JSDoc comments on all methods
- [ ] Unit tests with >80% coverage

### Technical Specs
- **File:** `src/services/[name]-service.ts`
- **Storage:** IndexedDB / localStorage
- **Related Stores:** [Zustand stores]
- **Data Model:** [TypeScript interface]

### API Methods
```typescript
class [Name]Service {
  static async create(data: T): Promise<T>
  static async getAll(): Promise<T[]>
  static async update(id: string, data: T): Promise<T>
  static async delete(id: string): Promise<void>
}
```

### Testing
- [ ] Unit tests for each method
- [ ] Edge case testing (null, undefined, invalid data)
- [ ] Error scenario testing
```

3. **Linear MCP Configuration**

**File:** `.roo/linear-config.json`
```json
{
  "workspace": "virtual-closet-arcade",
  "defaultProject": "main",
  "agentLabels": {
    "alex": "agent:alex",
    "kai": "agent:kai",
    "taylor": "agent:taylor",
    "morgan": "agent:morgan",
    "riley": "agent:riley",
    "jordan": "agent:jordan",
    "quinn": "agent:quinn",
    "devin": "agent:devin"
  },
  "statusFlow": {
    "todo": "Todo",
    "in_progress": "In Progress",
    "in_review": "In Review",
    "blocked": "Blocked",
    "done": "Done"
  },
  "priorityLevels": ["critical", "high", "medium", "low"],
  "sprintDuration": 14
}
```

**Verification Checklist:**
- [ ] Linear workspace created
- [ ] Teams configured
- [ ] Labels created
- [ ] Issue templates ready
- [ ] MCP configuration file created
- [ ] Test issue created and tracked

**Estimated Time:** 3-4 hours

---

### 3.2 Agent Communication Protocols

**Action Items:**

1. **Create Agent Response Templates**

**File:** `docs/agent-templates.md`
```markdown
# Agent Communication Templates

## Task Acceptance
```
@Manager: TASK ACCEPTED

**Linear Issue:** #[number]
**Agent:** @[name]
**ETA:** [X] hours
**Completion By:** [YYYY-MM-DD HH:MM]

**Implementation Plan:**
1. [Step 1]
2. [Step 2]
3. [Step 3]

**Dependencies Verified:**
- ✅ [Dependency 1] ready
- ⏳ [Dependency 2] expected [date]

**Questions:** [Any clarifications needed]

Starting work now. Will update every [X hours].
```

## Progress Update
```
@Manager: PROGRESS UPDATE

**Linear Issue:** #[number]
**Status:** [XX]% Complete

**Completed:**
- ✅ [Task 1]
- ✅ [Task 2]

**In Progress:**
- 🔄 [Task 3] (60% done)

**Next Steps:**
- [ ] [Task 4]
- [ ] [Task 5]

**Blockers:** None | [Description]
**Revised ETA:** [If changed]
```

## Code Review Request
```
@Manager: CODE REVIEW REQUEST

**Linear Issue:** #[number]
**Agent:** @[name]

**Summary:**
[Brief description of changes]

**Files Modified:**
- ✅ [file1.tsx] (new component)
- ✅ [file2.ts] (updated service)

**Testing:**
- ✅ TypeScript: 0 errors
- ✅ ESLint: 0 warnings
- ✅ Unit Tests: [X/X] passing
- ✅ Manual Testing: Complete

**Performance:**
- Bundle size: +[X]KB
- No performance regressions

**Screenshots:** [If UI changes]

Ready for merge.
```
```

**Verification Checklist:**
- [ ] Templates created
- [ ] All agents briefed on templates
- [ ] Test communication conducted
- [ ] Response times acceptable (<1 hour)

**Estimated Time:** 2 hours

---

## Phase 4: Quality Automation 🔍
**Duration:** 2-3 days  
**Mode Required:** Code mode  
**Owner:** @Jordan

### 4.1 Testing Infrastructure Enhancement

**Action Items:**

1. **Enhance Vitest Configuration**

**File:** `closet-react/vitest.config.ts`
```typescript
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react-swc'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      exclude: [
        'node_modules/',
        'src/test/',
        '**/*.d.ts',
        '**/*.config.*',
        '**/mockData',
        'src/main.tsx',
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80
      }
    }
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  }
})
```

2. **Create Test Setup File**

**File:** `closet-react/src/test/setup.ts`
```typescript
import '@testing-library/jest-dom'
import { expect, afterEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'

// Cleanup after each test
afterEach(() => {
  cleanup()
})

// Mock IndexedDB
global.indexedDB = {
  open: vi.fn(),
  deleteDatabase: vi.fn(),
  // ... other methods
} as any

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
}
global.localStorage = localStorageMock as any

// Console error suppression for expected errors in tests
const originalError = console.error
beforeAll(() => {
  console.error = (...args: any[]) => {
    if (
      typeof args[0] === 'string' &&
      args[0].includes('Not implemented: HTMLFormElement.prototype.submit')
    ) {
      return
    }
    originalError.call(console, ...args)
  }
})

afterAll(() => {
  console.error = originalError
})
```

3. **Add Playwright E2E Tests**

**File:** `closet-react/playwright.config.ts`
```typescript
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
    {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 5'] },
    },
    {
      name: 'Mobile Safari',
      use: { ...devices['iPhone 12'] },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
  },
})
```

**Verification Checklist:**
- [ ] Vitest config with coverage thresholds
- [ ] Test setup file created
- [ ] Playwright configured for multiple browsers
- [ ] Sample E2E test passing
- [ ] Coverage reports generating

**Estimated Time:** 4-5 hours

---

## Phase 5: Sprint Execution 🏃
**Duration:** Ongoing (2-week sprints)  
**Mode Required:** Mix (Architect for planning, Code for implementation)  
**Owner:** Closet Manager AI

### 5.1 Sprint Template

**Sprint Planning Document Template:**

**File:** `docs/sprints/sprint-[N]-plan.md`
```markdown
# Sprint [N] Planning Document

**Duration:** [Start Date] - [End Date] (2 weeks)
**Sprint Goal:** [High-level objective]
**Manager:** Closet Manager AI

## Sprint Objectives

1. [Objective 1]
2. [Objective 2]
3. [Objective 3]

## User Stories / Features

### Feature 1: [Name]
**Linear Issues:** #101, #102, #103
**Priority:** High
**Story Points:** 13

**Description:**
[What we're building and why]

**Acceptance Criteria:**
- [ ] [Criterion 1]
- [ ] [Criterion 2]

**Agent Assignments:**
1. **@Kai** (#101): Design mockup (4h)
2. **@Alex** (#102): Implement component (8h) - depends on #101
3. **@Taylor** (#103): Style component (3h) - depends on #102

### Feature 2: [Name]
[Similar structure...]

## Capacity Planning

| Agent | Available Hours | Assigned Hours | Buffer |
|-------|-----------------|----------------|--------|
| @Alex | 40h | 35h | 5h |
| @Kai | 40h | 30h | 10h |
| @Taylor | 40h | 28h | 12h |
| @Morgan | 40h | 38h | 2h |
| @Riley | 40h | 36h | 4h |
| @Jordan | 40h | 32h | 8h |
| @Quinn | 40h | 20h | 20h (coordination) |
| @Devin | 40h | 25h | 15h |

**Total:** 320h available, 244h assigned, 76h buffer (24%)

## Dependencies

```
@Kai → @Alex → @Taylor (Feature 1 UI chain)
@Riley → @Morgan (Data layer → Business logic)
@Alex + @Morgan → @Jordan (Component + Service → Testing)
All → @Devin (Documentation last)
```

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| [Risk 1] | High | High | [Plan] |
| [Risk 2] | Medium | Medium | [Plan] |

## Daily Standups

**Time:** 9:00 AM daily
**Format:** Async updates in Linear + Quick sync if blockers

## Sprint Review

**Date:** [Last day of sprint]
**Demo:** @Quinn presents completed features
**Retrospective:** What went well, what to improve

## Success Metrics

- [ ] All Linear issues resolved
- [ ] Quality gates passed
- [ ] Documentation complete
- [ ] Deployed to production
- [ ] Zero critical bugs
```

**Verification Checklist:**
- [ ] Sprint template created
- [ ] First sprint planned
- [ ] Agents assigned tasks
- [ ] Dependencies mapped
- [ ] Daily standup process defined

**Estimated Time:** 2-3 hours per sprint planning

---

## Phase 6: Monitoring & Optimization 📊
**Duration:** Ongoing  
**Mode Required:** Mix  
**Owner:** @Jordan + Manager

### 6.1 Performance Monitoring Setup

**Action Items:**

1. **Vercel Analytics Integration**

**File:** `closet-react/src/main.tsx` (update)
```typescript
import { inject } from '@vercel/analytics'
import { injectSpeedInsights } from '@vercel/speed-insights'

// ... existing code ...

if (import.meta.env.PROD) {
  inject()
  injectSpeedInsights()
}
```

2. **Custom Performance Tracking**

**File:** `closet-react/src/lib/performance.ts`
```typescript
export class PerformanceMonitor {
  private static metrics: Map<string, number[]> = new Map()

  static startMeasure(name: string): () => void {
    const start = performance.now()
    
    return () => {
      const duration = performance.now() - start
      const existing = this.metrics.get(name) || []
      this.metrics.set(name, [...existing, duration])
      
      if (import.meta.env.DEV) {
        console.log(`[PERF] ${name}: ${duration.toFixed(2)}ms`)
      }
    }
  }

  static getStats(name: string) {
    const measurements = this.metrics.get(name) || []
    if (measurements.length === 0) return null

    const avg = measurements.reduce((a, b) => a + b, 0) / measurements.length
    const max = Math.max(...measurements)
    const min = Math.min(...measurements)

    return { avg, max, min, count: measurements.length }
  }

  static reportAll() {
    const report: Record<string, any> = {}
    this.metrics.forEach((_, name) => {
      report[name] = this.getStats(name)
    })
    return report
  }
}

// Usage in components:
// const end = PerformanceMonitor.startMeasure('load-items')
// await loadItems()
// end()
```

3. **Error Tracking**

**File:** `closet-react/src/lib/error-tracking.ts`
```typescript
export class ErrorTracker {
  static capture(error: Error, context?: Record<string, any>) {
    // Log to console in dev
    if (import.meta.env.DEV) {
      console.error('[ERROR]', error, context)
    }

    // In production, send to monitoring service
    if (import.meta.env.PROD) {
      // TODO: Integrate with Sentry or similar
      this.logToService(error, context)
    }
  }

  private static logToService(error: Error, context?: Record<string, any>) {
    // Send to error tracking service
    console.error('Production error:', error, context)
  }
}
```

**Verification Checklist:**
- [ ] Vercel Analytics integrated
- [ ] Performance monitoring added
- [ ] Error tracking configured
- [ ] Dashboard metrics visible

**Estimated Time:** 3-4 hours

---

## Mode Switching Guide 🔄

### When to Use Each Mode

**Architect Mode** (Current):
- ✅ System design and planning
- ✅ Creating documentation
- ✅ Defining standards and processes
- ✅ Writing architectural decisions (ADRs)
- ✅ Creating roadmaps and guides

**Code Mode** (Switch to for):
- Implementation of vercel.json
- Creating GitHub Actions workflows
- Writing actual code files
- Configuring build tools
- Implementing tests
- Bug fixes and features

**Switch Command:**
```
@Manager: switch to Code mode for [specific task]
```

---

## Implementation Checklist Summary

### Immediate (This Week)
- [ ] Switch to Code mode
- [ ] Create vercel.json (30 min)
- [ ] Set up GitHub Actions CI/CD (3-4 hours)
- [ ] Configure Vercel project (1 hour)
- [ ] Test deployment pipeline (1 hour)

### Week 2
- [ ] Set up Linear workspace (2 hours)
- [ ] Create issue templates (2 hours)
- [ ] Configure Linear MCP (1 hour)
- [ ] Enhance testing setup (4 hours)
- [ ] Add performance monitoring (3 hours)

### Week 3+
- [ ] Plan Sprint 1
- [ ] Assign first tasks to agents
- [ ] Execute sprint workflow
- [ ] Monitor quality gates
- [ ] Deploy first production release

---

## Success Criteria

### Technical Metrics
- ✅ CI/CD pipeline: 100% automated
- ✅ Code coverage: >80%
- ✅ Lighthouse scores: >90 (all categories)
- ✅ Bundle size: <500KB gzipped
- ✅ Zero TypeScript errors (strict mode)
- ✅ Zero ESLint warnings
- ✅ Deployment time: <5 minutes

### Process Metrics
- ✅ Sprint completion rate: >90%
- ✅ Quality gate pass rate: >85%
- ✅ Agent response time: <1 hour
- ✅ Code review time: <2 hours
- ✅ Documentation currency: 100%
- ✅ Zero production incidents

---

## Next Steps

1. **Review Architecture** (1 hour)
   - Manager reviews all architecture docs
   - Confirm understanding of system design
   - Identify any gaps or questions

2. **Switch to Code Mode** (Immediate)
   - Use command: `@Manager: switch to Code mode`
   - Start with Phase 1.1 (Vercel configuration)

3. **Execute Phase 1** (Day 1-2)
   - Complete all Foundation tasks
   - Verify deployments working
   - Test full pipeline

4. **Execute Phase 2** (Day 3-4)
   - Set up CI/CD completely
   - Verify all quality gates
   - Test automated deployments

5. **Plan Sprint 1** (Day 5)
   - Use sprint template
   - Assign initial tasks
   - Begin agent workflow

---

## Emergency Contacts & Escalation

**If Stuck:**
1. Check relevant architecture doc
2. Review this roadmap
3. Consult quality gates checklist
4. Ask @Quinn for coordination help
5. Escalate to Manager

**Critical Issues:**
- Production down → Emergency protocol
- Security vulnerability → Immediate patch
- Data loss → Backup recovery process

---

**ARCHITECTURE COMPLETE ✅**

**READY FOR IMPLEMENTATION 🚀**

**SWITCH TO CODE MODE TO BEGIN**

---

**END OF IMPLEMENTATION ROADMAP**
