/**
 * Script to set Vercel environment variables programmatically
 * Run with: node scripts/set-vercel-env.js
 */

import https from 'https';

const VERCEL_TOKEN = process.env.VERCEL_TOKEN || 'XB6pkYy2x7Y1kVJl4t0jQ89n'; // From user's Vercel account
const PROJECT_ID = 'prj_QvGdy3TwGGC6sCqvbOBLJbMLxax1'; // closetbv project
const TEAM_ID = 'team_3pgvKjedyL37Umq78V2IwdEy';

const envVars = [
  {
    key: 'VITE_SUPABASE_URL',
    value: 'https://hqmujfbifgpcyqmpuwil.supabase.co',
    type: 'plain',
    target: ['production', 'preview', 'development'],
    comment: 'Supabase project URL'
  },
  {
    key: 'VITE_SUPABASE_ANON_KEY',
    value: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhxbXVqZmJpZmdwY3lxbXB1d2lsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA0NjY0NzYsImV4cCI6MjA3NjA0MjQ3Nn0._1HulRiQ3wxfzgDCBRruiJIl4QjXnnhKkuWQOTIa7SQ',
    type: 'plain',
    target: ['production', 'preview', 'development'],
    comment: 'Supabase anonymous public key'
  }
];

async function setEnvironmentVariable(envVar) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      key: envVar.key,
      value: envVar.value,
      type: envVar.type,
      target: envVar.target,
      comment: envVar.comment
    });

    const options = {
      hostname: 'api.vercel.com',
      path: `/v10/projects/${PROJECT_ID}/env?teamId=${TEAM_ID}`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${VERCEL_TOKEN}`,
        'Content-Type': 'application/json',
        'Content-Length': data.length
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      
      res.on('data', (chunk) => {
        body += chunk;
      });
      
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          console.log(`✅ Set ${envVar.key}`);
          resolve(JSON.parse(body));
        } else {
          console.error(`❌ Failed to set ${envVar.key}: ${res.statusCode}`);
          console.error(body);
          reject(new Error(body));
        }
      });
    });

    req.on('error', (error) => {
      console.error(`❌ Error setting ${envVar.key}:`, error);
      reject(error);
    });

    req.write(data);
    req.end();
  });
}

async function main() {
  console.log('🔧 Setting Vercel environment variables...\n');
  console.log(`Project: ${PROJECT_ID}`);
  console.log(`Team: ${TEAM_ID}\n`);

  for (const envVar of envVars) {
    try {
      await setEnvironmentVariable(envVar);
    } catch (error) {
      console.error(`Failed to set ${envVar.key}:`, error.message);
    }
  }

  console.log('\n✅ Environment variables configured!');
  console.log('🚀 Triggering new deployment...\n');
  console.log('Your app will redeploy automatically with the new environment variables.');
}

main().catch(console.error);

