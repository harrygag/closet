const https = require('https');
const fs = require('fs');

const options = {
  hostname: 'api.notion.com',
  port: 443,
  path: '/v1/databases/25de2bc323a9804283b6eb169953d9c7/query',
  method: 'POST',
  headers: {
    'Authorization': 'Bearer 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',
    'Notion-Version': '2022-06-28',
    'Content-Type': 'application/json'
  }
};

const req = https.request(options, (res) => {
  let body = '';
  res.on('data', (chunk) => body += chunk);
  res.on('end', () => {
    fs.writeFileSync('notion-items.json', body);
    console.log('✅ Data saved to notion-items.json');
    const data = JSON.parse(body);
    console.log(`📦 Retrieved ${data.results?.length || 0} items`);
  });
});

req.on('error', (e) => console.error('❌ Error:', e));
req.write(JSON.stringify({ page_size: 100 }));
req.end();
