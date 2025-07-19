#!/usr/bin/env node

/**
 * Test script to fetch a real issue from HookHaven and simulate the webhook
 * This allows testing @clide functionality with real GitHub data
 */

const https = require('https');
const http = require('http');
const crypto = require('crypto');

// Configuration
const REPO = 'shawn-storie/HookHaven';
const ISSUE_NUMBER = process.argv[2] || '1'; // Default to issue #1, or pass issue number as argument
const WEBHOOK_URL = process.argv[3] || 'http://localhost:4665/webhook'; // Default to local, or pass webhook URL
const WEBHOOK_SECRET = '0eafeebff81353f861742e1391ba371f045d1fbc586f9033f8e789954c7c9733';

console.log(`🎣 Hook Line Sinker - Issue Webhook Test Script`);
console.log(`📝 Fetching issue #${ISSUE_NUMBER} from ${REPO}`);
console.log(`🎯 Target webhook: ${WEBHOOK_URL}`);
console.log('');

/**
 * Fetch issue data using GitHub CLI
 */
function fetchIssue(repo, issueNumber) {
  return new Promise((resolve, reject) => {
    const { spawn } = require('child_process');
    
    const gh = spawn('gh', [
      'issue', 'view', issueNumber,
      '--repo', repo,
      '--json', 'number,title,body,state,labels,author,createdAt,updatedAt,url'
    ]);
    
    let data = '';
    let errorData = '';
    
    gh.stdout.on('data', (chunk) => {
      data += chunk.toString();
    });
    
    gh.stderr.on('data', (chunk) => {
      errorData += chunk.toString();
    });
    
    gh.on('close', (code) => {
      if (code === 0) {
        try {
          const ghIssue = JSON.parse(data);
          
          // Convert GitHub CLI format to API format
          const issue = {
            number: ghIssue.number,
            title: ghIssue.title,
            body: ghIssue.body,
            state: ghIssue.state.toLowerCase(),
            user: {
              login: ghIssue.author.login,
              id: ghIssue.author.id || 0
            },
            labels: ghIssue.labels || [],
            created_at: ghIssue.createdAt,
            updated_at: ghIssue.updatedAt,
            html_url: ghIssue.url
          };
          
          resolve(issue);
        } catch (err) {
          reject(new Error(`Failed to parse gh response: ${err.message}`));
        }
      } else {
        reject(new Error(`GitHub CLI error: ${errorData || 'Unknown error'}`));
      }
    });
    
    gh.on('error', (err) => {
      reject(new Error(`GitHub CLI failed: ${err.message}`));
    });
  });
}

/**
 * Create webhook payload in GitHub format
 */
function createWebhookPayload(issue) {
  return {
    action: 'opened',
    issue: {
      number: issue.number,
      title: issue.title,
      state: issue.state,
      body: issue.body,
      user: {
        login: issue.user.login,
        id: issue.user.id
      },
      labels: issue.labels,
      created_at: issue.created_at,
      updated_at: issue.updated_at,
      html_url: issue.html_url
    },
    repository: {
      name: REPO.split('/')[1],
      full_name: REPO,
      html_url: `https://github.com/${REPO}`,
      owner: {
        login: REPO.split('/')[0]
      }
    },
    sender: {
      login: issue.user.login,
      id: issue.user.id
    }
  };
}

/**
 * Generate HMAC signature for webhook verification
 */
function generateSignature(payload, secret) {
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(payload, 'utf8');
  return `sha256=${hmac.digest('hex')}`;
}

/**
 * Send webhook to HLS endpoint
 */
function sendWebhook(webhookUrl, payload, signature) {
  return new Promise((resolve, reject) => {
    const payloadString = JSON.stringify(payload);
    const url = new URL(webhookUrl);
    
    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payloadString),
        'X-GitHub-Event': 'issues',
        'X-GitHub-Delivery': `test-script-${Date.now()}`,
        'X-Hub-Signature-256': signature,
        'User-Agent': 'GitHub-Hookshot/test-script'
      }
    };

    const client = url.protocol === 'https:' ? https : http;
    
    const req = client.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            const response = JSON.parse(data);
            resolve({ statusCode: res.statusCode, response });
          } catch (err) {
            resolve({ statusCode: res.statusCode, response: data });
          }
        } else {
          reject(new Error(`Webhook failed: ${res.statusCode} - ${data}`));
        }
      });
    });
    
    req.on('error', (err) => {
      reject(new Error(`Webhook request failed: ${err.message}`));
    });
    
    req.write(payloadString);
    req.end();
  });
}

/**
 * Check if issue contains @clide tag
 */
function hasClideTag(issue) {
  const searchText = `${issue.title} ${issue.body}`.toLowerCase();
  return searchText.includes('@clide');
}

/**
 * Main execution
 */
async function main() {
  try {
    // Step 1: Fetch the issue from GitHub
    console.log('📡 Fetching issue from GitHub API...');
    const issue = await fetchIssue(REPO, ISSUE_NUMBER);
    
    console.log('✅ Issue fetched successfully:');
    console.log(`   Title: ${issue.title}`);
    console.log(`   Author: ${issue.user.login}`);
    console.log(`   State: ${issue.state}`);
    console.log(`   Labels: ${issue.labels.map(l => l.name).join(', ') || 'none'}`);
    console.log(`   URL: ${issue.html_url}`);
    
    // Check for @clide tag
    const hasClide = hasClideTag(issue);
    console.log(`   @clide tag: ${hasClide ? '✅ DETECTED' : '❌ NOT FOUND'}`);
    console.log('');
    
    // Step 2: Create webhook payload
    console.log('🔧 Creating webhook payload...');
    const webhookPayload = createWebhookPayload(issue);
    
    // Step 3: Generate signature
    const payloadString = JSON.stringify(webhookPayload);
    const signature = generateSignature(payloadString, WEBHOOK_SECRET);
    
    console.log('🔐 Generated HMAC signature for verification');
    console.log(`📦 Payload size: ${Buffer.byteLength(payloadString)} bytes`);
    console.log('');
    
    // Step 4: Send webhook
    console.log('🚀 Sending webhook to HLS...');
    const result = await sendWebhook(WEBHOOK_URL, webhookPayload, signature);
    
    console.log('✅ Webhook sent successfully:');
    console.log(`   Status: ${result.statusCode}`);
    console.log(`   Response:`, result.response);
    console.log('');
    
    if (hasClide) {
      console.log('🤖 Expected behavior:');
      console.log('   1. ✅ Webhook received and verified');
      console.log('   2. ✅ Issue parsed with GitHub CLI template');
      console.log('   3. ✅ @clide tag detected in payload');
      console.log('   4. ✅ Claude auto-execution triggered');
      console.log('   5. ✅ GitHub CLI verification: gh issue view 1 --repo shawn-storie/HookHaven');
      console.log('   6. ✅ Claude analysis stored in database');
      console.log('');
      console.log('💡 Check the HLS logs with: pm2 logs hls --lines 20');
      console.log('💡 View results at: https://hls.zpaper.com/ or http://localhost:4665/');
    } else {
      console.log('ℹ️  This issue does not contain @clide tag, so Claude will not auto-execute');
      console.log('💡 Manual execution available through the web interface');
    }
    
  } catch (error) {
    console.error('❌ Script failed:', error.message);
    process.exit(1);
  }
}

// Help text
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`
Usage: node test-issue-webhook.js [issue_number] [webhook_url]

Arguments:
  issue_number    GitHub issue number to fetch (default: 1)
  webhook_url     Webhook endpoint URL (default: http://localhost:4665/webhook)

Examples:
  node test-issue-webhook.js                                    # Test issue #1 on localhost
  node test-issue-webhook.js 5                                  # Test issue #5 on localhost  
  node test-issue-webhook.js 1 https://hls.zpaper.com/webhook   # Test issue #1 on production
  
This script:
1. Fetches a real issue from the HookHaven repository
2. Creates a properly formatted GitHub webhook payload
3. Signs it with the correct HMAC signature
4. Sends it to the HLS webhook endpoint
5. Tests @clide auto-execution if the tag is present
`);
  process.exit(0);
}

// Run the script
main();