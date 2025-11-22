/**
 * eBay API Service
 * Following official eBay Developer Guide: https://developer.ebay.com/api-docs/sell/static/dev-app.html
 * 
 * Implements:
 * - User and application authentication (OAuth 2.0)
 * - HTTP request/response handling
 * - Error and warning detection
 * - Request/response logging
 * - eBay standards compliance
 */

import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ENV = process.env.EBAY_ENVIRONMENT || 'PRODUCTION';

// eBay API Endpoints (per eBay docs)
const ENDPOINTS = {
  SANDBOX: {
    oauth: 'https://auth.sandbox.ebay.com/oauth2/authorize',
    token: 'https://api.sandbox.ebay.com/identity/v1/oauth2/token',
    inventory: 'https://api.sandbox.ebay.com/sell/inventory/v1',
    fulfillment: 'https://api.sandbox.ebay.com/sell/fulfillment/v1',
    analytics: 'https://api.sandbox.ebay.com/sell/analytics/v1',
    account: 'https://api.sandbox.ebay.com/sell/account/v1'
  },
  PRODUCTION: {
    oauth: 'https://auth.ebay.com/oauth2/authorize',
    token: 'https://api.ebay.com/identity/v1/oauth2/token',
    inventory: 'https://api.ebay.com/sell/inventory/v1',
    fulfillment: 'https://api.ebay.com/sell/fulfillment/v1',
    analytics: 'https://api.ebay.com/sell/analytics/v1',
    account: 'https://api.ebay.com/sell/account/v1'
  }
};

const API = ENDPOINTS[ENV];

// Request/Response Logger (required by eBay)
class EbayLogger {
  static logDir = path.join(__dirname, '..', 'logs');
  
  static ensureLogDir() {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }
  
  static logRequest(method, url, headers, payload) {
    this.ensureLogDir();
    const timestamp = new Date().toISOString();
    const log = {
      timestamp,
      type: 'REQUEST',
      method,
      url,
      headers,
      payload
    };
    
    const filename = `${timestamp.split('T')[0]}-requests.log`;
    fs.appendFileSync(
      path.join(this.logDir, filename),
      JSON.stringify(log) + '\n'
    );
    
    console.log(`📤 [${timestamp}] ${method} ${url}`);
  }
  
  static logResponse(statusCode, headers, content, duration) {
    this.ensureLogDir();
    const timestamp = new Date().toISOString();
    const log = {
      timestamp,
      type: 'RESPONSE',
      statusCode,
      headers,
      content,
      duration
    };
    
    const filename = `${timestamp.split('T')[0]}-responses.log`;
    fs.appendFileSync(
      path.join(this.logDir, filename),
      JSON.stringify(log) + '\n'
    );
    
    console.log(`📥 [${timestamp}] Status: ${statusCode} (${duration}ms)`);
  }
  
  static logError(error, context) {
    this.ensureLogDir();
    const timestamp = new Date().toISOString();
    const log = {
      timestamp,
      type: 'ERROR',
      context,
      error: {
        message: error.message,
        code: error.code,
        response: error.response?.data
      }
    };
    
    const filename = `${timestamp.split('T')[0]}-errors.log`;
    fs.appendFileSync(
      path.join(this.logDir, filename),
      JSON.stringify(log) + '\n'
    );
    
    console.error(`❌ [${timestamp}] Error:`, error.message);
  }
}

/**
 * eBay API Client
 */
export class EbayAPI {
  constructor(accessToken) {
    this.accessToken = accessToken;
  }
  
  /**
   * Make authenticated API request
   * Handles error/warning detection per eBay docs
   */
  async request(method, endpoint, data = null) {
    const startTime = Date.now();
    const url = endpoint;
    const headers = {
      'Authorization': `Bearer ${this.accessToken}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };
    
    // Log request (required by eBay)
    EbayLogger.logRequest(method, url, headers, data);
    
    try {
      const config = {
        method,
        url,
        headers
      };
      
      if (data) {
        config.data = data;
      }
      
      const response = await axios(config);
      const duration = Date.now() - startTime;
      
      // Log response (required by eBay)
      EbayLogger.logResponse(
        response.status,
        response.headers,
        response.data,
        duration
      );
      
      // Check for warnings (per eBay docs)
      const warnings = this.extractWarnings(response);
      if (warnings.length > 0) {
        console.warn('⚠️ API Warnings:', warnings);
      }
      
      return {
        success: true,
        data: response.data,
        warnings,
        status: response.status
      };
      
    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Log error (required by eBay)
      EbayLogger.logError(error, { method, url, data });
      
      // Handle eBay error format (per docs)
      const ebayError = this.parseEbayError(error);
      
      return {
        success: false,
        error: ebayError,
        status: error.response?.status
      };
    }
  }
  
  /**
   * Extract warnings from response (per eBay docs)
   */
  extractWarnings(response) {
    const warnings = [];
    const data = response.data;
    
    if (data.warnings && Array.isArray(data.warnings)) {
      data.warnings.forEach(w => {
        warnings.push({
          code: w.errorId,
          message: w.message,
          field: w.parameters?.[0]?.name
        });
      });
    }
    
    return warnings;
  }
  
  /**
   * Parse eBay error format (per docs)
   */
  parseEbayError(error) {
    if (error.response?.data?.errors) {
      return error.response.data.errors.map(e => ({
        code: e.errorId,
        message: e.message,
        field: e.parameters?.[0]?.name,
        category: e.category
      }));
    }
    
    return [{
      code: error.code || 'UNKNOWN',
      message: error.message,
      category: 'REQUEST'
    }];
  }
  
  // ============================================
  // INVENTORY API
  // ============================================
  
  /**
   * Get inventory items
   * https://developer.ebay.com/api-docs/sell/inventory/resources/inventory_item/methods/getInventoryItems
   */
  async getInventoryItems(limit = 25, offset = 0) {
    const url = `${API.inventory}/inventory_item?limit=${limit}&offset=${offset}`;
    return this.request('GET', url);
  }
  
  /**
   * Get single inventory item
   */
  async getInventoryItem(sku) {
    const url = `${API.inventory}/inventory_item/${encodeURIComponent(sku)}`;
    return this.request('GET', url);
  }
  
  /**
   * Create or replace inventory item
   */
  async createOrReplaceInventoryItem(sku, itemData) {
    const url = `${API.inventory}/inventory_item/${encodeURIComponent(sku)}`;
    return this.request('PUT', url, itemData);
  }
  
  /**
   * Delete inventory item
   */
  async deleteInventoryItem(sku) {
    const url = `${API.inventory}/inventory_item/${encodeURIComponent(sku)}`;
    return this.request('DELETE', url);
  }
  
  // ============================================
  // FULFILLMENT API
  // ============================================
  
  /**
   * Get orders
   */
  async getOrders(filter = {}) {
    const params = new URLSearchParams(filter);
    const url = `${API.fulfillment}/order?${params}`;
    return this.request('GET', url);
  }
  
  /**
   * Get single order
   */
  async getOrder(orderId) {
    const url = `${API.fulfillment}/order/${orderId}`;
    return this.request('GET', url);
  }
  
  // ============================================
  // ANALYTICS API
  // ============================================
  
  /**
   * Get seller standards profile
   */
  async getSellerStandardsProfile() {
    const url = `${API.analytics}/seller_standards_profile`;
    return this.request('GET', url);
  }
  
  /**
   * Get traffic report
   */
  async getTrafficReport(filter = {}) {
    const params = new URLSearchParams(filter);
    const url = `${API.analytics}/traffic_report?${params}`;
    return this.request('GET', url);
  }
  
  // ============================================
  // ACCOUNT API
  // ============================================
  
  /**
   * Get fulfillment policies
   */
  async getFulfillmentPolicies() {
    const url = `${API.account}/fulfillment_policy`;
    return this.request('GET', url);
  }
  
  /**
   * Get payment policies
   */
  async getPaymentPolicies() {
    const url = `${API.account}/payment_policy`;
    return this.request('GET', url);
  }
  
  /**
   * Get return policies
   */
  async getReturnPolicies() {
    const url = `${API.account}/return_policy`;
    return this.request('GET', url);
  }
}

/**
 * OAuth Helper
 */
export class EbayOAuth {
  /**
   * Exchange authorization code for access token
   */
  static async exchangeCodeForToken(code, appId, certId, ruName) {
    const credentials = Buffer.from(`${appId}:${certId}`).toString('base64');
    const url = API.token;
    
    EbayLogger.logRequest('POST', url, { Authorization: 'Basic ***' }, {
      grant_type: 'authorization_code',
      code: '***'
    });
    
    try {
      const response = await axios.post(
        url,
        new URLSearchParams({
          grant_type: 'authorization_code',
          code: code,
          redirect_uri: ruName
        }),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': `Basic ${credentials}`
          }
        }
      );
      
      EbayLogger.logResponse(response.status, response.headers, {
        access_token: '***',
        expires_in: response.data.expires_in
      }, 0);
      
      return {
        success: true,
        accessToken: response.data.access_token,
        refreshToken: response.data.refresh_token,
        expiresIn: response.data.expires_in
      };
      
    } catch (error) {
      EbayLogger.logError(error, 'Token Exchange');
      return {
        success: false,
        error: error.response?.data || error.message
      };
    }
  }
  
  /**
   * Refresh access token
   */
  static async refreshAccessToken(refreshToken, appId, certId) {
    const credentials = Buffer.from(`${appId}:${certId}`).toString('base64');
    const url = API.token;
    
    try {
      const response = await axios.post(
        url,
        new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
          scope: 'https://api.ebay.com/oauth/api_scope'
        }),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': `Basic ${credentials}`
          }
        }
      );
      
      return {
        success: true,
        accessToken: response.data.access_token,
        expiresIn: response.data.expires_in
      };
      
    } catch (error) {
      EbayLogger.logError(error, 'Token Refresh');
      return {
        success: false,
        error: error.response?.data || error.message
      };
    }
  }
}

