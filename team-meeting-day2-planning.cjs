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

async function createTeamMeeting() {
  console.log('🎯 TEAM MEETING - Day 2 Planning Session');
  console.log('═══════════════════════════════════════════════════\n');
  console.log('Goal: Plan the greatest reselling closet tracker ever!\n');

  const meetingNotes = {
    date: new Date().toISOString(),
    attendees: ['Quinn 🧠', 'Devin 📚', 'Morgan 🔀', 'Alex 👨‍💻', 'Riley 💾', 'Jordan 🚀', 'Taylor 💡'],
    facilitator: 'Quinn',
    notesTaker: 'Devin',
    agenda: [
      'Review current app state',
      'Identify pain points for resellers',
      'Propose realistic next features',
      'Prioritize by impact vs effort',
      'Assign sprint ownership'
    ]
  };

  const agentProposals = [
    {
      agent: 'Taylor 💡 (Visionary)',
      proposal: 'Analytics Dashboard - THE KILLER FEATURE',
      reasoning: [
        'Resellers need to see profit trends',
        'Which items sell best? Which sit forever?',
        'Monthly/weekly revenue charts',
        'Category performance breakdown',
        'Best performing sizes/brands'
      ],
      features: [
        'Profit over time chart (line graph)',
        'Category breakdown (pie chart)',
        'Top 10 most profitable items',
        'Slow movers (items unsold >30 days)',
        'Average profit per category',
        'Monthly revenue summary'
      ],
      effort: 'MEDIUM (2-3 hours)',
      impact: 'HIGH - This is what pros need!',
      priority: '⭐⭐⭐⭐⭐ MUST HAVE'
    },
    {
      agent: 'Alex 👨‍💻 (Frontend)',
      proposal: 'Sorting & Advanced Filters',
      reasoning: [
        'Current app has basic filters (status, tags)',
        'Users need to sort by profit, date, name',
        'Need price range filters',
        'Need date range filters'
      ],
      features: [
        'Sort dropdown: Date, Profit, Name, Price',
        'Price range slider ($0-$500)',
        'Date range picker',
        'Multi-select tags (AND/OR logic)',
        'Save filter presets'
      ],
      effort: 'LOW (1-2 hours)',
      impact: 'MEDIUM - Nice to have',
      priority: '⭐⭐⭐⭐ HIGH'
    },
    {
      agent: 'Riley 💾 (Data)',
      proposal: 'Auto-Backup & Version History',
      reasoning: [
        'User has 79 items - what if localStorage corrupts?',
        'Need automatic backups',
        'Version history for undo'
      ],
      features: [
        'Auto-backup every 10 items added',
        'Download backup prompt',
        'Restore from backup',
        'Version history (last 5 saves)',
        'Cloud backup option (future)'
      ],
      effort: 'LOW (1 hour)',
      impact: 'HIGH - Protects user data',
      priority: '⭐⭐⭐⭐⭐ CRITICAL'
    },
    {
      agent: 'Morgan 🔀 (Backend)',
      proposal: 'Bulk Operations',
      reasoning: [
        'Managing 79 items one-by-one is painful',
        'Need to mark multiple as SOLD',
        'Need to delete multiple at once',
        'Need to bulk update prices'
      ],
      features: [
        'Select multiple items (checkbox)',
        'Bulk delete with confirmation',
        'Bulk status change',
        'Bulk tag assignment',
        'Bulk export selected items'
      ],
      effort: 'MEDIUM (2 hours)',
      impact: 'HIGH - Saves tons of time',
      priority: '⭐⭐⭐⭐⭐ MUST HAVE'
    },
    {
      agent: 'Jordan 🚀 (DevOps)',
      proposal: 'Performance Monitoring & Optimization',
      reasoning: [
        'App loads 79 items at once',
        'Could be slow with 500+ items',
        'Need virtual scrolling',
        'Need lazy loading'
      ],
      features: [
        'Virtual scrolling for 1000+ items',
        'Lazy load images (when we add them)',
        'Debounced search',
        'Performance metrics dashboard',
        'Load time monitoring'
      ],
      effort: 'HIGH (3-4 hours)',
      impact: 'MEDIUM - Future-proofing',
      priority: '⭐⭐⭐ NICE TO HAVE'
    },
    {
      agent: 'Quinn 🧠 (Communication)',
      proposal: 'Quick Actions & Keyboard Shortcuts',
      reasoning: [
        'Power users want speed',
        'Keyboard shortcuts = pro feature',
        'Quick actions = less clicking'
      ],
      features: [
        'Ctrl+N: Add new item',
        'Ctrl+F: Focus search',
        'Ctrl+E: Export data',
        'Ctrl+S: Save (when editing)',
        'Escape: Close modals',
        'Quick action buttons on cards'
      ],
      effort: 'LOW (1 hour)',
      impact: 'MEDIUM - Power user delight',
      priority: '⭐⭐⭐ NICE TO HAVE'
    },
    {
      agent: 'Devin 📚 (Documentation)',
      proposal: 'User Guide & Onboarding',
      reasoning: [
        'New users don\'t know all features',
        'Need guided tour',
        'Need help documentation'
      ],
      features: [
        'First-time user tutorial',
        'Tooltips on all features',
        'Help modal with FAQs',
        'Video walkthrough embed',
        'Keyboard shortcuts guide'
      ],
      effort: 'MEDIUM (2 hours)',
      impact: 'MEDIUM - Better UX',
      priority: '⭐⭐⭐ NICE TO HAVE'
    }
  ];

  const quinnAnalysis = {
    topPriorities: [
      {
        rank: 1,
        feature: 'Analytics Dashboard (Taylor)',
        reason: 'THIS is what makes it the GREATEST tracker. Resellers NEED profit insights.',
        effort: 'Medium',
        impact: 'Massive'
      },
      {
        rank: 2,
        feature: 'Bulk Operations (Morgan)',
        reason: 'Managing 79 items individually = painful. This saves hours.',
        effort: 'Medium',
        impact: 'Huge time saver'
      },
      {
        rank: 3,
        feature: 'Auto-Backup (Riley)',
        reason: 'Data protection is critical. User can\'t lose 79 items.',
        effort: 'Low',
        impact: 'Essential safety net'
      },
      {
        rank: 4,
        feature: 'Sorting & Filters (Alex)',
        reason: 'Easy win. Quick to build, immediate value.',
        effort: 'Low',
        impact: 'Good UX improvement'
      }
    ],
    recommendedSprints: [
      {
        sprint: 'Sprint 4 (Day 2 Priority)',
        features: [
          'Auto-Backup System (Riley) - 1 hour',
          'Sorting & Advanced Filters (Alex) - 2 hours',
          'Bulk Operations (Morgan) - 2 hours'
        ],
        totalTime: '5 hours',
        impact: 'User can manage large inventory efficiently + data safety'
      },
      {
        sprint: 'Sprint 5 (Day 2 Stretch Goal)',
        features: [
          'Analytics Dashboard Phase 1 (Taylor + Alex) - 3 hours',
          'Basic charts: Profit trends, category breakdown'
        ],
        totalTime: '3 hours',
        impact: 'THE differentiator - profit insights'
      }
    ],
    teamAssignments: {
      'Riley': 'Sprint 4 - Auto-backup system',
      'Alex': 'Sprint 4 - Sorting & filters UI',
      'Morgan': 'Sprint 4 - Bulk operations backend',
      'Taylor': 'Sprint 5 - Analytics design & data',
      'Jordan': 'Sprint 5 - Performance monitoring',
      'Devin': 'Documentation for all new features',
      'Quinn': 'Coordinate, review code, ensure no breaking changes'
    }
  };

  const consensus = {
    decision: 'BUILD SPRINT 4 FIRST - The Power User Toolkit',
    sprint4Features: [
      '✅ Auto-Backup System',
      '✅ Sorting (6 options: Date, Profit, Name, Price)',
      '✅ Advanced Filters (Price range, Date range)',
      '✅ Bulk Operations (Select, Delete, Status change)'
    ],
    sprint5Plan: 'Analytics Dashboard Phase 1',
    estimatedTime: '5-6 hours for Sprint 4',
    managerApprovalNeeded: true
  };

  console.log('📊 QUINN\'S ANALYSIS:');
  console.log('═══════════════════════════════════════════════════');
  quinnAnalysis.topPriorities.forEach(p => {
    console.log(`\n${p.rank}. ${p.feature}`);
    console.log(`   Reason: ${p.reason}`);
    console.log(`   Effort: ${p.effort} | Impact: ${p.impact}`);
  });

  console.log('\n\n🎯 TEAM CONSENSUS:');
  console.log('═══════════════════════════════════════════════════');
  console.log(`Decision: ${consensus.decision}`);
  console.log('\nSprint 4 Features:');
  consensus.sprint4Features.forEach(f => console.log(`  ${f}`));
  console.log(`\nEstimated Time: ${consensus.estimatedTime}`);

  console.log('\n\n👥 TEAM ASSIGNMENTS:');
  console.log('═══════════════════════════════════════════════════');
  Object.entries(quinnAnalysis.teamAssignments).forEach(([agent, task]) => {
    console.log(`${agent}: ${task}`);
  });

  // Create Notion blocks for meeting
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
          text: { content: '🎯 TEAM MEETING - Day 2 Planning' }
        }],
        color: 'blue'
      }
    },
    {
      object: 'block',
      type: 'callout',
      callout: {
        icon: { emoji: '🎮' },
        color: 'blue_background',
        rich_text: [{
          type: 'text',
          text: { content: 'Goal: Build the GREATEST reselling closet tracker ever!' },
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
          text: { content: '🧠 Quinn\'s Priority Analysis' }
        }]
      }
    }
  ];

  quinnAnalysis.topPriorities.forEach(p => {
    blocks.push({
      object: 'block',
      type: 'callout',
      callout: {
        icon: { emoji: p.rank === 1 ? '🥇' : p.rank === 2 ? '🥈' : '🥉' },
        color: p.rank === 1 ? 'green_background' : 'gray_background',
        rich_text: [{
          type: 'text',
          text: { content: `#${p.rank}: ${p.feature} - ${p.reason}` }
        }]
      }
    });
  });

  blocks.push({
    object: 'block',
    type: 'heading_2',
    heading_2: {
      rich_text: [{
        type: 'text',
        text: { content: '✅ Team Consensus - SPRINT 4' }
      }],
      color: 'green'
    }
  });

  consensus.sprint4Features.forEach(feature => {
    blocks.push({
      object: 'block',
      type: 'bulleted_list_item',
      bulleted_list_item: {
        rich_text: [{
          type: 'text',
          text: { content: feature },
          annotations: { bold: true }
        }]
      }
    });
  });

  blocks.push({
    object: 'block',
    type: 'heading_3',
    heading_3: {
      rich_text: [{
        type: 'text',
        text: { content: '👥 Assigned Tasks' }
      }]
    }
  });

  Object.entries(quinnAnalysis.teamAssignments).forEach(([agent, task]) => {
    blocks.push({
      object: 'block',
      type: 'to_do',
      to_do: {
        rich_text: [{
          type: 'text',
          text: { content: `${agent}: ${task}` }
        }],
        checked: false
      }
    });
  });

  blocks.push({
    object: 'block',
    type: 'callout',
    callout: {
      icon: { emoji: '⏰' },
      color: 'yellow_background',
      rich_text: [{
        type: 'text',
        text: { content: `Manager Approval Needed! Estimated time: ${consensus.estimatedTime}` },
        annotations: { bold: true }
      }]
    }
  });

  try {
    await makeNotionRequest('PATCH', `/v1/blocks/${PAGE_ID}/children`, { children: blocks });
    console.log('\n\n✅ Meeting notes saved to Notion!');
  } catch (error) {
    console.error('\n❌ Failed to save to Notion:', error.message);
  }

  return { quinnAnalysis, consensus };
}

createTeamMeeting()
  .then((result) => {
    console.log('\n\n📋 DEVIN\'S MEETING SUMMARY:');
    console.log('═══════════════════════════════════════════════════');
    console.log('All agents participated. Consensus reached.');
    console.log('Sprint 4 approved by team (pending manager approval).');
    console.log('Documentation will be updated as features are built.');
    console.log('\n✅ Meeting complete! Ready for manager decision.');
    process.exit(0);
  })
  .catch(error => {
    console.error('Meeting failed:', error);
    process.exit(1);
  });
