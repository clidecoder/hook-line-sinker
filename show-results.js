#!/usr/bin/env node

/**
 * Display the results of the @clide auto-execution test
 */

const http = require('http');

async function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (err) {
          reject(err);
        }
      });
    });
    req.on('error', reject);
  });
}

async function main() {
  try {
    console.log('🎣 Hook Line Sinker - @clide Auto-Execution Results\n');
    
    // Get latest webhook
    const webhooks = await fetchJson('http://localhost:4665/api/webhooks');
    const latestWebhook = webhooks[0];
    
    console.log('📨 Latest Webhook:');
    console.log(`   ID: ${latestWebhook.id}`);
    console.log(`   Event: ${latestWebhook.event_type}`);
    console.log(`   Repository: ${latestWebhook.repository}`);
    console.log(`   Delivery ID: ${latestWebhook.delivery_id}`);
    console.log(`   Verified: ${latestWebhook.verified ? '✅' : '❌'}`);
    console.log(`   Timestamp: ${latestWebhook.timestamp}\n`);
    
    // Get latest parsed prompt
    const parsedPrompts = await fetchJson('http://localhost:4665/api/parsed-prompts');
    const latestPrompt = parsedPrompts[0];
    
    console.log('📝 Latest Parsed Prompt:');
    console.log(`   ID: ${latestPrompt.id}`);
    console.log(`   Repository: ${latestPrompt.repository}`);
    console.log(`   Event Type: ${latestPrompt.event_type}`);
    console.log(`   Created: ${latestPrompt.created_at}`);
    console.log(`   Webhook ID: ${latestPrompt.webhook_id}\n`);
    
    // Check for Claude response
    try {
      const claudeResponse = await fetchJson(`http://localhost:4665/api/claude-responses/${latestPrompt.id}`);
      
      console.log('🤖 Claude Auto-Execution:');
      console.log(`   Response ID: ${claudeResponse.id}`);
      console.log(`   Execution Time: ${claudeResponse.execution_time}ms`);
      console.log(`   Exit Code: ${claudeResponse.exit_code}`);
      console.log(`   Created: ${claudeResponse.created_at}`);
      console.log(`   Status: ${claudeResponse.exit_code === 0 ? '✅ SUCCESS' : '❌ FAILED'}\n`);
      
      if (claudeResponse.response_content) {
        console.log('💬 Claude Response (first 500 characters):');
        console.log('─'.repeat(60));
        console.log(claudeResponse.response_content.substring(0, 500) + '...');
        console.log('─'.repeat(60));
        console.log();
      }
      
      console.log('🌐 View Full Results:');
      console.log(`   Web Interface: http://localhost:4665/`);
      console.log(`   Production: https://hls.zpaper.com/`);
      console.log(`   Direct Response: http://localhost:4665/api/claude-responses/${latestPrompt.id}`);
      
    } catch (err) {
      console.log('🤖 Claude Auto-Execution: ❌ No response found');
      console.log(`   This could mean:`);
      console.log(`   - @clide tag was not detected`);
      console.log(`   - Claude execution is still in progress`);
      console.log(`   - Claude execution failed`);
    }
    
  } catch (error) {
    console.error('❌ Failed to fetch results:', error.message);
  }
}

main();