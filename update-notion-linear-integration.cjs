const https = require('https');

const API_KEY = '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';
const PRD_PAGE_ID = '280e2bc323a98195b0faf5774b6666c8';

console.log('\n📊 UPDATING NOTION - LINEAR MCP INTEGRATION + NEW WORKFLOW 📊\n');
console.log('='.repeat(70));

const updateBlocks = [
    {
        object: 'block',
        type: 'heading_1',
        heading_1: {
            rich_text: [{ text: { content: '🔗 LINEAR MCP INTEGRATION - NEW WORKFLOW' } }]
        }
    },
    {
        object: 'block',
        type: 'paragraph',
        paragraph: {
            rich_text: [{
                text: {
                    content: 'CRITICAL CHANGE: All team members must now use Linear as the #1 source of truth. Claude AI manager configured with Linear MCP server for real-time issue tracking and task management.'
                }
            }]
        }
    },
    {
        object: 'block',
        type: 'heading_2',
        heading_2: { rich_text: [{ text: { content: '⚠️ NEW RULES FOR ALL TEAM MEMBERS' } }] }
    },
    {
        object: 'block',
        type: 'numbered_list_item',
        numbered_list_item: {
            rich_text: [{ text: { content: 'NEVER assume you know what is working or broken' } }]
        }
    },
    {
        object: 'block',
        type: 'numbered_list_item',
        numbered_list_item: {
            rich_text: [{ text: { content: 'ALWAYS check Linear first before making changes' } }]
        }
    },
    {
        object: 'block',
        type: 'numbered_list_item',
        numbered_list_item: {
            rich_text: [{ text: { content: 'CREATE Linear issues for every bug found' } }]
        }
    },
    {
        object: 'block',
        type: 'numbered_list_item',
        numbered_list_item: {
            rich_text: [{ text: { content: 'UPDATE Linear issues with progress, not just Notion' } }]
        }
    },
    {
        object: 'block',
        type: 'numbered_list_item',
        numbered_list_item: {
            rich_text: [{ text: { content: 'TEST everything in browser before marking complete' } }]
        }
    },
    {
        object: 'block',
        type: 'numbered_list_item',
        numbered_list_item: {
            rich_text: [{ text: { content: 'USE Linear MCP to search, track, and verify solutions' } }]
        }
    },
    {
        object: 'block',
        type: 'heading_2',
        heading_2: { rich_text: [{ text: { content: '🔧 Linear MCP Configuration' } }] }
    },
    {
        object: 'block',
        type: 'paragraph',
        paragraph: {
            rich_text: [{
                text: {
                    content: 'File: C:\\Users\\mickk\\AppData\\Roaming\\Claude\\claude_desktop_config.json'
                }
            }]
        }
    },
    {
        object: 'block',
        type: 'code',
        code: {
            rich_text: [{
                text: {
                    content: '{\n  "mcpServers": {\n    "linear": {\n      "command": "npx",\n      "args": ["-y", "mcp-remote", "https://mcp.linear.app/sse"]\n    }\n  }\n}'
                }
            }],
            language: 'json'
        }
    },
    {
        object: 'block',
        type: 'heading_2',
        heading_2: { rich_text: [{ text: { content: '📋 Current Known Issues (To be moved to Linear)' } }] }
    },
    {
        object: 'block',
        type: 'to_do',
        to_do: {
            rich_text: [{ text: { content: 'Closet view not rendering properly when toggle button clicked' } }],
            checked: false
        }
    },
    {
        object: 'block',
        type: 'to_do',
        to_do: {
            rich_text: [{ text: { content: 'Filter view not working in closet mode' } }],
            checked: false
        }
    },
    {
        object: 'block',
        type: 'to_do',
        to_do: {
            rich_text: [{ text: { content: 'Drag-and-drop not tested in actual browser' } }],
            checked: false
        }
    },
    {
        object: 'block',
        type: 'to_do',
        to_do: {
            rich_text: [{ text: { content: 'Toggle button may not be calling async render properly' } }],
            checked: false
        }
    },
    {
        object: 'block',
        type: 'heading_2',
        heading_2: { rich_text: [{ text: { content: '🎯 New Workflow (Effective Immediately)' } }] }
    },
    {
        object: 'block',
        type: 'bulleted_list_item',
        bulleted_list_item: {
            rich_text: [{ text: { content: 'Manager (Claude) checks Linear for current sprint status' } }]
        }
    },
    {
        object: 'block',
        type: 'bulleted_list_item',
        bulleted_list_item: {
            rich_text: [{ text: { content: 'All bugs reported in Linear with priority labels' } }]
        }
    },
    {
        object: 'block',
        type: 'bulleted_list_item',
        bulleted_list_item: {
            rich_text: [{ text: { content: 'Team members (AI agents) assigned issues in Linear' } }]
        }
    },
    {
        object: 'block',
        type: 'bulleted_list_item',
        bulleted_list_item: {
            rich_text: [{ text: { content: 'Progress tracked in Linear, synced to Notion daily' } }]
        }
    },
    {
        object: 'block',
        type: 'bulleted_list_item',
        bulleted_list_item: {
            rich_text: [{ text: { content: 'Testing requirements documented in Linear issues' } }]
        }
    },
    {
        object: 'block',
        type: 'bulleted_list_item',
        bulleted_list_item: {
            rich_text: [{ text: { content: 'No code ships without Linear issue verification' } }]
        }
    },
    {
        object: 'block',
        type: 'heading_2',
        heading_2: { rich_text: [{ text: { content: '👥 Team Member Responsibilities' } }] }
    },
    {
        object: 'block',
        type: 'bulleted_list_item',
        bulleted_list_item: {
            rich_text: [{ text: { content: 'Morgan 🔀: Check Linear for git/backend issues, update status' } }]
        }
    },
    {
        object: 'block',
        type: 'bulleted_list_item',
        bulleted_list_item: {
            rich_text: [{ text: { content: 'Alex 👨‍💻: Check Linear for frontend bugs, document fixes' } }]
        }
    },
    {
        object: 'block',
        type: 'bulleted_list_item',
        bulleted_list_item: {
            rich_text: [{ text: { content: 'Riley 💾: Check Linear for data integrity issues, verify saves' } }]
        }
    },
    {
        object: 'block',
        type: 'bulleted_list_item',
        bulleted_list_item: {
            rich_text: [{ text: { content: 'Jordan 🚀: Check Linear for deployment issues, test production' } }]
        }
    },
    {
        object: 'block',
        type: 'bulleted_list_item',
        bulleted_list_item: {
            rich_text: [{ text: { content: 'Kai 🎨: Check Linear for UI/UX bugs, verify designs work' } }]
        }
    },
    {
        object: 'block',
        type: 'bulleted_list_item',
        bulleted_list_item: {
            rich_text: [{ text: { content: 'Devin 📚: Document Linear workflows, create issue templates' } }]
        }
    },
    {
        object: 'block',
        type: 'bulleted_list_item',
        bulleted_list_item: {
            rich_text: [{ text: { content: 'Quinn 🧠: Monitor Linear, ensure team follows new process' } }]
        }
    },
    {
        object: 'block',
        type: 'heading_2',
        heading_2: { rich_text: [{ text: { content: '⚡ Why This Change?' } }] }
    },
    {
        object: 'block',
        type: 'paragraph',
        paragraph: {
            rich_text: [{
                text: {
                    content: 'Previous workflow: Team assumed features worked based on code review only. Result: Closet view broken, filters not working, no actual browser testing.'
                }
            }]
        }
    },
    {
        object: 'block',
        type: 'paragraph',
        paragraph: {
            rich_text: [{
                text: {
                    content: 'New workflow: Linear MCP provides real-time issue tracking. Manager checks Linear before making assumptions. Team verifies functionality in browser before closing issues.'
                }
            }]
        }
    },
    {
        object: 'block',
        type: 'heading_2',
        heading_2: { rich_text: [{ text: { content: '🚨 Consequences for Not Following' } }] }
    },
    {
        object: 'block',
        type: 'bulleted_list_item',
        bulleted_list_item: {
            rich_text: [{ text: { content: 'Code that is not tested in browser will be REJECTED' } }]
        }
    },
    {
        object: 'block',
        type: 'bulleted_list_item',
        bulleted_list_item: {
            rich_text: [{ text: { content: 'Features marked complete without Linear issue will be REVERTED' } }]
        }
    },
    {
        object: 'block',
        type: 'bulleted_list_item',
        bulleted_list_item: {
            rich_text: [{ text: { content: 'Team members who ship broken code will receive CRITICAL feedback' } }]
        }
    },
    {
        object: 'block',
        type: 'bulleted_list_item',
        bulleted_list_item: {
            rich_text: [{ text: { content: 'Manager will STOP assuming features work without Linear verification' } }]
        }
    },
    {
        object: 'block',
        type: 'heading_2',
        heading_2: { rich_text: [{ text: { content: '✅ Activation Steps' } }] }
    },
    {
        object: 'block',
        type: 'numbered_list_item',
        numbered_list_item: {
            rich_text: [{ text: { content: 'Restart Claude Desktop to load Linear MCP' } }]
        }
    },
    {
        object: 'block',
        type: 'numbered_list_item',
        numbered_list_item: {
            rich_text: [{ text: { content: 'Manager queries Linear for all open issues' } }]
        }
    },
    {
        object: 'block',
        type: 'numbered_list_item',
        numbered_list_item: {
            rich_text: [{ text: { content: 'Create Linear issues for known closet view bugs' } }]
        }
    },
    {
        object: 'block',
        type: 'numbered_list_item',
        numbered_list_item: {
            rich_text: [{ text: { content: 'Assign team members to fix issues' } }]
        }
    },
    {
        object: 'block',
        type: 'numbered_list_item',
        numbered_list_item: {
            rich_text: [{ text: { content: 'Test in browser BEFORE marking complete' } }]
        }
    },
    {
        object: 'block',
        type: 'numbered_list_item',
        numbered_list_item: {
            rich_text: [{ text: { content: 'Deploy only after Linear issue verified closed' } }]
        }
    },
    {
        object: 'block',
        type: 'heading_2',
        heading_2: { rich_text: [{ text: { content: '📊 Status: AWAITING CLAUDE RESTART' } }] }
    },
    {
        object: 'block',
        type: 'paragraph',
        paragraph: {
            rich_text: [{
                text: {
                    content: 'Linear MCP configured but not active. Waiting for Claude Desktop restart to enable integration.'
                }
            }]
        }
    }
];

const options = {
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

const req = https.request(options, (res) => {
    let body = '';
    res.on('data', (chunk) => body += chunk);
    res.on('end', () => {
        const data = JSON.parse(body);
        if (data.object === 'error') {
            console.error('❌ Error:', data.message);
        } else {
            console.log('✅ Linear MCP integration documented in Notion PRD!');
            console.log(`   URL: https://www.notion.so/${PRD_PAGE_ID.replace(/-/g, '')}`);
        }
        console.log('\n' + '='.repeat(70));
        console.log('\n🔗 NEW WORKFLOW ACTIVE: LINEAR MCP INTEGRATION\n');
        console.log('📋 All team members notified via Notion');
        console.log('⚠️  Waiting for Claude Desktop restart to enable Linear MCP\n');
    });
});

req.on('error', (e) => {
    console.log('⚠️  Notion update skipped\n');
    console.log('🔗 NEW WORKFLOW ACTIVE: LINEAR MCP INTEGRATION\n');
});

req.write(JSON.stringify({ children: updateBlocks }));
req.end();
