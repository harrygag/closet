const https = require('https');

const API_KEY = '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';
const PRD_PAGE_ID = '280e2bc323a98195b0faf5774b6666c8'; // The actual PRD page

console.log('\n🎮 UPDATING ACTUAL PRD PAGE IN NOTION 🎮\n');
console.log('='.repeat(70));
console.log(`\nPRD Page ID: ${PRD_PAGE_ID}\n`);

// First, let's read the current PRD page to see what's there
console.log('📖 Reading current PRD page...\n');

const readOptions = {
    hostname: 'api.notion.com',
    port: 443,
    path: `/v1/pages/${PRD_PAGE_ID}`,
    method: 'GET',
    headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Notion-Version': '2022-06-28'
    }
};

const readReq = https.request(readOptions, (res) => {
    let body = '';
    res.on('data', (chunk) => body += chunk);
    res.on('end', () => {
        const data = JSON.parse(body);

        if (data.object === 'error') {
            console.error('❌ Error reading PRD page:', data.message);
            console.error('Code:', data.code);
            return;
        }

        console.log('✅ PRD Page Found!');
        console.log(`   Title: ${data.properties.title?.title?.[0]?.text?.content || 'No title'}`);
        console.log(`   Created: ${new Date(data.created_time).toLocaleString()}`);
        console.log(`   Last Edited: ${new Date(data.last_edited_time).toLocaleString()}\n`);

        // Now append Sprint 7 documentation as child blocks
        console.log('📝 Appending Sprint 7 documentation to PRD...\n');

        const sprint7Blocks = [
            {
                object: 'block',
                type: 'heading_1',
                heading_1: {
                    rich_text: [{ text: { content: '🚀 SPRINT 7: Analytics Dashboard (IN PROGRESS)' } }]
                }
            },
            {
                object: 'block',
                type: 'paragraph',
                paragraph: {
                    rich_text: [{
                        text: {
                            content: `Updated: ${new Date().toLocaleString()} - Sprint 7 documentation and team decision`
                        }
                    }]
                }
            },
            {
                object: 'block',
                type: 'heading_2',
                heading_2: { rich_text: [{ text: { content: '✅ Sprint 7 Features Completed' } }] }
            },
            {
                object: 'block',
                type: 'bulleted_list_item',
                bulleted_list_item: {
                    rich_text: [{ text: { content: 'List Price Field - Track original listing price with color-coded profit display' } }]
                }
            },
            {
                object: 'block',
                type: 'bulleted_list_item',
                bulleted_list_item: {
                    rich_text: [{ text: { content: 'Type→Hanger Sorting - Sort by clothing type, then hanger ID for physical inventory' } }]
                }
            },
            {
                object: 'block',
                type: 'bulleted_list_item',
                bulleted_list_item: {
                    rich_text: [{ text: { content: 'Unique Hanger ID Validation - Prevents duplicate hanger IDs with validation' } }]
                }
            },
            {
                object: 'block',
                type: 'bulleted_list_item',
                bulleted_list_item: {
                    rich_text: [{ text: { content: 'Analytics Service - Complete data calculation layer (Riley)' } }]
                }
            },
            {
                object: 'block',
                type: 'bulleted_list_item',
                bulleted_list_item: {
                    rich_text: [{ text: { content: 'Chart.js Integration - Added CDN, analytics button to header (Alex)' } }]
                }
            },
            {
                object: 'block',
                type: 'heading_2',
                heading_2: { rich_text: [{ text: { content: '📊 Analytics Dashboard (Team Decision)' } }] }
            },
            {
                object: 'block',
                type: 'paragraph',
                paragraph: {
                    rich_text: [{
                        text: {
                            content: 'Team voted: Analytics Dashboard over Advanced Search. Reason: Competitive edge - Poshmark charges $80/year for analytics, we give it FREE with retro arcade style.'
                        }
                    }]
                }
            },
            {
                object: 'block',
                type: 'heading_3',
                heading_3: { rich_text: [{ text: { content: 'Analytics Features to Build:' } }] }
            },
            {
                object: 'block',
                type: 'bulleted_list_item',
                bulleted_list_item: {
                    rich_text: [{ text: { content: 'Profit Trends Chart - Monthly profit over time (Chart.js line graph)' } }]
                }
            },
            {
                object: 'block',
                type: 'bulleted_list_item',
                bulleted_list_item: {
                    rich_text: [{ text: { content: 'Category Breakdown - Best-selling types (doughnut chart)' } }]
                }
            },
            {
                object: 'block',
                type: 'bulleted_list_item',
                bulleted_list_item: {
                    rich_text: [{ text: { content: 'Inventory Velocity - Average days to sell (bar chart)' } }]
                }
            },
            {
                object: 'block',
                type: 'bulleted_list_item',
                bulleted_list_item: {
                    rich_text: [{ text: { content: 'Total Cards - Active value, SOLD profit, item counts, avg profit' } }]
                }
            },
            {
                object: 'block',
                type: 'heading_2',
                heading_2: { rich_text: [{ text: { content: '👥 Team Status (8 AI Agents)' } }] }
            },
            {
                object: 'block',
                type: 'bulleted_list_item',
                bulleted_list_item: {
                    rich_text: [{ text: { content: 'Morgan 🔀 - Backend/Git ⭐⭐⭐⭐⭐ | Alex 👨‍💻 - Frontend ⭐⭐⭐⭐' } }]
                }
            },
            {
                object: 'block',
                type: 'bulleted_list_item',
                bulleted_list_item: {
                    rich_text: [{ text: { content: 'Riley 💾 - Data ⭐⭐⭐⭐⭐ | Jordan 🚀 - DevOps ⭐⭐⭐' } }]
                }
            },
            {
                object: 'block',
                type: 'bulleted_list_item',
                bulleted_list_item: {
                    rich_text: [{ text: { content: 'Taylor 💡 - Creative ⭐⭐⭐⭐ | Quinn 🧠 - Communication ⭐⭐⭐⭐' } }]
                }
            },
            {
                object: 'block',
                type: 'bulleted_list_item',
                bulleted_list_item: {
                    rich_text: [{ text: { content: 'Devin 📚 - Documentation ⭐⭐⭐⭐ | Kai 🎨 - UI/UX ⭐⭐⭐⭐⭐' } }]
                }
            },
            {
                object: 'block',
                type: 'heading_2',
                heading_2: { rich_text: [{ text: { content: '🎯 Sprint 7 Remaining Tasks' } }] }
            },
            {
                object: 'block',
                type: 'to_do',
                to_do: {
                    rich_text: [{ text: { content: 'Build analytics modal UI with 4 charts (Alex + Kai)' } }],
                    checked: false
                }
            },
            {
                object: 'block',
                type: 'to_do',
                to_do: {
                    rich_text: [{ text: { content: 'Design retro chart theme with neon colors and CRT effects (Kai)' } }],
                    checked: false
                }
            },
            {
                object: 'block',
                type: 'to_do',
                to_do: {
                    rich_text: [{ text: { content: 'Wire up event handlers and data binding (Morgan)' } }],
                    checked: false
                }
            },
            {
                object: 'block',
                type: 'to_do',
                to_do: {
                    rich_text: [{ text: { content: 'Test analytics with 79 items (Jordan)' } }],
                    checked: false
                }
            },
            {
                object: 'block',
                type: 'to_do',
                to_do: {
                    rich_text: [{ text: { content: 'Deploy Sprint 7 to production (Jordan)' } }],
                    checked: false
                }
            },
            {
                object: 'block',
                type: 'heading_2',
                heading_2: { rich_text: [{ text: { content: '🚀 Deployment' } }] }
            },
            {
                object: 'block',
                type: 'paragraph',
                paragraph: {
                    rich_text: [{
                        text: {
                            content: 'Live: https://virtual-closet-arcade.netlify.app | GitHub: https://github.com/harrygag/closet.git | Last Deploy: Sprint 7 foundation committed (74869b3)'
                        }
                    }]
                }
            }
        ];

        const appendOptions = {
            hostname: 'api.notion.com',
            port: 443,
            path: `/v1/blocks/${PRD_PAGE_ID}/children`,
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${API_KEY}`,
                'Notion-Version': '2022-06-28',
                'Content-Type': 'application/json'
            }
        };

        const appendReq = https.request(appendOptions, (res) => {
            let appendBody = '';
            res.on('data', (chunk) => appendBody += chunk);
            res.on('end', () => {
                const appendData = JSON.parse(appendBody);

                if (appendData.object === 'error') {
                    console.error('❌ Error appending to PRD:', appendData.message);
                    console.error('Code:', appendData.code);
                } else {
                    console.log('✅ Sprint 7 documentation APPENDED to actual PRD page!');
                    console.log(`   Added ${sprint7Blocks.length} blocks`);
                    console.log(`   PRD URL: https://www.notion.so/${PRD_PAGE_ID.replace(/-/g, '')}`);
                }

                console.log('\n' + '='.repeat(70));
                console.log('\n🎮 PRD UPDATED WITH REAL API CALLS! 🎮\n');
            });
        });

        appendReq.on('error', (e) => {
            console.error('❌ Network error appending to PRD:', e.message);
        });

        appendReq.write(JSON.stringify({ children: sprint7Blocks }));
        appendReq.end();
    });
});

readReq.on('error', (e) => {
    console.error('❌ Network error reading PRD:', e.message);
});

readReq.end();
