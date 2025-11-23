# Cypress Tests for Virtual Closet

## Setup

1. **Copy environment template:**
   ```bash
   cp cypress.env.json.example cypress.env.json
   ```

2. **Edit `cypress.env.json` with your credentials:**
   - Add your test Supabase email/password
   - Verify API_URL is correct (should be 3001)

3. **Start backend server:**
   ```bash
   cd server
   npm start
   ```

4. **Start React app:**
   ```bash
   npm run dev
   ```

## Run Tests

### Open Cypress UI (Interactive)
```bash
npx cypress open
```

### Run All Tests (Headless)
```bash
npx cypress run
```

### Run with Recording
```bash
npx cypress run --record --key 79b6b242-7610-47d0-b1a6-430738a87697
```

### Run Specific Test
```bash
npx cypress run --spec "cypress/e2e/marketplace-api.cy.js"
```

## Test Files

### `marketplace-api.cy.js`
Tests backend API endpoints:
- ✅ Health check
- ✅ Save marketplace credentials (with auth)
- ✅ Reject unauthorized requests
- ✅ Validate marketplace names
- ✅ eBay OAuth URL generation
- ✅ Connection status check

### `marketplace-ui.cy.js`
Tests React UI functionality:
- ✅ Page loads correctly
- ✅ Extension detection
- ✅ Marketplace cards display
- ✅ Manual sync buttons
- ✅ Login & Capture flow
- ✅ Diagnostics modal
- ✅ XHR request handling
- ✅ Error handling (401, network errors)

## What Gets Tested

### API Layer (Backend)
- HTTP requests to `localhost:3001`
- Authentication with Bearer tokens
- Request/response validation
- Error handling

### UI Layer (Frontend)
- Component rendering
- User interactions (clicks, inputs)
- Toast notifications
- Modal dialogs
- State management

### Integration
- Extension detection (mocked)
- API calls from UI
- OAuth flows
- Error recovery

## Notes

- **Extension tests are MOCKED** - Cypress can't load real Chrome extensions
- For real extension testing, see `test-extension/` folder
- Tests assume clean database state
- API must be running on port 3001
- React app must be running on port 5173

## Troubleshooting

**Tests fail with connection errors:**
- Verify backend is running: `curl http://localhost:3001/health`
- Verify React app is running: `curl http://localhost:5173`

**Tests fail with auth errors:**
- Check `cypress.env.json` has valid credentials
- Try logging in manually to verify credentials work

**Tests timeout:**
- Increase timeout in test with `{ timeout: 10000 }`
- Check console for actual errors

## CI/CD

To run in CI pipeline:
```yaml
- name: Run Cypress Tests
  run: |
    npm run dev &
    cd server && npm start &
    sleep 5
    npx cypress run --record --key ${{ secrets.CYPRESS_RECORD_KEY }}
```

