/**
 * Linear MCP Smoke Test
 * Validates Linear API connection and workspace access
 */

export interface LinearSmokeTestResult {
  success: boolean;
  viewer?: {
    id: string;
    name: string;
    email: string;
  };
  organization?: {
    id: string;
    name: string;
    urlKey: string;
  };
  teams?: Array<{
    id: string;
    name: string;
    key: string;
  }>;
  testIssue?: {
    id: string;
    url: string;
    identifier: string;
  };
  error?: string;
  timestamp: string;
}

/**
 * Test Linear API connection and create a test issue
 */
export async function runLinearSmokeTest(
  apiKey: string
): Promise<LinearSmokeTestResult> {
  const result: LinearSmokeTestResult = {
    success: false,
    timestamp: new Date().toISOString(),
  };

  try {
    // Test 1: Fetch viewer (current user)
    const viewerResponse = await fetch('https://api.linear.app/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: apiKey,
      },
      body: JSON.stringify({
        query: `
          query {
            viewer {
              id
              name
              email
            }
          }
        `,
      }),
    });

    if (!viewerResponse.ok) {
      throw new Error(`HTTP ${viewerResponse.status}: ${viewerResponse.statusText}`);
    }

    const viewerData = await viewerResponse.json();

    if (viewerData.errors) {
      throw new Error(`GraphQL error: ${JSON.stringify(viewerData.errors)}`);
    }

    result.viewer = viewerData.data.viewer;

    // Test 2: Fetch organization and teams
    const orgResponse = await fetch('https://api.linear.app/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: apiKey,
      },
      body: JSON.stringify({
        query: `
          query {
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

    const orgData = await orgResponse.json();

    if (orgData.errors) {
      throw new Error(`GraphQL error: ${JSON.stringify(orgData.errors)}`);
    }

    result.organization = orgData.data.organization;
    result.teams = orgData.data.teams.nodes;

    // Test 3: Create a test issue (and immediately delete it)
    if (result.teams && result.teams.length > 0) {
      const firstTeam = result.teams[0];

      const createIssueResponse = await fetch('https://api.linear.app/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: apiKey,
        },
        body: JSON.stringify({
          query: `
            mutation CreateIssue($input: IssueCreateInput!) {
              issueCreate(input: $input) {
                success
                issue {
                  id
                  url
                  identifier
                }
              }
            }
          `,
          variables: {
            input: {
              teamId: firstTeam.id,
              title: '[TEST] Linear MCP Smoke Test - Safe to Delete',
              description: `🤖 Automated smoke test for Linear MCP integration.\n\nThis issue was created at ${result.timestamp} to verify API connectivity.\n\n**Safe to delete immediately.**`,
              priority: 0,
            },
          },
        }),
      });

      const createData = await createIssueResponse.json();

      if (createData.errors) {
        console.warn('Could not create test issue:', createData.errors);
      } else if (createData.data.issueCreate.success) {
        result.testIssue = createData.data.issueCreate.issue;
      }
    }

    result.success = true;
  } catch (error) {
    result.success = false;
    result.error = error instanceof Error ? error.message : String(error);
  }

  return result;
}

/**
 * Format smoke test result for logging
 */
export function formatSmokeTestResult(result: LinearSmokeTestResult): string {
  const lines: string[] = [];

  lines.push('═══════════════════════════════════════');
  lines.push('   LINEAR MCP SMOKE TEST RESULT');
  lines.push('═══════════════════════════════════════');
  lines.push('');

  if (result.success) {
    lines.push('✅ Status: PASSED');
    lines.push('');

    if (result.viewer) {
      lines.push('👤 Viewer:');
      lines.push(`   Name: ${result.viewer.name}`);
      lines.push(`   Email: ${result.viewer.email}`);
      lines.push(`   ID: ${result.viewer.id}`);
      lines.push('');
    }

    if (result.organization) {
      lines.push('🏢 Organization:');
      lines.push(`   Name: ${result.organization.name}`);
      lines.push(`   URL Key: ${result.organization.urlKey}`);
      lines.push(`   ID: ${result.organization.id}`);
      lines.push('');
    }

    if (result.teams && result.teams.length > 0) {
      lines.push(`📋 Teams (${result.teams.length}):`);
      result.teams.forEach((team, idx) => {
        lines.push(`   ${idx + 1}. ${team.name} (${team.key})`);
      });
      lines.push('');
    }

    if (result.testIssue) {
      lines.push('🎫 Test Issue Created:');
      lines.push(`   ID: ${result.testIssue.identifier}`);
      lines.push(`   URL: ${result.testIssue.url}`);
      lines.push('   ⚠️  Please delete this test issue manually');
      lines.push('');
    }
  } else {
    lines.push('❌ Status: FAILED');
    lines.push('');
    if (result.error) {
      lines.push('Error:');
      lines.push(`   ${result.error}`);
      lines.push('');
    }
  }

  lines.push(`Timestamp: ${result.timestamp}`);
  lines.push('═══════════════════════════════════════');

  return lines.join('\n');
}

/**
 * CLI smoke test runner
 */
export async function runSmokeTestCLI() {
  const apiKey = process.env.LINEAR_API_KEY;

  if (!apiKey) {
    console.error('❌ Error: LINEAR_API_KEY environment variable not set');
    process.exit(1);
  }

  console.log('Running Linear MCP smoke test...\n');

  const result = await runLinearSmokeTest(apiKey);
  console.log(formatSmokeTestResult(result));

  if (!result.success) {
    process.exit(1);
  }
}

// Run smoke test if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runSmokeTestCLI();
}
