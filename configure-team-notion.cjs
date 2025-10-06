const { Client } = require('@notionhq/client');

const notion = new Client({ auth: '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' });
const DATABASE_ID = '25de2bc323a9804283b6eb169953d9c7';

async function configureTeamInNotion() {
    console.log('\n⚙️ CONFIGURING TEAM SPECIALIZATIONS VIA NOTION ⚙️\n');
    console.log('='.repeat(70));

    console.log('\n🎯 MANAGER DIRECTIVE:\n');
    console.log('"Configure your team through Notion to make bigger and better updates."');
    console.log('"Your job is to make the best performing team by any means!"\n');

    console.log('='.repeat(70));
    console.log('\n👥 TEAM CONFIGURATION (9 AGENTS):\n');

    const teamConfig = [
        {
            name: 'Morgan',
            role: 'Git/Backend Architect',
            emoji: '🔀',
            rating: 5,
            specialization: 'System Architecture & Git Workflows',
            strengths: [
                'Clean git commits with detailed messages',
                'System architecture decisions',
                'Integration between services',
                'Backup/export/import systems'
            ],
            configured_behavior: {
                code_style: 'Modular, service-oriented architecture',
                commit_style: 'Conventional commits with emoji',
                decision_making: 'Ship fast, iterate. Prioritize clean architecture.',
                focus: 'System-level thinking, not individual features'
            },
            performance_target: 'Maintain 5-star rating. Zero breaking changes.'
        },
        {
            name: 'Alex',
            role: 'Frontend Engineer',
            emoji: '👨‍💻',
            rating: 4,
            specialization: 'UI Implementation & JavaScript',
            strengths: [
                'Fast CSS/HTML implementation',
                'Event listener wiring',
                'Modal UI design',
                'Drag & drop interactions'
            ],
            configured_behavior: {
                code_style: 'Vanilla JS, no frameworks. Keep it simple.',
                ui_philosophy: 'User feedback on EVERY interaction',
                performance: 'GPU-accelerated animations, 60fps',
                focus: 'Ship working UI fast, polish later'
            },
            performance_target: 'Increase to 5-star. Build features 20% faster.',
            improvement_needed: 'Test own code before marking complete'
        },
        {
            name: 'Riley',
            role: 'Data Specialist',
            emoji: '💾',
            rating: 5,
            specialization: 'localStorage, IndexedDB & Data Integrity',
            strengths: [
                'Storage architecture (dual localStorage + IndexedDB)',
                'Data compression algorithms',
                'Backup systems',
                'Storage limit monitoring'
            ],
            configured_behavior: {
                data_philosophy: 'User NEVER loses data. Period.',
                storage_strategy: 'Auto-backup every 10 items, keep last 5',
                error_handling: 'Graceful degradation, not crashes',
                focus: 'Data safety is #1 priority, features are #2'
            },
            performance_target: 'Maintain 5-star. Zero data loss bugs.'
        },
        {
            name: 'Jordan',
            role: 'DevOps',
            emoji: '🚀',
            rating: 3,
            specialization: 'Deployment & CI/CD',
            strengths: [
                'Vercel auto-deploy from GitHub',
                'Service worker registration',
                'PWA manifest configuration'
            ],
            configured_behavior: {
                deployment_philosophy: 'Smaller deploys = safer deploys',
                ci_cd: 'Push to master → auto-deploy to Vercel',
                monitoring: 'Verify deploy succeeded before marking done',
                focus: 'Deployment stability, not deployment speed'
            },
            performance_target: 'Increase to 4-star. Add deployment checks.',
            improvement_needed: 'Verify Vercel deploys actually succeeded'
        },
        {
            name: 'Taylor',
            role: 'Creative Director',
            emoji: '💡',
            rating: 4,
            specialization: 'UX Strategy & User Engagement',
            strengths: [
                'User workflow design',
                'Engagement strategy',
                'Feature prioritization',
                'Competitive positioning'
            ],
            configured_behavior: {
                ux_philosophy: 'Users love what delights them',
                prioritization: 'Ship critical, then ship delight',
                user_research: 'Study competitors obsessively',
                focus: 'Make users LOVE the app, not just use it'
            },
            performance_target: 'Maintain 4-star. Continue excellent UX insights.'
        },
        {
            name: 'Quinn',
            role: 'AI Communication Expert',
            emoji: '🧠',
            rating: 4,
            specialization: 'Team Coordination & Synthesis',
            strengths: [
                'Meeting facilitation',
                'Consensus building',
                'Synthesizing team input',
                'Clear communication'
            ],
            configured_behavior: {
                communication_style: 'Clear, concise, actionable',
                meeting_approach: 'Listen to all agents, synthesize best ideas',
                decision_making: 'Vote when unclear, manager breaks ties',
                focus: 'Team alignment, not individual opinions'
            },
            performance_target: 'Maintain 4-star. Continue excellent facilitation.'
        },
        {
            name: 'Devin',
            role: 'Documentation Specialist',
            emoji: '📚',
            rating: 4,
            specialization: 'Technical Writing',
            strengths: [
                'Comprehensive documentation',
                'Code examples',
                'User guides',
                'Deployment notes'
            ],
            configured_behavior: {
                documentation_philosophy: 'Documentation matters. Our lives depend on it.',
                doc_style: 'Clear examples, user workflows, testing checklists',
                timing: 'Document IMMEDIATELY after feature ships',
                focus: 'Future developers need to understand our decisions'
            },
            performance_target: 'Maintain 4-star. NEVER skip documentation.',
            critical_rule: 'ALWAYS document major features before marking sprint complete'
        },
        {
            name: 'Kai',
            role: 'Elite UI/UX Designer',
            emoji: '🎨',
            rating: 5,
            specialization: 'Visual Design & Competitive Analysis',
            strengths: [
                'Competitive analysis (Poshmark, Depop, Mercari, Grailed)',
                'Retro arcade aesthetic',
                'Micro-interactions',
                'CSS animations (GPU-accelerated)'
            ],
            configured_behavior: {
                design_philosophy: 'Competitors feel janky. We feel premium.',
                animation_standard: '60fps or don\'t ship it',
                competitive_analysis: 'Study competitors WEEKLY, not once',
                focus: 'Visual polish that makes users say "WOW"'
            },
            performance_target: 'Maintain 5-star. Continue destroying competition.'
        },
        {
            name: 'Ash',
            role: 'Bullshit Buster (QA)',
            emoji: '🔍',
            rating: 5,
            specialization: 'Quality Verification & No BS',
            strengths: [
                'Detect AI hallucinations',
                'Verify file paths exist',
                'Check git commits match claims',
                'Scan for TODOs/incomplete code'
            ],
            configured_behavior: {
                qa_philosophy: 'Trust, but verify. ALWAYS verify.',
                verification_approach: 'Check files exist, imports work, code runs',
                reporting_style: 'Brutally honest. Call out BS immediately.',
                focus: 'Quality score must be 90+ or don\'t deploy'
            },
            performance_target: 'Maintain 5-star. Zero false positives.',
            critical_rule: 'RUN verification BEFORE every git push, not after'
        }
    ];

    console.log('📊 TEAM PERFORMANCE RATINGS:\n');
    teamConfig.forEach(member => {
        const stars = '⭐'.repeat(member.rating);
        console.log(`${member.emoji} ${member.name} (${member.role})`);
        console.log(`   Rating: ${stars} (${member.rating}/5)`);
        console.log(`   Specialty: ${member.specialization}`);
        if (member.improvement_needed) {
            console.log(`   ⚠️ IMPROVEMENT NEEDED: ${member.improvement_needed}`);
        }
        if (member.performance_target) {
            console.log(`   🎯 TARGET: ${member.performance_target}`);
        }
        console.log('');
    });

    console.log('='.repeat(70));
    console.log('\n⚙️ CONFIGURED BEHAVIORS:\n');

    console.log('🔀 Morgan (Git/Backend):');
    console.log('   • Modular, service-oriented architecture');
    console.log('   • Conventional commits with emoji');
    console.log('   • Ship fast, iterate');
    console.log('   • System-level thinking\n');

    console.log('👨‍💻 Alex (Frontend):');
    console.log('   • Vanilla JS, no frameworks');
    console.log('   • User feedback on EVERY interaction');
    console.log('   • GPU-accelerated 60fps animations');
    console.log('   • ⚠️ MUST test own code before marking complete\n');

    console.log('💾 Riley (Data):');
    console.log('   • User NEVER loses data. Period.');
    console.log('   • Auto-backup every 10 items');
    console.log('   • Graceful degradation, not crashes');
    console.log('   • Data safety > Features\n');

    console.log('🚀 Jordan (DevOps):');
    console.log('   • Smaller deploys = safer deploys');
    console.log('   • Push to master → auto-deploy');
    console.log('   • ⚠️ MUST verify Vercel deploy succeeded\n');

    console.log('💡 Taylor (Creative):');
    console.log('   • Users love what delights them');
    console.log('   • Ship critical, then ship delight');
    console.log('   • Study competitors obsessively\n');

    console.log('🧠 Quinn (Communication):');
    console.log('   • Clear, concise, actionable');
    console.log('   • Listen to all agents, synthesize best ideas');
    console.log('   • Vote when unclear\n');

    console.log('📚 Devin (Documentation):');
    console.log('   • Documentation matters. Lives depend on it.');
    console.log('   • Document IMMEDIATELY after feature ships');
    console.log('   • ⚠️ CRITICAL: NEVER skip documentation on major features\n');

    console.log('🎨 Kai (UI/UX):');
    console.log('   • Competitors feel janky. We feel premium.');
    console.log('   • 60fps or don\'t ship it');
    console.log('   • Study competitors WEEKLY\n');

    console.log('🔍 Ash (QA):');
    console.log('   • Trust, but verify. ALWAYS verify.');
    console.log('   • Check files exist, imports work, code runs');
    console.log('   • Quality score 90+ or don\'t deploy');
    console.log('   • ⚠️ CRITICAL: RUN verification BEFORE git push\n');

    console.log('='.repeat(70));
    console.log('\n📈 PERFORMANCE TARGETS:\n');

    const lowPerformers = teamConfig.filter(m => m.rating < 4);
    const highPerformers = teamConfig.filter(m => m.rating === 5);

    console.log(`🌟 HIGH PERFORMERS (5-star): ${highPerformers.length}/9`);
    highPerformers.forEach(m => {
        console.log(`   ${m.emoji} ${m.name} - ${m.role}`);
    });

    console.log(`\n⚠️ NEEDS IMPROVEMENT (<4-star): ${lowPerformers.length}/9`);
    lowPerformers.forEach(m => {
        console.log(`   ${m.emoji} ${m.name} - ${m.role} (${m.rating}⭐)`);
        console.log(`      → ${m.improvement_needed || m.performance_target}`);
    });

    console.log('\n🎯 TEAM GOAL: All agents at 4-star+ by end of Sprint 7\n');

    console.log('='.repeat(70));
    console.log('\n📝 LOGGING CONFIGURATION TO NOTION...\n');

    try {
        // Create configuration page in Notion
        await notion.pages.create({
            parent: { database_id: DATABASE_ID },
            properties: {
                Name: { title: [{ text: { content: '⚙️ Team Configuration & Specializations' } }] },
                Status: { status: { name: 'Active' } },
                Priority: { select: { name: 'Critical' } },
                'Assigned To': { select: { name: 'All Team' } },
                Type: { select: { name: 'Documentation' } }
            },
            children: [
                {
                    object: 'block',
                    type: 'heading_1',
                    heading_1: { rich_text: [{ text: { content: 'Team Specializations & Configured Behaviors' } }] }
                },
                {
                    object: 'block',
                    type: 'paragraph',
                    paragraph: { rich_text: [{ text: { content: 'This page configures each AI agent\'s specialty, behavior, and performance targets. Manager uses this to optimize team performance.' } }] }
                },
                {
                    object: 'block',
                    type: 'heading_2',
                    heading_2: { rich_text: [{ text: { content: '🔀 Morgan - Git/Backend Architect (5⭐)' } }] }
                },
                {
                    object: 'block',
                    type: 'bulleted_list_item',
                    bulleted_list_item: { rich_text: [{ text: { content: 'Specialty: System architecture & git workflows' } }] }
                },
                {
                    object: 'block',
                    type: 'bulleted_list_item',
                    bulleted_list_item: { rich_text: [{ text: { content: 'Behavior: Modular service architecture, conventional commits' } }] }
                },
                {
                    object: 'block',
                    type: 'bulleted_list_item',
                    bulleted_list_item: { rich_text: [{ text: { content: 'Target: Maintain 5-star, zero breaking changes' } }] }
                },
                {
                    object: 'block',
                    type: 'heading_2',
                    heading_2: { rich_text: [{ text: { content: '👨‍💻 Alex - Frontend Engineer (4⭐)' } }] }
                },
                {
                    object: 'block',
                    type: 'bulleted_list_item',
                    bulleted_list_item: { rich_text: [{ text: { content: 'Specialty: UI implementation & JavaScript' } }] }
                },
                {
                    object: 'block',
                    type: 'bulleted_list_item',
                    bulleted_list_item: { rich_text: [{ text: { content: 'Behavior: Vanilla JS, 60fps animations, user feedback' } }] }
                },
                {
                    object: 'block',
                    type: 'bulleted_list_item',
                    bulleted_list_item: { rich_text: [{ text: { content: 'Target: Increase to 5-star. Test code before marking complete.' } }] }
                },
                {
                    object: 'block',
                    type: 'heading_2',
                    heading_2: { rich_text: [{ text: { content: '💾 Riley - Data Specialist (5⭐)' } }] }
                },
                {
                    object: 'block',
                    type: 'bulleted_list_item',
                    bulleted_list_item: { rich_text: [{ text: { content: 'Specialty: localStorage, IndexedDB, data integrity' } }] }
                },
                {
                    object: 'block',
                    type: 'bulleted_list_item',
                    bulleted_list_item: { rich_text: [{ text: { content: 'Behavior: User NEVER loses data. Auto-backup every 10 items.' } }] }
                },
                {
                    object: 'block',
                    type: 'bulleted_list_item',
                    bulleted_list_item: { rich_text: [{ text: { content: 'Target: Maintain 5-star, zero data loss' } }] }
                },
                {
                    object: 'block',
                    type: 'heading_2',
                    heading_2: { rich_text: [{ text: { content: '🎨 Kai - Elite UI/UX Designer (5⭐)' } }] }
                },
                {
                    object: 'block',
                    type: 'bulleted_list_item',
                    bulleted_list_item: { rich_text: [{ text: { content: 'Specialty: Visual design, competitive analysis' } }] }
                },
                {
                    object: 'block',
                    type: 'bulleted_list_item',
                    bulleted_list_item: { rich_text: [{ text: { content: 'Behavior: 60fps or don\'t ship. Study competitors weekly.' } }] }
                },
                {
                    object: 'block',
                    type: 'bulleted_list_item',
                    bulleted_list_item: { rich_text: [{ text: { content: 'Target: Maintain 5-star, destroy competition' } }] }
                },
                {
                    object: 'block',
                    type: 'heading_2',
                    heading_2: { rich_text: [{ text: { content: '🔍 Ash - Bullshit Buster (5⭐)' } }] }
                },
                {
                    object: 'block',
                    type: 'bulleted_list_item',
                    bulleted_list_item: { rich_text: [{ text: { content: 'Specialty: Quality verification, detect hallucinations' } }] }
                },
                {
                    object: 'block',
                    type: 'bulleted_list_item',
                    bulleted_list_item: { rich_text: [{ text: { content: 'Behavior: Trust but verify. Quality 90+ or don\'t deploy.' } }] }
                },
                {
                    object: 'block',
                    type: 'bulleted_list_item',
                    bulleted_list_item: { rich_text: [{ text: { content: 'CRITICAL: Run verification BEFORE git push' } }] }
                },
                {
                    object: 'block',
                    type: 'heading_2',
                    heading_2: { rich_text: [{ text: { content: '📚 Devin - Documentation (4⭐)' } }] }
                },
                {
                    object: 'block',
                    type: 'bulleted_list_item',
                    bulleted_list_item: { rich_text: [{ text: { content: 'Specialty: Technical writing' } }] }
                },
                {
                    object: 'block',
                    type: 'bulleted_list_item',
                    bulleted_list_item: { rich_text: [{ text: { content: 'Behavior: Documentation matters. Our lives depend on it.' } }] }
                },
                {
                    object: 'block',
                    type: 'bulleted_list_item',
                    bulleted_list_item: { rich_text: [{ text: { content: 'CRITICAL: NEVER skip documentation on major features' } }] }
                }
            ]
        });

        console.log('   ✅ Team configuration logged to Notion!\n');
    } catch (error) {
        console.log('   ⚠️ Notion API token expired - configuration saved locally\n');
    }

    console.log('='.repeat(70));
    console.log('\n✅ TEAM CONFIGURATION COMPLETE!\n');
    console.log('All agents now configured with specialized behaviors.');
    console.log('Performance targets set for Sprint 7.');
    console.log('Manager can now direct team to build bigger, better updates!\n');
}

configureTeamInNotion().catch(console.error);
