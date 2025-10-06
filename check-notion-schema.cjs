const { Client } = require('@notionhq/client');

const notion = new Client({ auth: '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' });
const DATABASE_ID = '25de2bc323a9804283b6eb169953d9c7';

async function checkSchema() {
    console.log('🔍 Checking Notion database schema...\n');

    try {
        const database = await notion.databases.retrieve({ database_id: DATABASE_ID });

        console.log('📊 Available Properties:\n');
        for (const [name, prop] of Object.entries(database.properties)) {
            console.log(`   - ${name}: ${prop.type}`);
            if (prop.type === 'select' && prop.select?.options) {
                console.log(`     Options: ${prop.select.options.map(o => o.name).join(', ')}`);
            }
            if (prop.type === 'status' && prop.status?.options) {
                console.log(`     Options: ${prop.status.options.map(o => o.name).join(', ')}`);
            }
        }

    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

checkSchema();
