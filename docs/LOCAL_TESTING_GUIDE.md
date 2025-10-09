# Local Testing Guide 🧪

Your application is now running locally! Here's how to test everything.

---

## ✅ Services Running

### Main Application
**URL:** http://localhost:5173
**Status:** ✅ Running (Vite dev server)
**What you'll see:** Your existing Virtual Closet Arcade app with Pokémon-themed UI

### Prisma Studio (Database Viewer)
**URL:** http://localhost:5555
**Status:** ✅ Running
**What you'll see:** Visual database browser to view/edit all tables

---

## 🎮 Testing the Existing Frontend

### 1. Closet View (Main Page)
- **What to test:**
  - View existing items in grid layout
  - Pokémon-themed color borders on item cards
  - Energy bar (HP) showing days remaining
  - Filter by category, brand, condition
  - Sort options (newest, price, suggested price)

- **What you'll see:**
  - ItemCard components with retro arcade aesthetic
  - Color-coded categories (Polos=white, Hoodies=pink, Shirts=blue, etc.)
  - Badges for listing status (eBay, Poshmark, etc.)

### 2. Add Item Form
- **Click:** "+" button or "Add Item"
- **What to test:**
  - Fill in: Title, Brand, Category, Size, Color
  - Upload image (drag & drop or click)
  - Set price and condition
  - Add notes
  - Save item

- **Note:** Currently saves to IndexedDB (local browser storage)

### 3. Item Detail / Edit
- **Click:** Any item card
- **What to test:**
  - View all item details
  - Edit fields inline
  - Change images
  - Update pricing
  - Mark as listed on marketplaces
  - View HP (days remaining) calculation

### 4. Stats Dashboard
- **Navigation:** Look for stats/analytics section
- **What to test:**
  - Total items count
  - Average price
  - Listing status breakdown
  - Charts showing inventory by category

---

## 🗄️ Testing the Database (Prisma Studio)

### Open Prisma Studio
**URL:** http://localhost:5555

### Tables to Explore

#### 1. User Table
- **What's here:** Currently empty (need to create users)
- **Fields:** id, email, name, role, token budgets
- **Test:** Click "Add record" to create a test user

#### 2. Item Table
- **What's here:** Will show items once synced from IndexedDB or created via API
- **Fields:** title, brand, category, price, images, AI suggestions
- **Test:** View schema, check embedding column (pgvector)

#### 3. AIJob Table
- **What's here:** Empty (no AI jobs run yet)
- **Fields:** jobType, status, inputPayload, result, tokensUsed
- **Test:** View schema structure

#### 4. Prompt Table
- **What's here:** Empty (need to seed prompts)
- **Purpose:** Stores versioned AI prompt templates
- **Test:** Add a sample prompt manually

#### 5. AILog, ManagerAudit, LinearSync
- **What's here:** Empty (no AI operations yet)
- **Purpose:** Token tracking, audit trail, Linear integration

---

## 🧪 Testing AI Features (Requires Setup)

### Prerequisites
Before testing AI features, you need:

1. **PostgreSQL with pgvector** (currently using default DB)
2. **Run migrations:**
   ```bash
   npx prisma migrate dev
   ```
3. **Environment variables in `.env`:**
   - `DATABASE_URL` - PostgreSQL connection
   - `LINEAR_API_KEY` - Already configured
   - `OPENAI_API_KEY` - For embeddings (optional)

### Current State
- ✅ Database schema ready
- ✅ Zod validation schemas ready
- ✅ Linear integration tested
- ⚠️ Need to build API routes to test AI features
- ⚠️ Need to implement worker to process jobs

---

## 🎯 What You Can Test Right Now

### ✅ Working Features
1. **Closet Grid View**
   - Browse items
   - Visual Pokémon theme
   - Filter and sort
   - Card interactions

2. **Add/Edit Items**
   - Create new items
   - Upload images
   - Edit all fields
   - Delete items

3. **Stats Dashboard**
   - View inventory metrics
   - Charts and analytics

4. **Database Schema**
   - View all 10 tables in Prisma Studio
   - Understand data structure
   - Manually add test data

5. **Linear API**
   - Test connection: `node test-linear.js`
   - Verify your workspace access

### ⚠️ Not Yet Working (Need Implementation)
1. **AI Job Creation**
   - Need API routes: `POST /api/aijobs`

2. **AI Processing**
   - Need worker: `POST /api/aijobs/process`

3. **Manager Workspace UI**
   - Need to build: `/manager` routes and components

4. **Linear Issue Creation**
   - Need webhook handler and integration service

5. **Embeddings & Search**
   - Need OpenAI API integration
   - Need pgvector queries

---

## 🔧 Quick Tests You Can Do

### Test 1: View Existing Items
1. Go to http://localhost:5173
2. Look at the item grid
3. Check if items have color borders matching categories
4. Click an item to see details

### Test 2: Add a New Item
1. Click "+" or "Add Item"
2. Fill in:
   - Title: "Nike Dri-FIT Golf Polo"
   - Brand: "Nike"
   - Category: "Polos" (should get white border)
   - Price: 35.00
3. Upload an image
4. Save
5. Verify it appears in grid with white border (Polos = white)

### Test 3: Check Database
1. Go to http://localhost:5555 (Prisma Studio)
2. Click "User" table → Should be empty
3. Click "Item" table → Check if items are there
4. Click "AIJob" table → Should be empty (no AI jobs yet)

### Test 4: Test Linear API
```bash
# In terminal
node test-linear.js
```
Expected output:
```
✅ Linear API connection successful!
👤 Viewer: Harrison Kennedy
🏢 Organization: 444
📋 Teams: 444 (444)
```

### Test 5: View Category Colors
1. Open browser console (F12)
2. Go to http://localhost:5173
3. In console, type:
```javascript
import { CATEGORY_COLORS } from './src/constants/categories.ts'
console.log(CATEGORY_COLORS)
```
4. Should see color mappings for all 6 categories

---

## 🐛 Troubleshooting

### Port Already in Use
```bash
# Kill process on port 5173
npx kill-port 5173
# Restart
npm run dev
```

### Database Connection Error
```bash
# Check if PostgreSQL is running
psql --version

# If using default SQLite, migrations will fail
# Need to set up PostgreSQL + pgvector for AI features
```

### Items Not Showing
- Check browser console for errors (F12)
- Items are stored in IndexedDB (browser storage)
- Clear site data if needed: DevTools → Application → Clear Storage

### Prisma Studio Not Loading
```bash
# Check if .env has DATABASE_URL
cat .env | grep DATABASE_URL

# Restart Prisma Studio
# Kill existing: Ctrl+C in terminal
npx prisma studio
```

---

## 📋 Next Steps to Enable AI Features

### 1. Set Up PostgreSQL (Required)
```bash
# Option A: Local PostgreSQL
# Install PostgreSQL + pgvector extension

# Option B: Supabase (Recommended)
# 1. Go to supabase.com
# 2. Create project
# 3. SQL Editor → CREATE EXTENSION vector;
# 4. Copy connection string to .env
```

### 2. Run Migrations
```bash
npx prisma migrate dev --name init
# Creates all 10 tables
```

### 3. Seed Initial Data
```bash
# Create a seed script to add:
# - Test users (seller, manager, admin)
# - Sample prompts (price_v1, normalize_v1, etc.)
# - Test items with various categories
```

### 4. Build API Routes
```bash
# Create src/pages/api/ directory
# Implement:
# - POST /api/aijobs (create job)
# - POST /api/aijobs/process (worker)
# - POST /api/aijobs/:id/apply (apply suggestion)
```

### 5. Test End-to-End
1. Create item in UI
2. Trigger AI job via API
3. Worker processes job
4. View result in Manager workspace
5. Approve and apply to item

---

## 🎉 Summary

### Currently Working
✅ Main app UI (Closet view, Add Item, Stats)
✅ Database schema (10 tables ready)
✅ Validation schemas (6 job types)
✅ Linear API connection
✅ Pokémon category colors

### Ready to Build
🚧 API routes for AI jobs
🚧 Worker to process jobs
🚧 Manager workspace UI
🚧 Linear integration service
🚧 Embedding generation

### Your Local URLs
- **App:** http://localhost:5173
- **Database:** http://localhost:5555
- **Docs:** In `docs/` folder

---

**Enjoy testing! Let me know what you'd like to build next.** 🚀
