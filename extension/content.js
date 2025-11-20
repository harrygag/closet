/**
 * Content Script - Runs on marketplace pages
 * Extracts user information and sends to background script
 */

(function() {
  'use strict';

  // Detect which marketplace we're on
  const currentMarketplace = detectMarketplace();
  
  if (!currentMarketplace) {
    return; // Not on a supported marketplace
  }

  console.log(`[VirtualCloset] Content script loaded on ${currentMarketplace}`);

  // Extract user email after page loads
  setTimeout(() => {
    extractAndStoreUserEmail(currentMarketplace);
  }, 2000);

  /**
   * Detect current marketplace from URL
   */
  function detectMarketplace() {
    const url = window.location.hostname;
    
    if (url.includes('ebay.com')) return 'ebay';
    if (url.includes('poshmark.com')) return 'poshmark';
    if (url.includes('depop.com')) return 'depop';
    if (url.includes('vendoo.com')) return 'vendoo';
    
    return null;
  }

  /**
   * Extract user email from page and store it
   */
  async function extractAndStoreUserEmail(marketplace) {
    let email = null;
    
    try {
      switch (marketplace) {
        case 'ebay':
          email = extractEbayEmail();
          break;
        case 'poshmark':
          email = extractPoshmarkEmail();
          break;
        case 'depop':
          email = extractDepopEmail();
          break;
        case 'vendoo':
          email = extractVendooEmail();
          break;
      }
      
      if (email) {
        console.log(`[VirtualCloset] Found email for ${marketplace}:`, email);
        await chrome.storage.local.set({ [`${marketplace}_email`]: email });
      }
    } catch (error) {
      console.error(`[VirtualCloset] Error extracting email for ${marketplace}:`, error);
    }
  }

  /**
   * Extract eBay email
   */
  function extractEbayEmail() {
    // Try multiple selectors
    const selectors = [
      '[data-test-id="user-email"]',
      '.account-settings-email',
      '[aria-label*="email"]',
      'input[type="email"]'
    ];
    
    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (el && el.textContent) {
        const email = el.textContent.trim();
        if (isValidEmail(email)) return email;
      }
      if (el && el.value) {
        const email = el.value.trim();
        if (isValidEmail(email)) return email;
      }
    }
    
    return null;
  }

  /**
   * Extract Poshmark email
   */
  function extractPoshmarkEmail() {
    const selectors = [
      '.account-email',
      '[data-test="account-email"]',
      'input[name="email"]'
    ];
    
    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (el && el.textContent) {
        const email = el.textContent.trim();
        if (isValidEmail(email)) return email;
      }
      if (el && el.value) {
        const email = el.value.trim();
        if (isValidEmail(email)) return email;
      }
    }
    
    return null;
  }

  /**
   * Extract Depop email
   */
  function extractDepopEmail() {
    const selectors = [
      '[data-testid="email"]',
      'input[type="email"]'
    ];
    
    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (el && el.value) {
        const email = el.value.trim();
        if (isValidEmail(email)) return email;
      }
    }
    
    return null;
  }

  /**
   * Extract Vendoo email
   */
  function extractVendooEmail() {
    const selectors = [
      '[data-test="user-email"]',
      '.user-email',
      'input[type="email"]'
    ];
    
    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (el && el.textContent) {
        const email = el.textContent.trim();
        if (isValidEmail(email)) return email;
      }
      if (el && el.value) {
        const email = el.value.trim();
        if (isValidEmail(email)) return email;
      }
    }
    
    return null;
  }

  /**
   * Validate email format
   */
  function isValidEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
  }

})();

