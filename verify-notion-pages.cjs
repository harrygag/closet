const https = require('https');

const API_KEY = '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';

console.log('\n🔍 VERIFYING NOTION PAGES WERE ACTUALLY CREATED\n');
console.log('='.repeat(70));

// Page IDs that were supposedly created
const pageIds = [
    '283e2bc3-23a9-8134-a559-ca5e01fac019', // Sprint 7 documentation
    '283e2bc3-23a9-8198-90e1-c547f76791c8'  // Meeting notes
];

let checkedPages = 0;

pageIds.forEach((pageId, index) => {
    const options = {
        hostname: 'api.notion.com',
        port: 443,
        path: `/v1/pages/${pageId}`,
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${API_KEY}`,
            'Notion-Version': '2022-06-28'
        }
    };

    const req = https.request(options, (res) => {
        let body = '';
        res.on('data', (chunk) => body += chunk);
        res.on('end', () => {
            checkedPages++;
            const data = JSON.parse(body);

            if (data.object === 'error') {
                console.log(`\n❌ Page ${index + 1} NOT FOUND`);
                console.log(`   ID: ${pageId}`);
                console.log(`   Error: ${data.message}`);
            } else {
                console.log(`\n✅ Page ${index + 1} EXISTS!`);
                console.log(`   ID: ${pageId}`);
                console.log(`   Title: ${data.properties.Name?.title?.[0]?.text?.content || 'No title'}`);
                console.log(`   Created: ${new Date(data.created_time).toLocaleString()}`);
                console.log(`   Last Edited: ${new Date(data.last_edited_time).toLocaleString()}`);
            }

            if (checkedPages === pageIds.length) {
                console.log('\n' + '='.repeat(70));
                console.log('\n✅ VERIFICATION COMPLETE\n');
            }
        });
    });

    req.on('error', (e) => {
        console.error(`\n❌ Network error checking page ${index + 1}:`, e.message);
        checkedPages++;
    });

    req.end();
});
