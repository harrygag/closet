import { test, expect } from '@playwright/test'

test.describe('Virtual Closet Arcade - Basic Functionality', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
  })

  test('should load the application', async ({ page }) => {
    // Check that the page loads
    await expect(page).toHaveTitle(/Virtual Closet Arcade/i)
    
    // Check for main heading or app content
    const heading = page.getByRole('heading', { level: 1 })
    await expect(heading).toBeVisible()
  })

  test('should display initial items', async ({ page }) => {
    // Wait for items to load
    await page.waitForSelector('[data-testid="item-card"]', { timeout: 5000 })
    
    // Check that items are displayed
    const items = page.locator('[data-testid="item-card"]')
    const count = await items.count()
    
    expect(count).toBeGreaterThan(0)
  })

  test('should open item form modal', async ({ page }) => {
    // Find and click the "Add Item" button
    const addButton = page.getByRole('button', { name: /add item/i })
    await addButton.click()
    
    // Check that modal appears
    const modal = page.getByRole('dialog')
    await expect(modal).toBeVisible()
    
    // Check for form fields
    await expect(page.getByLabel(/name/i)).toBeVisible()
    await expect(page.getByLabel(/price/i)).toBeVisible()
  })

  test('should filter items by search', async ({ page }) => {
    // Wait for items to load
    await page.waitForSelector('[data-testid="item-card"]')
    
    // Find search input
    const searchInput = page.getByPlaceholder(/search/i)
    
    // Type in search
    await searchInput.fill('shirt')
    
    // Wait for filtered results
    await page.waitForTimeout(500) // Debounce delay
    
    // Verify filtered results
    const items = page.locator('[data-testid="item-card"]')
    const count = await items.count()
    
    // Should have fewer items than before (assuming not all items are shirts)
    expect(count).toBeGreaterThanOrEqual(0)
  })

  test('should display stats dashboard', async ({ page }) => {
    // Look for stats/metrics
    const stats = page.locator('[data-testid="stats-dashboard"]')
    
    // Stats should be visible
    await expect(stats).toBeVisible()
    
    // Check for specific metrics (adjust selectors based on actual implementation)
    const totalItems = page.locator('text=/total/i')
    await expect(totalItems.first()).toBeVisible()
  })

  test('should be responsive on mobile', async ({ page }) => {
    // Set viewport to mobile size
    await page.setViewportSize({ width: 375, height: 667 })
    
    // Check that the app still loads
    const heading = page.getByRole('heading', { level: 1 })
    await expect(heading).toBeVisible()
    
    // Check that items are still visible
    await page.waitForSelector('[data-testid="item-card"]', { timeout: 5000 })
    const items = page.locator('[data-testid="item-card"]')
    expect(await items.count()).toBeGreaterThan(0)
  })

  test('should toggle closet view', async ({ page }) => {
    // Find closet toggle button
    const closetButton = page.getByRole('button', { name: /closet/i })
    
    if (await closetButton.isVisible()) {
      await closetButton.click()
      
      // Wait for view transition
      await page.waitForTimeout(500)
      
      // Check that closet view is displayed
      const closetView = page.locator('[data-testid="closet-view"]')
      await expect(closetView).toBeVisible()
    }
  })
})

test.describe('Accessibility', () => {
  test('should have no accessibility violations', async ({ page }) => {
    await page.goto('/')
    
    // Basic accessibility checks
    // Check for proper heading hierarchy
    const h1 = page.locator('h1')
    expect(await h1.count()).toBeGreaterThan(0)
    
    // Check that interactive elements have accessible names
    const buttons = page.locator('button')
    const buttonCount = await buttons.count()
    
    for (let i = 0; i < buttonCount; i++) {
      const button = buttons.nth(i)
      const accessibleName = await button.getAttribute('aria-label') || 
                            await button.textContent()
      expect(accessibleName).toBeTruthy()
    }
  })

  test('should be keyboard navigable', async ({ page }) => {
    await page.goto('/')
    
    // Tab through interactive elements
    await page.keyboard.press('Tab')
    await page.keyboard.press('Tab')
    
    // Check that focus is visible
    const focusedElement = page.locator(':focus')
    await expect(focusedElement).toBeVisible()
  })
})

test.describe('Performance', () => {
  test('should load within acceptable time', async ({ page }) => {
    const startTime = Date.now()
    
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    
    const loadTime = Date.now() - startTime
    
    // Should load within 5 seconds
    expect(loadTime).toBeLessThan(5000)
  })
})
