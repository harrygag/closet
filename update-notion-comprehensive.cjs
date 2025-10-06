const { Client } = require('@notionhq/client');

const notion = new Client({ auth: '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' });
const DATABASE_ID = '25de2bc323a9804283b6eb169953d9c7';

async function updateNotionComprehensive() {
    console.log('\n📝 UPDATING NOTION WITH ALL SPRINT WORK 📝\n');
    console.log('='.repeat(70));

    try {
        // Sprint 4 Entry
        console.log('\n✅ Creating Sprint 4 entry...');
        await notion.pages.create({
            parent: { database_id: DATABASE_ID },
            properties: {
                Name: { title: [{ text: { content: 'Sprint 4: Power User Toolkit' } }] },
                Status: { status: { name: 'Complete' } },
                Priority: { select: { name: 'High' } },
                'Assigned To': { select: { name: 'Riley + Alex + Morgan' } },
                Type: { select: { name: 'Feature' } }
            }
        });
        console.log('   ✅ Sprint 4 logged');

        // Sprint 5 Entry
        console.log('\n✅ Creating Sprint 5 entry...');
        await notion.pages.create({
            parent: { database_id: DATABASE_ID },
            properties: {
                Name: { title: [{ text: { content: 'Sprint 5: UI Polish + Backup Manager' } }] },
                Status: { status: { name: 'Complete' } },
                Priority: { select: { name: 'High' } },
                'Assigned To': { select: { name: 'Kai + Alex + Riley' } },
                Type: { select: { name: 'Feature' } }
            }
        });
        console.log('   ✅ Sprint 5 logged');

        // Sprint 6 Phase 1 Entry
        console.log('\n✅ Creating Sprint 6 Phase 1 entry...');
        await notion.pages.create({
            parent: { database_id: DATABASE_ID },
            properties: {
                Name: { title: [{ text: { content: 'Sprint 6 Phase 1: Photo Gallery Foundation' } }] },
                Status: { status: { name: 'Complete' } },
                Priority: { select: { name: 'Critical' } },
                'Assigned To': { select: { name: 'Riley + Alex + Kai' } },
                Type: { select: { name: 'Feature' } }
            }
        });
        console.log('   ✅ Sprint 6 Phase 1 logged');

        // Team Configuration Entry
        console.log('\n✅ Creating Team Configuration entry...');
        await notion.pages.create({
            parent: { database_id: DATABASE_ID },
            properties: {
                Name: { title: [{ text: { content: 'Team Configuration: 9 Agents Specialized' } }] },
                Status: { status: { name: 'Active' } },
                Priority: { select: { name: 'Critical' } },
                'Assigned To': { select: { name: 'All Team' } },
                Type: { select: { name: 'Documentation' } }
            }
        });
        console.log('   ✅ Team Configuration logged');

        console.log('\n' + '='.repeat(70));
        console.log('\n✅ SUCCESS! All entries added to Notion database!\n');

    } catch (error) {
        console.error('\n❌ ERROR updating Notion:', error.message);
        console.error('Full error:', error);
    }
}

updateNotionComprehensive().catch(console.error);
