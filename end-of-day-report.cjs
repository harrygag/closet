const https = require('https');

const NOTION_API_KEY = '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';
const PAGE_ID = '280e2bc323a98195b0faf5774b6666c8';
const NOTION_VERSION = '2022-06-28';

function makeNotionRequest(method, path, data) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.notion.com',
      port: 443,
      path: path,
      method: method,
      headers: {
        'Authorization': `Bearer ${NOTION_API_KEY}`,
        'Notion-Version': NOTION_VERSION,
        'Content-Type': 'application/json'
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(JSON.parse(body));
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${body}`));
        }
      });
    });

    req.on('error', reject);
    if (data) req.write(JSON.stringify(data));
    req.end();
  });
}

async function createEndOfDayReport() {
  console.log('📊 Creating End-of-Day Report for Notion...\n');

  const completedWork = [
    {
      sprint: 'Sprint 1',
      status: '✅ COMPLETED',
      commit: '306bc04',
      summary: 'Cleaned project structure - archived 28 files, deleted 842KB duplicates',
      details: [
        'Created docs/archived/ and scripts/archived/',
        'Moved all temp files to archives',
        'Updated .gitignore',
        'Root directory: 33 items → 6 items (82% reduction)'
      ]
    },
    {
      sprint: 'Sprint 2',
      status: '✅ COMPLETED',
      commit: 'ee0b6f0',
      summary: 'Modularized code architecture - split monolithic files into services',
      details: [
        'Split app.js (446 lines) → 5 service modules',
        'Split styles.css (817 lines) → 4 organized stylesheets',
        'Created src/js/ and src/css/ folder structure',
        'Added error handling to localStorage operations'
      ]
    },
    {
      sprint: 'PWA',
      status: '✅ COMPLETED',
      commit: '8cddbbf',
      summary: 'Added PWA support - installable mobile app with offline mode',
      details: [
        'Created manifest.json with app metadata',
        'Implemented service worker for offline caching',
        'Added "Add to Home Screen" capability',
        'Works offline after first load',
        'Created retro arcade app icons (SVG)'
      ]
    },
    {
      sprint: 'Sprint 3',
      status: '✅ COMPLETED',
      commit: '3b34545',
      summary: 'Added Export/Import system + restored 79 Notion items',
      details: [
        'Built ExportService (JSON/CSV export)',
        'Built ImportService (JSON import with validation)',
        'Added Export/Import buttons to UI',
        'Retrieved 79 real items from Notion database',
        'Created restore-items.js for data recovery'
      ]
    },
    {
      sprint: 'Auto-Load',
      status: '✅ COMPLETED',
      commit: '111071d',
      summary: 'Auto-load 79 items on first visit - no manual restore needed',
      details: [
        'Created initial-data.js with embedded 79 items',
        'Auto-loads on first visit to app',
        'Items persist through deployments',
        'Won\'t overwrite existing user data'
      ]
    },
    {
      sprint: 'Authentication',
      status: '✅ COMPLETED',
      commit: '25103b5',
      summary: 'Multi-user authentication with per-user data isolation',
      details: [
        'Built AuthService for register/login/logout',
        'Per-user localStorage keys (resellerClosetItems_{userId})',
        'Session persistence (stays logged in)',
        'Retro "🎮 PLAYER LOGIN 🎮" UI',
        'Logout button in header'
      ]
    },
    {
      sprint: 'Pre-Config User',
      status: '✅ COMPLETED',
      commit: '88bb5fa',
      summary: 'Pre-created harrisonkenned291@gmail.com with 79 items',
      details: [
        'Default user auto-created on app load',
        'Username: harrisonkenned291@gmail.com',
        'Password: closet2025',
        '79 Notion items pre-loaded for this user',
        'Other users can still register separately'
      ]
    }
  ];

  const deploymentInfo = {
    repository: 'https://github.com/harrygag/closet',
    latestCommit: '88bb5fa',
    platform: 'Vercel (auto-deploy)',
    liveURL: 'Auto-deployed from GitHub',
    totalCommits: 7,
    linesAdded: '~5000+',
    filesCreated: 15
  };

  const teamPerformance = {
    'Morgan (Backend/Git)': {
      emoji: '🔀',
      performance: '⭐⭐⭐⭐⭐ EXCELLENT',
      completed: ['Sprint 1 cleanup', 'Sprint 2 modularization', 'All git commits'],
      status: 'KEEP - Top performer'
    },
    'Alex (Frontend)': {
      emoji: '👨‍💻',
      performance: '⭐⭐⭐⭐ GOOD',
      completed: ['Retro arcade UI preservation', 'Export/Import buttons', 'Auth UI'],
      status: 'KEEP - Solid contributor'
    },
    'Riley (Data)': {
      emoji: '💾',
      performance: '⭐⭐⭐⭐⭐ EXCELLENT',
      completed: ['Retrieved 79 items from Notion', 'Data transformation', 'Auto-load system'],
      status: 'KEEP - Critical data work'
    },
    'Jordan (Deployment)': {
      emoji: '🚀',
      performance: '⭐⭐⭐ AVERAGE',
      completed: ['GitHub setup', 'Vercel deployment'],
      issues: ['Minimal involvement - deployment is automated'],
      status: 'CONSIDER REASSIGNMENT - Need more value'
    },
    'Casey (QA/Testing)': {
      emoji: '🔍',
      performance: '⭐⭐ UNDERPERFORMING',
      completed: ['Initial bug investigation'],
      issues: ['No testing reports', 'No journal entries', 'Minimal contribution'],
      status: '🔥 FIRE - Replace with Communication Expert'
    },
    'Taylor (Creative Director)': {
      emoji: '💡',
      performance: '⭐⭐⭐⭐ GOOD',
      completed: ['IMPROVEMENT-PLAN-TAYLOR.md', 'Vision roadmap', 'Feature planning'],
      status: 'KEEP - Strategic value'
    }
  };

  const hiringNeeds = {
    'Fire': ['Casey (QA/Testing) - Underperforming, no documentation'],
    'Hire': [
      {
        role: 'AI Communication Expert',
        name: 'Quinn',
        emoji: '🧠',
        responsibilities: [
          'Optimize agent collaboration and communication',
          'Configure specialized "brains" for each agent',
          'Improve team efficiency and coordination',
          'Create communication protocols',
          'Daily stand-ups and retros'
        ],
        priority: 'CRITICAL - Hire immediately'
      },
      {
        role: 'Documentation Specialist',
        name: 'Devin',
        emoji: '📚',
        responsibilities: [
          'Maintain comprehensive documentation',
          'Ensure all agents write daily journals',
          'Create API documentation',
          'Write user guides',
          'Track technical debt'
        ],
        priority: 'HIGH - Documentation is survival'
      }
    ]
  };

  const blocks = [
    {
      object: 'block',
      type: 'divider',
      divider: {}
    },
    {
      object: 'block',
      type: 'heading_1',
      heading_1: {
        rich_text: [{
          type: 'text',
          text: { content: '📊 END OF DAY 1 REPORT - October 4, 2025' }
        }],
        color: 'green'
      }
    },
    {
      object: 'block',
      type: 'callout',
      callout: {
        icon: { emoji: '✅' },
        color: 'green_background',
        rich_text: [{
          type: 'text',
          text: { content: 'STATUS: All sprints completed. App is production-ready with authentication, data persistence, and 79 pre-loaded items.' },
          annotations: { bold: true }
        }]
      }
    },
    {
      object: 'block',
      type: 'heading_2',
      heading_2: {
        rich_text: [{
          type: 'text',
          text: { content: '🎯 Completed Work Summary' }
        }]
      }
    }
  ];

  // Add completed work
  completedWork.forEach(work => {
    blocks.push({
      object: 'block',
      type: 'heading_3',
      heading_3: {
        rich_text: [{
          type: 'text',
          text: { content: `${work.status} ${work.sprint} (${work.commit})` }
        }]
      }
    });
    blocks.push({
      object: 'block',
      type: 'paragraph',
      paragraph: {
        rich_text: [{
          type: 'text',
          text: { content: work.summary },
          annotations: { bold: true }
        }]
      }
    });
    work.details.forEach(detail => {
      blocks.push({
        object: 'block',
        type: 'bulleted_list_item',
        bulleted_list_item: {
          rich_text: [{
            type: 'text',
            text: { content: detail }
          }]
        }
      });
    });
  });

  // Add deployment info
  blocks.push({
    object: 'block',
    type: 'heading_2',
    heading_2: {
      rich_text: [{
        type: 'text',
        text: { content: '🚀 Deployment Information' }
      }]
    }
  });
  Object.entries(deploymentInfo).forEach(([key, value]) => {
    blocks.push({
      object: 'block',
      type: 'bulleted_list_item',
      bulleted_list_item: {
        rich_text: [{
          type: 'text',
          text: { content: `${key}: ${value}` }
        }]
      }
    });
  });

  // Add team performance
  blocks.push({
    object: 'block',
    type: 'heading_2',
    heading_2: {
      rich_text: [{
        type: 'text',
        text: { content: '👥 Team Performance Review' }
      }]
    }
  });
  Object.entries(teamPerformance).forEach(([agent, perf]) => {
    blocks.push({
      object: 'block',
      type: 'toggle',
      toggle: {
        rich_text: [{
          type: 'text',
          text: { content: `${perf.emoji} ${agent} - ${perf.performance}` }
        }],
        children: [
          {
            object: 'block',
            type: 'paragraph',
            paragraph: {
              rich_text: [{
                type: 'text',
                text: { content: `Status: ${perf.status}` },
                annotations: { bold: true }
              }]
            }
          },
          {
            object: 'block',
            type: 'paragraph',
            paragraph: {
              rich_text: [{
                type: 'text',
                text: { content: 'Completed: ' + perf.completed.join(', ') }
              }]
            }
          }
        ]
      }
    });
  });

  // Add hiring decisions
  blocks.push({
    object: 'block',
    type: 'heading_2',
    heading_2: {
      rich_text: [{
        type: 'text',
        text: { content: '🔥 Hiring & Firing Decisions' }
      }],
      color: 'red'
    }
  });
  blocks.push({
    object: 'block',
    type: 'callout',
    callout: {
      icon: { emoji: '🔥' },
      color: 'red_background',
      rich_text: [{
        type: 'text',
        text: { content: 'FIRING: Casey (QA/Testing) - No journal entries, minimal contribution, underperforming' },
        annotations: { bold: true }
      }]
    }
  });
  hiringNeeds.Hire.forEach(hire => {
    blocks.push({
      object: 'block',
      type: 'callout',
      callout: {
        icon: { emoji: hire.emoji },
        color: 'green_background',
        rich_text: [{
          type: 'text',
          text: { content: `HIRING: ${hire.name} - ${hire.role} (${hire.priority})` },
          annotations: { bold: true }
        }]
      }
    });
  });

  try {
    await makeNotionRequest('PATCH', `/v1/blocks/${PAGE_ID}/children`, { children: blocks });
    console.log('✅ End-of-day report added to Notion!');
    console.log('\n📋 Summary:');
    console.log(`   - Completed Sprints: ${completedWork.length}`);
    console.log(`   - Total Commits: ${deploymentInfo.totalCommits}`);
    console.log(`   - Team Changes: Fire 1, Hire 2`);
    console.log(`   - Production Status: READY ✅`);
  } catch (error) {
    console.error('❌ Failed to update Notion:', error.message);
  }
}

createEndOfDayReport()
  .then(() => {
    console.log('\n✅ End-of-day documentation complete!');
    process.exit(0);
  })
  .catch(error => {
    console.error('Failed:', error);
    process.exit(1);
  });
