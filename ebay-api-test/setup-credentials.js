/**
 * eBay Credentials Setup Script
 * 
 * This script helps you set up your eBay API credentials.
 * Run: node setup-credentials.js
 */

const fs = require('fs');
const path = require('path');

// IMPORTANT: Replace these with your actual credentials from eBay Developer Portal
const credentials = {
  EBAY_APP_ID: 'YOUR_EBAY_APP_ID_HERE',
  EBAY_CERT_ID: 'YOUR_EBAY_CERT_ID_HERE',
  EBAY_DEV_ID: 'YOUR_EBAY_DEV_ID_HERE',
  EBAY_RUNAME: 'YOUR_EBAY_RUNAME_HERE',
  EBAY_ENVIRONMENT: 'PRODUCTION', // or 'SANDBOX'
  PORT: '3002'
};

const envContent = Object.entries(credentials)
  .map(([key, value]) => `${key}=${value}`)
  .join('\n');

const envPath = path.join(__dirname, '.env');

fs.writeFileSync(envPath, envContent);

console.log('✅ .env file created!');
console.log('\n📝 Next steps:');
console.log('1. Edit .env file with your real credentials');
console.log('2. Get credentials from: https://developer.ebay.com/my/keys');
console.log('3. Run: node server.js');
