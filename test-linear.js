/**
 * Quick Linear API test
 */

const API_KEY = process.env.LINEAR_API_KEY || 'your_linear_api_key_here';

async function testLinear() {
  console.log('Testing Linear API connection...\n');

  try {
    // Test viewer query
    const response = await fetch('https://api.linear.app/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': API_KEY,
      },
      body: JSON.stringify({
        query: `
          query {
            viewer {
              id
              name
              email
            }
            organization {
              id
              name
              urlKey
            }
            teams {
              nodes {
                id
                name
                key
              }
            }
          }
        `,
      }),
    });

    const data = await response.json();

    if (data.errors) {
      console.error('❌ GraphQL errors:', JSON.stringify(data.errors, null, 2));
      process.exit(1);
    }

    console.log('✅ Linear API connection successful!\n');
    console.log('👤 Viewer:', data.data.viewer);
    console.log('\n🏢 Organization:', data.data.organization);
    console.log('\n📋 Teams:', data.data.teams.nodes.map(t => `${t.name} (${t.key})`).join(', '));

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

testLinear();
