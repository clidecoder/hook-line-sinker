const { exec } = require('child_process');
const PromptModel = require('../models/prompt');
const ClaudeResponseModel = require('../models/claudeResponse');

async function autoExecuteClaude(promptId) {
  try {
    const prompt = await PromptModel.getById(promptId);
    if (!prompt) {
      console.error(`Prompt ${promptId} not found`);
      return;
    }
    
    console.log(`Auto-executing Claude for prompt ${promptId} (webhook ${prompt.webhook_id})`);
    
    const startTime = Date.now();
    
    // Use Claude CLI with dangerous permissions flag
    const command = `claude -p --dangerously-skip-permissions`;
    
    const child = exec(command, {
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer for large outputs
      timeout: 300000 // 5 minute timeout
    });
    
    // Send the prompt content via stdin
    child.stdin.write(prompt.parsed_content);
    child.stdin.end();
    
    let output = '';
    let error = '';
    
    child.stdout.on('data', (data) => {
      output += data;
    });
    
    child.stderr.on('data', (data) => {
      error += data;
    });
    
    child.on('close', async (code) => {
      const executionTime = Date.now() - startTime;
      
      try {
        await ClaudeResponseModel.create({
          prompt_id: promptId,
          response_content: output,
          execution_time: executionTime,
          exit_code: code,
          error_message: error || null
        });
        
        console.log(`Claude execution completed for prompt ${promptId} in ${executionTime}ms with exit code ${code}`);
      } catch (err) {
        console.error(`Error saving Claude response for prompt ${promptId}:`, err);
      }
    });
    
  } catch (error) {
    console.error(`Error auto-executing Claude for prompt ${promptId}:`, error);
  }
}

async function executeClaude(promptId) {
  const prompt = await PromptModel.getById(promptId);
  if (!prompt) {
    throw new Error('Prompt not found');
  }
  
  console.log(`Executing Claude for prompt ${promptId}`);
  
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    
    // Use Claude CLI with dangerous permissions flag
    const command = `claude -p --dangerously-skip-permissions`;
    
    const child = exec(command, {
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer
      timeout: 300000 // 5 minute timeout
    });
    
    // Send the prompt content via stdin
    child.stdin.write(prompt.parsed_content);
    child.stdin.end();
    
    let output = '';
    let error = '';
    
    child.stdout.on('data', (data) => {
      output += data;
    });
    
    child.stderr.on('data', (data) => {
      error += data;
    });
    
    child.on('close', async (code) => {
      const executionTime = Date.now() - startTime;
      
      try {
        const responseId = await ClaudeResponseModel.create({
          prompt_id: promptId,
          response_content: output,
          execution_time: executionTime,
          exit_code: code,
          error_message: error || null
        });
        
        resolve({
          id: responseId,
          prompt_id: promptId,
          response_content: output,
          execution_time: executionTime,
          exit_code: code,
          error_message: error || null
        });
      } catch (err) {
        reject(err);
      }
    });
    
    child.on('error', (err) => {
      reject(err);
    });
  });
}

module.exports = {
  autoExecuteClaude,
  executeClaude
};