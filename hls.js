const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const Handlebars = require('handlebars');
const swaggerUi = require('swagger-ui-express');
const swaggerDocument = require('./swagger.json');

const app = express();
const PORT = 4665; // HOOK on phone keypad

// Middleware to capture raw body for signature verification
app.use(express.json({ 
  verify: (req, res, buf, encoding) => {
    req.rawBody = buf.toString(encoding || 'utf8');
  }
}));

// Middleware for URL-encoded payloads (GitHub sometimes sends these)
app.use(express.urlencoded({ 
  extended: true,
  verify: (req, res, buf, encoding) => {
    if (!req.rawBody) {
      req.rawBody = buf.toString(encoding || 'utf8');
    }
  }
}));

// Middleware for text/plain content (for prompt saving)
app.use(express.text({ type: 'text/plain' }));

// Initialize SQLite database
const db = new sqlite3.Database('./hls_webhooks.db');

// Create tables if they don't exist
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS webhooks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    event_type TEXT,
    action TEXT,
    delivery_id TEXT,
    signature TEXT,
    payload TEXT,
    sender_login TEXT,
    sender_id INTEGER,
    repository TEXT,
    verified BOOLEAN
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS parsed_prompts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    webhook_id INTEGER,
    repository TEXT,
    event_type TEXT,
    prompt_template TEXT,
    parsed_content TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(webhook_id) REFERENCES webhooks(id)
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS claude_responses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    prompt_id INTEGER,
    response_content TEXT,
    execution_time INTEGER,
    exit_code INTEGER,
    error_message TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(prompt_id) REFERENCES parsed_prompts(id)
  )`);
});

// Verify GitHub webhook signature
function verifySignature(payload, signature, secret) {
  if (!secret) return true; // Skip verification if no secret configured
  
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(payload, 'utf8');
  const expected = `sha256=${hmac.digest('hex')}`;
  
  return crypto.timingSafeEqual(
    Buffer.from(signature || ''),
    Buffer.from(expected)
  );
}

// Get prompt template for repository and event type
function getPromptTemplate(repository, eventType) {
  // Try repo-specific prompt first
  const [owner, repo] = repository.split('/');
  const repoSpecificPath = path.join(__dirname, 'prompts', 'repos', owner, repo, `${eventType}.md`);
  
  if (fs.existsSync(repoSpecificPath)) {
    return fs.readFileSync(repoSpecificPath, 'utf8');
  }
  
  // Fall back to generic prompt
  const genericPath = path.join(__dirname, 'prompts', 'generic', `${eventType}.md`);
  if (fs.existsSync(genericPath)) {
    return fs.readFileSync(genericPath, 'utf8');
  }
  
  return null;
}

// Parse prompt template with webhook data
function parsePrompt(template, webhookData) {
  try {
    // Add stringified payload for {{payload}} template variable
    const templateData = {
      ...webhookData,
      payload: JSON.stringify(webhookData, null, 2)
    };
    
    const compiledTemplate = Handlebars.compile(template);
    return compiledTemplate(templateData);
  } catch (error) {
    console.error('Error parsing prompt template:', error);
    return `Error parsing template: ${error.message}`;
  }
}

// Check if payload contains @clide tag
function hasClideTag(webhookData) {
  // @clide auto-execution enabled for ALL events by default
  return true;
  
  /* Original @clide detection logic (commented out):
  const payloadString = JSON.stringify(webhookData).toLowerCase();
  
  // Check for @clide in common fields
  const fieldsToCheck = [
    webhookData.issue?.body,
    webhookData.issue?.title,
    webhookData.pull_request?.body,
    webhookData.pull_request?.title,
    webhookData.release?.body,
    webhookData.commits?.[0]?.message,
    // Check any comment fields
    webhookData.comment?.body
  ];
  
  for (const field of fieldsToCheck) {
    if (field && typeof field === 'string' && field.toLowerCase().includes('@clide')) {
      return true;
    }
  }
  
  return false;
  */
}

// Auto-execute Claude for parsed prompt
function autoExecuteClaude(promptId, repository, eventType) {
  const { spawn } = require('child_process');
  const startTime = Date.now();
  
  console.log(`🤖 Auto-executing Claude for @clide tag - Prompt ID: ${promptId} (${repository}/${eventType})`);
  
  // Get the parsed prompt
  db.get(`SELECT * FROM parsed_prompts WHERE id = ?`, [promptId], (err, row) => {
    if (err || !row) {
      console.error('Failed to get parsed prompt for auto-execution:', err);
      return;
    }
    
    // Execute claude -p with the parsed content and dangerous permissions flag
    console.log(`🔧 Executing: claude -p --dangerously-skip-permissions`);
    const claude = spawn('claude', ['-p', '--dangerously-skip-permissions'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: process.env
    });
    
    let output = '';
    let errorOutput = '';
    
    claude.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    claude.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });
    
    claude.on('close', (code) => {
      const executionTime = Date.now() - startTime;
      
      // Store Claude response in database
      db.run(`INSERT INTO claude_responses 
        (prompt_id, response_content, execution_time, exit_code, error_message) 
        VALUES (?, ?, ?, ?, ?)`,
        [promptId, output || '', executionTime, code, errorOutput || null],
        function(err) {
          if (err) {
            console.error('Failed to store auto-executed Claude response:', err);
          } else {
            console.log(`✓ Auto-executed Claude response stored - Response ID: ${this.lastID} (${executionTime}ms)`);
          }
        }
      );
    });
    
    claude.on('error', (error) => {
      console.error('Failed to auto-execute claude command:', error.message);
      console.error('Full error details:', error);
    });
    
    // Send the parsed prompt content to claude's stdin
    claude.stdin.write(row.parsed_content);
    claude.stdin.end();
  });
}

// Process and store parsed prompt
function processPrompt(webhookId, repository, eventType, webhookData) {
  const template = getPromptTemplate(repository, eventType);
  
  if (!template) {
    console.log(`No prompt template found for ${repository}/${eventType}`);
    return;
  }
  
  const parsedContent = parsePrompt(template, webhookData);
  
  // Store parsed prompt in database
  db.run(`INSERT INTO parsed_prompts 
    (webhook_id, repository, event_type, prompt_template, parsed_content) 
    VALUES (?, ?, ?, ?, ?)`,
    [webhookId, repository, eventType, template, parsedContent],
    function(err) {
      if (err) {
        console.error('Failed to store parsed prompt:', err);
      } else {
        const promptId = this.lastID;
        console.log(`✓ Parsed prompt stored for ${repository}/${eventType} - Prompt ID: ${promptId}`);
        
        // Check for @clide tag and auto-execute if found
        if (hasClideTag(webhookData)) {
          console.log(`🎯 @clide tag detected in ${repository}/${eventType} - Auto-executing Claude...`);
          autoExecuteClaude(promptId, repository, eventType);
        }
      }
    }
  );
}

// Webhook endpoint
app.post('/webhook', (req, res) => {
  const signature = req.headers['x-hub-signature-256'];
  const event = req.headers['x-github-event'];
  const deliveryId = req.headers['x-github-delivery'];
  
  // Get secret from environment or use empty string
  const secret = process.env.GITHUB_WEBHOOK_SECRET || '';
  const verified = verifySignature(req.rawBody, signature, secret);
  
  // Extract key information from payload - handle both JSON and URL-encoded
  let payload = req.body;
  
  // If GitHub sent URL-encoded data, the payload will be in a 'payload' field
  if (typeof payload === 'object' && payload.payload && typeof payload.payload === 'string') {
    try {
      payload = JSON.parse(payload.payload);
    } catch (e) {
      console.error('Failed to parse URL-encoded payload:', e);
      payload = req.body;
    }
  }
  
  // Handle different event types with varying payload structures
  let senderLogin = 'unknown';
  let senderId = null;
  let repository = 'unknown';
  
  if (payload.sender) {
    senderLogin = payload.sender.login || 'unknown';
    senderId = payload.sender.id || null;
  }
  
  if (payload.repository) {
    repository = payload.repository.full_name || 'unknown';
  } else if (payload.organization) {
    repository = payload.organization.login || 'unknown';
  } else if (payload.projects_v2_item) {
    repository = 'GitHub Projects';
  }
  
  const action = payload.action || null;
  
  // Log complete event to database - preserve everything for analysis
  const payloadString = JSON.stringify(payload, null, 2);
  
  // Log to database
  db.run(`INSERT INTO webhooks 
    (event_type, action, delivery_id, signature, payload, sender_login, sender_id, repository, verified) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [event, action, deliveryId, signature, payloadString, senderLogin, senderId, repository, verified],
    function(err) {
      if (err) {
        console.error('Database error:', err);
        console.error('Event:', event, 'Delivery:', deliveryId);
        res.status(500).json({ error: 'Failed to log webhook' });
      } else {
        const webhookId = this.lastID;
        console.log(`✓ Logged webhook: ${event} from ${senderLogin} (${repository}) - ID: ${deliveryId}`);
        
        // Process prompt template if available
        if (repository && repository !== 'unknown') {
          processPrompt(webhookId, repository, event, payload);
        }
        
        res.status(200).json({ 
          received: true, 
          event: event,
          action: action,
          repository: repository,
          verified: verified 
        });
      }
    }
  );
});

// Swagger API documentation
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument, {
  customSiteTitle: 'Hook Line Sinker API',
  customCss: '.swagger-ui .topbar { display: none; }',
  swaggerOptions: {
    docExpansion: 'none',
    defaultModelsExpandDepth: -1
  }
}));

// API endpoint to get webhook history
app.get('/api/webhooks', (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  const offset = parseInt(req.query.offset) || 0;
  
  db.all(`SELECT id, timestamp, event_type, action, delivery_id, sender_login, repository, verified 
          FROM webhooks 
          ORDER BY timestamp DESC 
          LIMIT ? OFFSET ?`, 
    [limit, offset], 
    (err, rows) => {
      if (err) {
        res.status(500).json({ error: err.message });
      } else {
        res.json(rows);
      }
    }
  );
});

// API endpoint to get specific webhook details
app.get('/api/webhooks/:id', (req, res) => {
  db.get(`SELECT * FROM webhooks WHERE id = ?`, [req.params.id], (err, row) => {
    if (err) {
      res.status(500).json({ error: err.message });
    } else if (!row) {
      res.status(404).json({ error: 'Webhook not found' });
    } else {
      // Parse the JSON payload for pretty display
      row.payload = JSON.parse(row.payload);
      res.json(row);
    }
  });
});

// API endpoint to get raw payload for analysis
app.get('/api/webhooks/:id/payload', (req, res) => {
  db.get(`SELECT payload FROM webhooks WHERE id = ?`, [req.params.id], (err, row) => {
    if (err) {
      res.status(500).json({ error: err.message });
    } else if (!row) {
      res.status(404).json({ error: 'Webhook not found' });
    } else {
      res.setHeader('Content-Type', 'application/json');
      res.send(row.payload);
    }
  });
});

// API endpoint to delete specific webhook
app.delete('/api/webhooks/:id', (req, res) => {
  db.run(`DELETE FROM webhooks WHERE id = ?`, [req.params.id], function(err) {
    if (err) {
      res.status(500).json({ error: err.message });
    } else if (this.changes === 0) {
      res.status(404).json({ error: 'Webhook not found' });
    } else {
      res.json({ deleted: true, id: req.params.id });
    }
  });
});

// API endpoints for prompt management

// Get all prompts
app.get('/api/prompts', (req, res) => {
  try {
    const prompts = { generic: {}, repos: {} };
    
    // Load generic prompts
    const genericDir = path.join(__dirname, 'prompts', 'generic');
    if (fs.existsSync(genericDir)) {
      const files = fs.readdirSync(genericDir);
      files.forEach(file => {
        if (file.endsWith('.md')) {
          const eventType = file.replace('.md', '');
          prompts.generic[eventType] = true; // Just indicate existence
        }
      });
    }
    
    // Load repo-specific prompts
    const reposDir = path.join(__dirname, 'prompts', 'repos');
    if (fs.existsSync(reposDir)) {
      const ownerDirs = fs.readdirSync(reposDir);
      ownerDirs.forEach(owner => {
        const ownerDirPath = path.join(reposDir, owner);
        if (fs.statSync(ownerDirPath).isDirectory()) {
          const repoDirs = fs.readdirSync(ownerDirPath);
          repoDirs.forEach(repo => {
            const repoDirPath = path.join(ownerDirPath, repo);
            if (fs.statSync(repoDirPath).isDirectory()) {
              const files = fs.readdirSync(repoDirPath);
              const repoName = `${owner}/${repo}`;
              prompts.repos[repoName] = {};
              files.forEach(file => {
                if (file.endsWith('.md')) {
                  const eventType = file.replace('.md', '');
                  prompts.repos[repoName][eventType] = true;
                }
              });
            }
          });
        }
      });
    }
    
    res.json(prompts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get repositories using GitHub CLI
app.get('/api/repositories', async (req, res) => {
  try {
    const { exec } = require('child_process');
    
    // Get both user repos and zpaper-com organization repos
    const commands = [
      'gh repo list --limit 100 --json name,owner',
      'gh repo list zpaper-com --limit 100 --json name,owner'
    ];
    
    let allRepos = [];
    let completed = 0;
    
    commands.forEach((command, index) => {
      exec(command, (error, stdout, stderr) => {
        if (!error && stdout) {
          try {
            const repos = JSON.parse(stdout);
            const repoNames = repos.map(repo => `${repo.owner.login}/${repo.name}`);
            allRepos = allRepos.concat(repoNames);
          } catch (parseError) {
            console.error(`Failed to parse gh output for command ${index}:`, parseError);
          }
        } else if (error) {
          console.error(`GitHub CLI error for command ${index}:`, error);
        }
        
        completed++;
        if (completed === commands.length) {
          // Remove duplicates and sort
          const uniqueRepos = [...new Set(allRepos)].sort();
          res.json(uniqueRepos);
        }
      });
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get specific generic prompt
app.get('/api/prompts/generic/:eventType', (req, res) => {
  try {
    const filePath = path.join(__dirname, 'prompts', 'generic', `${req.params.eventType}.md`);
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf8');
      res.setHeader('Content-Type', 'text/plain');
      res.send(content);
    } else {
      res.status(404).json({ error: 'Prompt not found' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get specific repo prompt
app.get('/api/prompts/repo/:repo/:eventType', (req, res) => {
  try {
    const repoName = decodeURIComponent(req.params.repo);
    const [owner, repo] = repoName.split('/');
    const filePath = path.join(__dirname, 'prompts', 'repos', owner, repo, `${req.params.eventType}.md`);
    
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf8');
      res.setHeader('Content-Type', 'text/plain');
      res.send(content);
    } else {
      res.status(404).json({ error: 'Prompt not found' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Save generic prompt
app.post('/api/prompts/generic/:eventType', (req, res) => {
  try {
    const filePath = path.join(__dirname, 'prompts', 'generic', `${req.params.eventType}.md`);
    fs.writeFileSync(filePath, req.body);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Save repo-specific prompt
app.post('/api/prompts/repo/:repo/:eventType', (req, res) => {
  try {
    const repoName = decodeURIComponent(req.params.repo);
    const [owner, repo] = repoName.split('/');
    const repoDir = path.join(__dirname, 'prompts', 'repos', owner, repo);
    
    if (!fs.existsSync(repoDir)) {
      fs.mkdirSync(repoDir, { recursive: true });
    }
    
    const filePath = path.join(repoDir, `${req.params.eventType}.md`);
    fs.writeFileSync(filePath, req.body);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete generic prompt
app.delete('/api/prompts/generic/:eventType', (req, res) => {
  try {
    const filePath = path.join(__dirname, 'prompts', 'generic', `${req.params.eventType}.md`);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      res.json({ success: true });
    } else {
      res.status(404).json({ error: 'Prompt not found' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete repo-specific prompt
app.delete('/api/prompts/repo/:repo/:eventType', (req, res) => {
  try {
    const repoName = decodeURIComponent(req.params.repo);
    const [owner, repo] = repoName.split('/');
    const filePath = path.join(__dirname, 'prompts', 'repos', owner, repo, `${req.params.eventType}.md`);
    
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      res.json({ success: true });
    } else {
      res.status(404).json({ error: 'Prompt not found' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API endpoints for parsed prompts

// Get all parsed prompts
app.get('/api/parsed-prompts', (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  const offset = parseInt(req.query.offset) || 0;
  const webhookId = req.query.webhook_id;
  
  let query = `SELECT pp.*, w.timestamp as webhook_timestamp, w.delivery_id, w.sender_login
               FROM parsed_prompts pp
               JOIN webhooks w ON pp.webhook_id = w.id`;
  let params = [];
  
  if (webhookId) {
    query += ` WHERE pp.webhook_id = ?`;
    params.push(webhookId);
  }
  
  query += ` ORDER BY pp.created_at DESC LIMIT ? OFFSET ?`;
  params.push(limit, offset);
  
  db.all(query, params, (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
    } else {
      res.json(rows);
    }
  });
});

// Get specific parsed prompt
app.get('/api/parsed-prompts/:id', (req, res) => {
  db.get(`SELECT pp.*, w.timestamp as webhook_timestamp, w.delivery_id, w.sender_login, w.payload
          FROM parsed_prompts pp
          JOIN webhooks w ON pp.webhook_id = w.id
          WHERE pp.id = ?`, [req.params.id], (err, row) => {
    if (err) {
      res.status(500).json({ error: err.message });
    } else if (!row) {
      res.status(404).json({ error: 'Parsed prompt not found' });
    } else {
      res.json(row);
    }
  });
});

// Get Claude response for a specific prompt
app.get('/api/claude-responses/:promptId', (req, res) => {
  db.get(`SELECT * FROM claude_responses WHERE prompt_id = ? ORDER BY created_at DESC LIMIT 1`, 
    [req.params.promptId], (err, row) => {
    if (err) {
      res.status(500).json({ error: err.message });
    } else if (!row) {
      res.status(404).json({ error: 'No Claude response found for this prompt' });
    } else {
      res.json(row);
    }
  });
});

// Execute claude -p with parsed prompt
app.post('/api/claude-execute/:id', (req, res) => {
  const { spawn } = require('child_process');
  const startTime = Date.now();
  
  // Get the parsed prompt
  db.get(`SELECT pp.*, w.timestamp as webhook_timestamp, w.delivery_id, w.sender_login
          FROM parsed_prompts pp
          JOIN webhooks w ON pp.webhook_id = w.id
          WHERE pp.id = ?`, [req.params.id], (err, row) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    } else if (!row) {
      return res.status(404).json({ error: 'Parsed prompt not found' });
    }
    
    // Execute claude -p with the parsed content and dangerous permissions flag
    console.log(`🔧 Executing: claude -p --dangerously-skip-permissions`);
    const claude = spawn('claude', ['-p', '--dangerously-skip-permissions'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: process.env
    });
    
    let output = '';
    let errorOutput = '';
    
    claude.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    claude.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });
    
    claude.on('close', (code) => {
      const executionTime = Date.now() - startTime;
      
      // Store Claude response in database
      db.run(`INSERT INTO claude_responses 
        (prompt_id, response_content, execution_time, exit_code, error_message) 
        VALUES (?, ?, ?, ?, ?)`,
        [row.id, output || '', executionTime, code, errorOutput || null],
        function(err) {
          if (err) {
            console.error('Failed to store Claude response:', err);
          } else {
            console.log(`✓ Claude response stored for prompt ${row.id} - Response ID: ${this.lastID}`);
          }
        }
      );
      
      if (code === 0) {
        res.json({
          success: true,
          output: output,
          execution_time: executionTime,
          repository: row.repository,
          event_type: row.event_type,
          prompt_id: row.id,
          webhook_id: row.webhook_id
        });
      } else {
        res.status(500).json({
          error: 'Claude execution failed',
          exit_code: code,
          stderr: errorOutput,
          execution_time: executionTime
        });
      }
    });
    
    claude.on('error', (error) => {
      console.error('Manual claude execution error:', error);
      res.status(500).json({
        error: 'Failed to execute claude command',
        message: error.message
      });
    });
    
    // Send the parsed prompt content to claude's stdin
    claude.stdin.write(row.parsed_content);
    claude.stdin.end();
    
    console.log(`🤖 Executing claude -p for prompt ${row.id} (${row.repository}/${row.event_type})`);
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Prompt management page
app.get('/prompts', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Prompt Management - Hook Line Sinker</title>
    <script src="https://unpkg.com/monaco-editor@latest/min/vs/loader.js"></script>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #0d1117;
            color: #c9d1d9;
            line-height: 1.6;
            height: 100vh;
            overflow: hidden;
        }
        
        .header {
            background: linear-gradient(135deg, #1f6feb 0%, #388bfd 100%);
            padding: 1rem 2rem;
            box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        }
        
        .header h1 {
            color: white;
            font-size: 1.5rem;
            margin-bottom: 0.5rem;
        }
        
        .back-link {
            color: rgba(255,255,255,0.9);
            text-decoration: none;
            font-size: 0.9rem;
        }
        
        .main-container {
            display: flex;
            height: calc(100vh - 120px);
        }
        
        .sidebar {
            width: 300px;
            background: #161b22;
            border-right: 1px solid #30363d;
            overflow-y: auto;
        }
        
        .editor-container {
            flex: 1;
            display: flex;
            flex-direction: column;
        }
        
        .toolbar {
            background: #21262d;
            padding: 1rem;
            border-bottom: 1px solid #30363d;
            display: flex;
            gap: 1rem;
            align-items: center;
        }
        
        .toolbar select, .toolbar input, .toolbar button {
            background: #0d1117;
            border: 1px solid #30363d;
            color: #c9d1d9;
            padding: 0.5rem;
            border-radius: 0.25rem;
        }
        
        .toolbar button {
            background: #238636;
            cursor: pointer;
        }
        
        .toolbar button:hover {
            background: #2ea043;
        }
        
        .toolbar .delete-btn {
            background: #da3633;
        }
        
        .toolbar .delete-btn:hover {
            background: #b22a00;
        }
        
        .editor {
            flex: 1;
        }
        
        .prompt-list {
            padding: 1rem;
        }
        
        .prompt-group {
            margin-bottom: 1rem;
        }
        
        .prompt-group h3 {
            color: #58a6ff;
            font-size: 0.9rem;
            margin-bottom: 0.5rem;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        
        .prompt-item {
            background: #0d1117;
            border: 1px solid #30363d;
            border-radius: 0.25rem;
            padding: 0.75rem;
            margin-bottom: 0.5rem;
            cursor: pointer;
            transition: border-color 0.2s;
        }
        
        .prompt-item:hover {
            border-color: #58a6ff;
        }
        
        .prompt-item.active {
            border-color: #238636;
            background: rgba(35, 134, 54, 0.1);
        }
        
        .prompt-name {
            font-weight: 500;
            margin-bottom: 0.25rem;
        }
        
        .prompt-type {
            font-size: 0.8rem;
            color: #8b949e;
        }
        
        .config-section {
            background: #161b22;
            border-top: 1px solid #30363d;
            padding: 1rem;
        }
        
        .config-row {
            display: flex;
            align-items: center;
            gap: 1rem;
            margin-bottom: 0.5rem;
        }
        
        .config-row label {
            font-size: 0.9rem;
            min-width: 120px;
        }
        
        .status-indicator {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            display: inline-block;
            margin-right: 0.5rem;
        }
        
        .status-enabled {
            background: #2ea043;
        }
        
        .status-disabled {
            background: #da3633;
        }
        
        .repo-selector {
            width: 200px;
        }
    </style>
</head>
<body>
    <div class="header">
        <a href="/" class="back-link">← Back to Hook Line Sinker</a>
        <h1>🤖 Prompt Management</h1>
    </div>
    
    <div class="main-container">
        <div class="sidebar">
            <div class="prompt-list">
                <div class="prompt-group">
                    <h3>Generic Prompts</h3>
                    <div id="genericPrompts"></div>
                </div>
                
                <div class="prompt-group">
                    <h3>Repository Specific</h3>
                    <div id="repoPrompts"></div>
                </div>
            </div>
            
            <div class="config-section">
                <div class="config-row">
                    <label>Auto Execute:</label>
                    <input type="checkbox" id="autoExecute">
                </div>
                <div class="config-row">
                    <label>@clide Tag Only:</label>
                    <input type="checkbox" id="clideTagOnly" checked>
                </div>
                <div class="config-row">
                    <label>Repository:</label>
                    <select id="repoSelector" class="repo-selector">
                        <option value="">Select Repository...</option>
                    </select>
                </div>
            </div>
        </div>
        
        <div class="editor-container">
            <div class="toolbar">
                <select id="eventTypeSelect">
                    <option value="">Select Event Type...</option>
                    <option value="push">push</option>
                    <option value="pull_request">pull_request</option>
                    <option value="issues">issues</option>
                    <option value="issue_comment">issue_comment</option>
                    <option value="release">release</option>
                    <option value="create">create</option>
                    <option value="delete">delete</option>
                    <option value="watch">watch</option>
                    <option value="fork">fork</option>
                    <option value="gollum">gollum</option>
                    <option value="commit_comment">commit_comment</option>
                    <option value="deployment">deployment</option>
                    <option value="deployment_status">deployment_status</option>
                    <option value="check_run">check_run</option>
                    <option value="check_suite">check_suite</option>
                    <option value="status">status</option>
                    <option value="repository">repository</option>
                    <option value="projects_v2">projects_v2</option>
                    <option value="projects_v2_item">projects_v2_item</option>
                    <option value="ping">ping</option>
                    <option value="workflow_run">workflow_run</option>
                    <option value="workflow_job">workflow_job</option>
                </select>
                <input type="text" id="promptName" placeholder="Prompt name..." style="flex: 1;">
                <button id="saveBtn">Save Prompt</button>
                <button id="deleteBtn" class="delete-btn">Delete</button>
                <span id="statusIndicator"></span>
            </div>
            
            <div id="editor" class="editor"></div>
        </div>
    </div>
    
    <script>
        let editor;
        let currentPrompt = null;
        let prompts = { generic: {}, repos: {} };
        
        // Initialize Monaco Editor
        require.config({ paths: { vs: 'https://unpkg.com/monaco-editor@latest/min/vs' } });
        require(['vs/editor/editor.main'], function () {
            editor = monaco.editor.create(document.getElementById('editor'), {
                value: '# Select or create a prompt\\n\\nUse Handlebars syntax for templating:\\n- {{repository.full_name}}\\n- {{action}}\\n- {{sender.login}}\\n- {{payload}}',
                language: 'markdown',
                theme: 'vs-dark',
                automaticLayout: true,
                minimap: { enabled: false },
                wordWrap: 'on'
            });
            
            loadPrompts();
            loadRepositories();
        });
        
        // Load prompts from server
        async function loadPrompts() {
            try {
                const response = await fetch('/api/prompts');
                prompts = await response.json();
                renderPromptList();
            } catch (err) {
                console.error('Failed to load prompts:', err);
            }
        }
        
        // Load repositories from GitHub CLI
        async function loadRepositories() {
            try {
                const response = await fetch('/api/repositories');
                const repos = await response.json();
                const select = document.getElementById('repoSelector');
                repos.forEach(repo => {
                    const option = document.createElement('option');
                    option.value = repo;
                    option.textContent = repo;
                    select.appendChild(option);
                });
            } catch (err) {
                console.error('Failed to load repositories:', err);
            }
        }
        
        // Render prompt list
        function renderPromptList() {
            const genericContainer = document.getElementById('genericPrompts');
            const repoContainer = document.getElementById('repoPrompts');
            
            // Generic prompts
            genericContainer.innerHTML = '';
            Object.entries(prompts.generic).forEach(([eventType, prompt]) => {
                const item = createPromptItem(eventType, prompt, 'generic');
                genericContainer.appendChild(item);
            });
            
            // Repository prompts
            repoContainer.innerHTML = '';
            Object.entries(prompts.repos).forEach(([repo, events]) => {
                Object.entries(events).forEach(([eventType, prompt]) => {
                    const displayName = \`\${repo}/\${eventType}\`;
                    const item = createPromptItem(displayName, prompt, 'repo');
                    repoContainer.appendChild(item);
                });
            });
        }
        
        // Create prompt list item
        function createPromptItem(name, prompt, type) {
            const item = document.createElement('div');
            item.className = 'prompt-item';
            item.innerHTML = \`
                <div class="prompt-name">\${name}</div>
                <div class="prompt-type">\${type === 'generic' ? 'Generic' : 'Repository Specific'}</div>
            \`;
            
            item.addEventListener('click', () => {
                document.querySelectorAll('.prompt-item').forEach(i => i.classList.remove('active'));
                item.classList.add('active');
                loadPrompt(name, type);
            });
            
            return item;
        }
        
        // Load prompt into editor
        async function loadPrompt(name, type) {
            try {
                let url;
                if (type === 'generic') {
                    url = \`/api/prompts/generic/\${name}\`;
                } else {
                    // For repo prompts, name is in format "owner/repo/eventType"
                    const parts = name.split('/');
                    if (parts.length >= 3) {
                        const owner = parts[0];
                        const repo = parts[1];
                        const eventType = parts.slice(2).join('/');
                        url = \`/api/prompts/repo/\${encodeURIComponent(owner + '/' + repo)}/\${eventType}\`;
                    } else {
                        // Handle case where name is just "repo/eventType"
                        const lastSlash = name.lastIndexOf('/');
                        const repoName = name.substring(0, lastSlash);
                        const eventType = name.substring(lastSlash + 1);
                        url = \`/api/prompts/repo/\${encodeURIComponent(repoName)}/\${eventType}\`;
                    }
                }
                
                const response = await fetch(url);
                const content = await response.text();
                
                editor.setValue(content);
                currentPrompt = { name, type };
                
                // Update toolbar
                if (type === 'generic') {
                    document.getElementById('eventTypeSelect').value = name;
                    document.getElementById('promptName').value = name;
                    document.getElementById('repoSelector').value = '';
                } else {
                    const lastSlash = name.lastIndexOf('/');
                    const repoName = name.substring(0, lastSlash);
                    const eventType = name.substring(lastSlash + 1);
                    document.getElementById('eventTypeSelect').value = eventType;
                    document.getElementById('promptName').value = name; // Show full name for existing prompts
                    document.getElementById('repoSelector').value = repoName;
                }
                
                updateStatus('Loaded');
            } catch (err) {
                console.error('Failed to load prompt:', err);
                updateStatus('Error loading');
            }
        }
        
        // Save prompt
        document.getElementById('saveBtn').addEventListener('click', async () => {
            const eventType = document.getElementById('eventTypeSelect').value;
            const promptName = document.getElementById('promptName').value;
            const repo = document.getElementById('repoSelector').value;
            const content = editor.getValue();
            
            if (!eventType || !promptName) {
                alert('Please select event type and enter prompt name');
                return;
            }
            
            try {
                let url;
                if (repo) {
                    url = \`/api/prompts/repo/\${encodeURIComponent(repo)}/\${eventType}\`;
                } else {
                    url = \`/api/prompts/generic/\${eventType}\`;
                }
                
                const response = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'text/plain' },
                    body: content
                });
                
                if (response.ok) {
                    updateStatus('Saved');
                    loadPrompts();
                } else {
                    const errorText = await response.text();
                    console.error('Save failed:', errorText);
                    updateStatus('Save failed');
                }
            } catch (err) {
                console.error('Failed to save prompt:', err);
                updateStatus('Save error');
            }
        });
        
        // Delete prompt
        document.getElementById('deleteBtn').addEventListener('click', async () => {
            if (!currentPrompt || !confirm('Delete this prompt?')) return;
            
            try {
                const url = currentPrompt.type === 'generic'
                    ? \`/api/prompts/generic/\${currentPrompt.name}\`
                    : \`/api/prompts/repo/\${currentPrompt.name}\`;
                
                const response = await fetch(url, { method: 'DELETE' });
                
                if (response.ok) {
                    editor.setValue('');
                    currentPrompt = null;
                    updateStatus('Deleted');
                    loadPrompts();
                } else {
                    updateStatus('Delete failed');
                }
            } catch (err) {
                console.error('Failed to delete prompt:', err);
                updateStatus('Delete error');
            }
        });
        
        // Update status indicator
        function updateStatus(message) {
            const indicator = document.getElementById('statusIndicator');
            indicator.textContent = message;
            setTimeout(() => indicator.textContent = '', 3000);
        }
        
        // Auto-suggest unique prompt name
        function generateUniquePromptName() {
            const eventType = document.getElementById('eventTypeSelect').value;
            const repo = document.getElementById('repoSelector').value;
            
            if (!eventType) return '';
            
            if (repo) {
                // For repo-specific prompts, suggest repo-specific name
                const repoName = repo.split('/')[1] || repo; // Get repo name without owner
                const baseName = \`\${repoName}-\${eventType}\`;
                
                // Check if this name already exists in the repo prompts
                let counter = 1;
                let suggestedName = baseName;
                
                if (prompts.repos[repo] && prompts.repos[repo][eventType]) {
                    // If the basic eventType exists, suggest a variant
                    suggestedName = \`\${baseName}-v\${counter}\`;
                    while (checkPromptExists(repo, suggestedName)) {
                        counter++;
                        suggestedName = \`\${baseName}-v\${counter}\`;
                    }
                }
                
                return suggestedName;
            } else {
                // For generic prompts, just use the event type
                return eventType;
            }
        }
        
        // Check if prompt exists
        function checkPromptExists(repo, promptName) {
            if (repo) {
                return prompts.repos[repo] && prompts.repos[repo][promptName];
            } else {
                return prompts.generic[promptName];
            }
        }
        
        // Update prompt name when event type or repo changes
        function updatePromptName() {
            if (!currentPrompt) { // Only auto-suggest if not editing existing prompt
                const suggestedName = generateUniquePromptName();
                document.getElementById('promptName').value = suggestedName;
                
                // Auto-generate template if both event type and name are set
                const eventType = document.getElementById('eventTypeSelect').value;
                const repo = document.getElementById('repoSelector').value;
                
                if (eventType && suggestedName && editor.getValue().trim() === '') {
                    generatePromptTemplate(eventType, repo, suggestedName);
                }
            }
        }
        
        // Generate appropriate template based on repo and event type
        function generatePromptTemplate(eventType, repo, promptName) {
            let repoContext = '';
            let repoSpecificAnalysis = '';
            
            if (repo) {
                const repoName = repo.split('/')[1] || repo;
                repoContext = \`
### \${repoName} Context:
This event is from the \${repo} repository.\`;
                
                // Add repo-specific analysis suggestions
                if (repo.includes('patient') || repo.includes('health')) {
                    repoSpecificAnalysis = \`
### Healthcare Application Analysis:
1. **HIPAA Compliance**: Any patient data implications?
2. **Security Assessment**: PHI exposure concerns?
3. **Workflow Impact**: Effect on healthcare processes?
4. **Regulatory Considerations**: Compliance requirements?\`;
                } else if (repo.includes('hook') || repo.includes('webhook')) {
                    repoSpecificAnalysis = \`
### Webhook Tool Analysis:
1. **Integration Impact**: Effect on webhook processing?
2. **System Reliability**: Monitoring and alerting needs?
3. **Performance Considerations**: Scalability implications?
4. **Security Review**: Webhook security best practices?\`;
                } else {
                    repoSpecificAnalysis = \`
### Repository-Specific Analysis:
1. **Project Impact**: How does this affect the project goals?
2. **Development Workflow**: Integration with current processes?
3. **Quality Assessment**: Code quality and best practices?
4. **Deployment Considerations**: Release and deployment impact?\`;
                }
            }
            
            const template = \`# \${promptName.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')} Prompt

Analyze the following \${eventType} event:\${repoContext}

## Repository: {{repository.full_name}}
## Action: {{action}}
## Event Type: \${eventType}

### Event Details:
{{#if sender}}
- **Triggered By**: {{sender.login}}
{{/if}}
{{#if issue}}
- **Issue**: #{{issue.number}} - {{issue.title}}
{{/if}}
{{#if pull_request}}
- **Pull Request**: #{{pull_request.number}} - {{pull_request.title}}
{{/if}}
{{#if release}}
- **Release**: {{release.tag_name}} - {{release.name}}
{{/if}}
\${repoSpecificAnalysis}

### Analysis Request:
Please analyze this \${eventType} event and provide:
1. Summary of what happened
2. Impact assessment
3. Recommended actions or follow-ups
4. Any concerns or observations

**@clide Please provide detailed analysis of this event**

**Full Payload:** {{payload}}\`;
            
            editor.setValue(template);
        }
        
        // Clear current prompt when starting new
        function clearCurrentPrompt() {
            currentPrompt = null;
            document.querySelectorAll('.prompt-item').forEach(i => i.classList.remove('active'));
        }
        
        // Event listeners for auto-suggestion
        document.getElementById('eventTypeSelect').addEventListener('change', () => {
            clearCurrentPrompt();
            updatePromptName();
        });
        
        document.getElementById('repoSelector').addEventListener('change', () => {
            clearCurrentPrompt();
            updatePromptName();
        });
        
        // Clear current prompt when clicking in editor (starting to create new)
        document.getElementById('editor').addEventListener('click', () => {
            if (!currentPrompt) {
                updatePromptName();
            }
        });
    </script>
</body>
</html>
  `);
});

// GitHub Events documentation page
app.get('/events', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>GitHub Events Reference - Hook Line Sinker</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #0d1117;
            color: #c9d1d9;
            line-height: 1.6;
        }
        
        .container {
            max-width: 1200px;
            margin: 0 auto;
            padding: 2rem;
        }
        
        header {
            text-align: center;
            margin-bottom: 3rem;
            padding: 2rem;
            background: linear-gradient(135deg, #1f6feb 0%, #388bfd 100%);
            border-radius: 1rem;
            box-shadow: 0 8px 24px rgba(31, 111, 235, 0.2);
        }
        
        h1 {
            font-size: 2.5rem;
            margin-bottom: 0.5rem;
            color: white;
        }
        
        .back-link {
            color: rgba(255,255,255,0.9);
            text-decoration: none;
            font-size: 1rem;
            margin-bottom: 1rem;
            display: inline-block;
        }
        
        .back-link:hover {
            color: white;
        }
        
        .event-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
            gap: 1.5rem;
            margin-bottom: 2rem;
        }
        
        .event-card {
            background: #161b22;
            border: 1px solid #30363d;
            border-radius: 0.5rem;
            padding: 1.5rem;
            transition: border-color 0.2s;
        }
        
        .event-card:hover {
            border-color: #58a6ff;
        }
        
        .event-name {
            font-size: 1.2rem;
            font-weight: 600;
            color: #58a6ff;
            margin-bottom: 0.5rem;
        }
        
        .event-description {
            color: #8b949e;
            margin-bottom: 1rem;
            font-size: 0.9rem;
        }
        
        .event-actions {
            margin-bottom: 1rem;
        }
        
        .action-title {
            font-weight: 500;
            color: #c9d1d9;
            margin-bottom: 0.25rem;
        }
        
        .action-list {
            list-style: none;
            margin-left: 1rem;
        }
        
        .action-list li {
            color: #7c3aed;
            font-size: 0.85rem;
            margin-bottom: 0.2rem;
        }
        
        .action-list li:before {
            content: "•";
            color: #58a6ff;
            margin-right: 0.5rem;
        }
        
        .payload-info {
            background: #0d1117;
            padding: 0.75rem;
            border-radius: 0.25rem;
            font-size: 0.8rem;
            color: #7c3aed;
            border-left: 3px solid #58a6ff;
        }
        
        .search-box {
            width: 100%;
            max-width: 400px;
            margin: 0 auto 2rem;
            padding: 0.75rem;
            background: #21262d;
            border: 1px solid #30363d;
            border-radius: 0.5rem;
            color: #c9d1d9;
            font-size: 1rem;
        }
        
        .search-box:focus {
            outline: none;
            border-color: #58a6ff;
        }
        
        .hidden {
            display: none;
        }
    </style>
</head>
<body>
    <div class="container">
        <header>
            <a href="/" class="back-link">← Back to Hook Line Sinker</a>
            <h1>GitHub Events Reference</h1>
            <p>Complete guide to GitHub webhook events and their payloads</p>
        </header>
        
        <input type="text" class="search-box" placeholder="Search events..." id="searchBox">
        
        <div class="event-grid" id="eventGrid">
            <div class="event-card">
                <div class="event-name">push</div>
                <div class="event-description">Triggered when commits are pushed to a repository</div>
                <div class="event-actions">
                    <div class="action-title">Always triggered (no actions)</div>
                </div>
                <div class="payload-info">Contains: commits, pusher, before/after SHAs, ref</div>
            </div>
            
            <div class="event-card">
                <div class="event-name">pull_request</div>
                <div class="event-description">Activity on pull requests</div>
                <div class="event-actions">
                    <div class="action-title">Actions:</div>
                    <ul class="action-list">
                        <li>opened, closed, reopened</li>
                        <li>edited, assigned, unassigned</li>
                        <li>review_requested, review_request_removed</li>
                        <li>labeled, unlabeled</li>
                        <li>synchronized (new commits)</li>
                    </ul>
                </div>
                <div class="payload-info">Contains: pull_request object, changes, requested_reviewers</div>
            </div>
            
            <div class="event-card">
                <div class="event-name">issues</div>
                <div class="event-description">Activity on repository issues</div>
                <div class="event-actions">
                    <div class="action-title">Actions:</div>
                    <ul class="action-list">
                        <li>opened, closed, reopened</li>
                        <li>edited, assigned, unassigned</li>
                        <li>labeled, unlabeled</li>
                        <li>milestoned, demilestoned</li>
                    </ul>
                </div>
                <div class="payload-info">Contains: issue object, changes, assignee</div>
            </div>
            
            <div class="event-card">
                <div class="event-name">issue_comment</div>
                <div class="event-description">Comments on issues and pull requests</div>
                <div class="event-actions">
                    <div class="action-title">Actions:</div>
                    <ul class="action-list">
                        <li>created, edited, deleted</li>
                    </ul>
                </div>
                <div class="payload-info">Contains: comment object, issue object</div>
            </div>
            
            <div class="event-card">
                <div class="event-name">release</div>
                <div class="event-description">Repository releases</div>
                <div class="event-actions">
                    <div class="action-title">Actions:</div>
                    <ul class="action-list">
                        <li>published, unpublished</li>
                        <li>created, edited, deleted</li>
                        <li>prereleased, released</li>
                    </ul>
                </div>
                <div class="payload-info">Contains: release object, assets</div>
            </div>
            
            <div class="event-card">
                <div class="event-name">create</div>
                <div class="event-description">Branch or tag creation</div>
                <div class="event-actions">
                    <div class="action-title">Always triggered (no actions)</div>
                </div>
                <div class="payload-info">Contains: ref, ref_type (branch/tag), master_branch</div>
            </div>
            
            <div class="event-card">
                <div class="event-name">delete</div>
                <div class="event-description">Branch or tag deletion</div>
                <div class="event-actions">
                    <div class="action-title">Always triggered (no actions)</div>
                </div>
                <div class="payload-info">Contains: ref, ref_type (branch/tag)</div>
            </div>
            
            <div class="event-card">
                <div class="event-name">watch</div>
                <div class="event-description">Repository starring</div>
                <div class="event-actions">
                    <div class="action-title">Actions:</div>
                    <ul class="action-list">
                        <li>started (starred)</li>
                    </ul>
                </div>
                <div class="payload-info">Contains: sender who starred</div>
            </div>
            
            <div class="event-card">
                <div class="event-name">fork</div>
                <div class="event-description">Repository forking</div>
                <div class="event-actions">
                    <div class="action-title">Always triggered (no actions)</div>
                </div>
                <div class="payload-info">Contains: forkee (new repository)</div>
            </div>
            
            <div class="event-card">
                <div class="event-name">gollum</div>
                <div class="event-description">Wiki page updates</div>
                <div class="event-actions">
                    <div class="action-title">Always triggered (no actions)</div>
                </div>
                <div class="payload-info">Contains: pages array with changes</div>
            </div>
            
            <div class="event-card">
                <div class="event-name">commit_comment</div>
                <div class="event-description">Comments on commits</div>
                <div class="event-actions">
                    <div class="action-title">Actions:</div>
                    <ul class="action-list">
                        <li>created</li>
                    </ul>
                </div>
                <div class="payload-info">Contains: comment object, commit SHA</div>
            </div>
            
            <div class="event-card">
                <div class="event-name">deployment</div>
                <div class="event-description">Deployment creation</div>
                <div class="event-actions">
                    <div class="action-title">Always triggered (no actions)</div>
                </div>
                <div class="payload-info">Contains: deployment object, environment</div>
            </div>
            
            <div class="event-card">
                <div class="event-name">deployment_status</div>
                <div class="event-description">Deployment status updates</div>
                <div class="event-actions">
                    <div class="action-title">Always triggered (no actions)</div>
                </div>
                <div class="payload-info">Contains: deployment_status, deployment, target_url</div>
            </div>
            
            <div class="event-card">
                <div class="event-name">check_run</div>
                <div class="event-description">Check runs from GitHub Apps</div>
                <div class="event-actions">
                    <div class="action-title">Actions:</div>
                    <ul class="action-list">
                        <li>created, completed</li>
                        <li>rerequested, requested_action</li>
                    </ul>
                </div>
                <div class="payload-info">Contains: check_run object, conclusion, output</div>
            </div>
            
            <div class="event-card">
                <div class="event-name">check_suite</div>
                <div class="event-description">Check suite updates</div>
                <div class="event-actions">
                    <div class="action-title">Actions:</div>
                    <ul class="action-list">
                        <li>completed, requested</li>
                        <li>rerequested</li>
                    </ul>
                </div>
                <div class="payload-info">Contains: check_suite object, pull_requests</div>
            </div>
            
            <div class="event-card">
                <div class="event-name">status</div>
                <div class="event-description">Commit status updates</div>
                <div class="event-actions">
                    <div class="action-title">Always triggered (no actions)</div>
                </div>
                <div class="payload-info">Contains: state, description, target_url, context</div>
            </div>
            
            <div class="event-card">
                <div class="event-name">repository</div>
                <div class="event-description">Repository management</div>
                <div class="event-actions">
                    <div class="action-title">Actions:</div>
                    <ul class="action-list">
                        <li>created, deleted, archived</li>
                        <li>unarchived, publicized, privatized</li>
                        <li>edited, renamed, transferred</li>
                    </ul>
                </div>
                <div class="payload-info">Contains: repository changes, before/after values</div>
            </div>
            
            <div class="event-card">
                <div class="event-name">projects_v2</div>
                <div class="event-description">GitHub Projects (Beta) updates</div>
                <div class="event-actions">
                    <div class="action-title">Actions:</div>
                    <ul class="action-list">
                        <li>created, edited, deleted</li>
                        <li>closed, reopened</li>
                    </ul>
                </div>
                <div class="payload-info">Contains: projects_v2 object, organization</div>
            </div>
            
            <div class="event-card">
                <div class="event-name">projects_v2_item</div>
                <div class="event-description">GitHub Projects (Beta) item updates</div>
                <div class="event-actions">
                    <div class="action-title">Actions:</div>
                    <ul class="action-list">
                        <li>created, edited, deleted</li>
                        <li>converted, reordered</li>
                        <li>archived, restored</li>
                    </ul>
                </div>
                <div class="payload-info">Contains: projects_v2_item, changes</div>
            </div>
            
            <div class="event-card">
                <div class="event-name">ping</div>
                <div class="event-description">Webhook test/verification</div>
                <div class="event-actions">
                    <div class="action-title">Always triggered (no actions)</div>
                </div>
                <div class="payload-info">Contains: zen message, webhook config</div>
            </div>
            
            <div class="event-card">
                <div class="event-name">workflow_run</div>
                <div class="event-description">GitHub Actions workflow execution</div>
                <div class="event-actions">
                    <div class="action-title">Actions:</div>
                    <ul class="action-list">
                        <li>completed, requested</li>
                        <li>in_progress</li>
                    </ul>
                </div>
                <div class="payload-info">Contains: workflow_run, conclusion, artifacts_url</div>
            </div>
            
            <div class="event-card">
                <div class="event-name">workflow_job</div>
                <div class="event-description">GitHub Actions job execution</div>
                <div class="event-actions">
                    <div class="action-title">Actions:</div>
                    <ul class="action-list">
                        <li>queued, in_progress</li>
                        <li>completed</li>
                    </ul>
                </div>
                <div class="payload-info">Contains: workflow_job, steps, conclusion</div>
            </div>
        </div>
    </div>
    
    <script>
        const searchBox = document.getElementById('searchBox');
        const eventGrid = document.getElementById('eventGrid');
        const eventCards = eventGrid.querySelectorAll('.event-card');
        
        searchBox.addEventListener('input', function() {
            const searchTerm = this.value.toLowerCase();
            
            eventCards.forEach(card => {
                const eventName = card.querySelector('.event-name').textContent.toLowerCase();
                const eventDescription = card.querySelector('.event-description').textContent.toLowerCase();
                const actions = card.querySelector('.action-list');
                const actionText = actions ? actions.textContent.toLowerCase() : '';
                
                if (eventName.includes(searchTerm) || 
                    eventDescription.includes(searchTerm) || 
                    actionText.includes(searchTerm)) {
                    card.classList.remove('hidden');
                } else {
                    card.classList.add('hidden');
                }
            });
        });
    </script>
</body>
</html>
  `);
});

// Serve static HTML interface
app.get('/', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Hook Line Sinker - GitHub Webhook Monitor</title>
    <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/components/prism-core.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/plugins/autoloader/prism-autoloader.min.js"></script>
    <link href="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/themes/prism-dark.min.css" rel="stylesheet" />
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #0d1117;
            color: #c9d1d9;
            line-height: 1.6;
        }
        
        .container {
            max-width: 1400px;
            margin: 0 auto;
            padding: 2rem;
        }
        
        header {
            text-align: center;
            margin-bottom: 3rem;
            padding: 2rem;
            background: linear-gradient(135deg, #1f6feb 0%, #388bfd 100%);
            border-radius: 1rem;
            box-shadow: 0 8px 24px rgba(31, 111, 235, 0.2);
        }
        
        h1 {
            font-size: 3rem;
            margin-bottom: 0.5rem;
            color: white;
            text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
        }
        
        .subtitle {
            font-size: 1.2rem;
            color: rgba(255,255,255,0.9);
        }
        
        .webhook-url {
            background: rgba(0,0,0,0.3);
            padding: 1rem;
            border-radius: 0.5rem;
            margin-top: 1rem;
            font-family: monospace;
            color: #58a6ff;
        }
        
        .stats {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 1rem;
            margin-bottom: 2rem;
        }
        
        .stat-card {
            background: #161b22;
            padding: 1.5rem;
            border-radius: 0.5rem;
            border: 1px solid #30363d;
            text-align: center;
        }
        
        .stat-value {
            font-size: 2rem;
            font-weight: bold;
            color: #58a6ff;
        }
        
        .webhook-list {
            background: #161b22;
            border-radius: 0.5rem;
            border: 1px solid #30363d;
            overflow: hidden;
        }
        
        .webhook-item {
            padding: 1rem 1.5rem;
            border-bottom: 1px solid #30363d;
            transition: background 0.2s;
            display: grid;
            grid-template-columns: auto 1fr auto auto auto auto;
            gap: 1rem;
            align-items: center;
        }
        
        .webhook-item:hover {
            background: #1c2128;
        }
        
        .event-badge {
            background: #1f6feb;
            color: white;
            padding: 0.25rem 0.75rem;
            border-radius: 1rem;
            font-size: 0.875rem;
            font-weight: 500;
            white-space: nowrap;
        }
        
        .event-badge.push { background: #2ea043; }
        .event-badge.pull_request { background: #8957e5; }
        .event-badge.issues { background: #da3633; }
        .event-badge.release { background: #f0883e; }
        
        .webhook-info {
            flex: 1;
        }
        
        .webhook-repo {
            font-weight: 500;
            color: #58a6ff;
        }
        
        .webhook-sender {
            font-size: 0.875rem;
            color: #8b949e;
        }
        
        .webhook-time {
            font-size: 0.875rem;
            color: #8b949e;
        }
        
        .verified-badge {
            color: #2ea043;
            font-size: 1.2rem;
        }
        
        .unverified-badge {
            color: #da3633;
            font-size: 1.2rem;
        }
        
        .modal {
            display: none;
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.8);
            z-index: 1000;
            overflow-y: auto;
        }
        
        .modal-content {
            background: #161b22;
            margin: 2rem auto;
            padding: 2rem;
            border-radius: 0.5rem;
            max-width: 800px;
            border: 1px solid #30363d;
        }
        
        .modal-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 1.5rem;
        }
        
        .close-btn {
            background: none;
            border: none;
            color: #8b949e;
            font-size: 2rem;
            cursor: pointer;
        }
        
        .payload-viewer {
            background: #0d1117;
            padding: 1rem;
            border-radius: 0.5rem;
            overflow-x: auto;
            font-family: monospace;
            font-size: 0.875rem;
            line-height: 1.4;
        }
        
        .empty-state {
            text-align: center;
            padding: 4rem;
            color: #8b949e;
        }
        
        .refresh-btn {
            position: fixed;
            bottom: 2rem;
            right: 2rem;
            background: #1f6feb;
            color: white;
            border: none;
            padding: 1rem;
            border-radius: 50%;
            cursor: pointer;
            box-shadow: 0 4px 12px rgba(31, 111, 235, 0.3);
            transition: transform 0.2s;
        }
        
        .refresh-btn:hover {
            transform: scale(1.1);
        }
        
        @keyframes pulse {
            0% { opacity: 1; }
            50% { opacity: 0.5; }
            100% { opacity: 1; }
        }
        
        .loading {
            animation: pulse 1.5s ease-in-out infinite;
        }
        
        .delete-btn {
            background: #da3633;
            color: white;
            border: none;
            padding: 0.25rem 0.5rem;
            border-radius: 0.25rem;
            cursor: pointer;
            font-size: 0.75rem;
            transition: background 0.2s;
        }
        
        .delete-btn:hover {
            background: #b22a00;
        }
        
        .webhook-item-clickable {
            cursor: pointer;
        }
        
        .prompt-btn {
            background: #238636;
            color: white;
            border: none;
            padding: 0.25rem 0.5rem;
            border-radius: 0.25rem;
            cursor: pointer;
            font-size: 0.75rem;
            transition: background 0.2s;
        }
        
        .prompt-btn:hover {
            background: #2ea043;
        }
        
        .no-prompt {
            color: #8b949e;
            font-size: 0.75rem;
            text-align: center;
        }
        
        .markdown-content {
            background: #0d1117;
            padding: 1rem;
            border-radius: 0.5rem;
            overflow-x: auto;
            font-size: 0.875rem;
            line-height: 1.6;
            border: 1px solid #30363d;
        }
        
        .markdown-content h1, .markdown-content h2, .markdown-content h3, .markdown-content h4 {
            color: #58a6ff;
            margin-top: 1rem;
            margin-bottom: 0.5rem;
        }
        
        .markdown-content h1 { font-size: 1.5rem; }
        .markdown-content h2 { font-size: 1.3rem; }
        .markdown-content h3 { font-size: 1.1rem; }
        .markdown-content h4 { font-size: 1rem; }
        
        .markdown-content p {
            margin-bottom: 1rem;
        }
        
        .markdown-content ul, .markdown-content ol {
            margin-left: 1.5rem;
            margin-bottom: 1rem;
        }
        
        .markdown-content li {
            margin-bottom: 0.25rem;
        }
        
        .markdown-content strong {
            color: #f0f6fc;
            font-weight: 600;
        }
        
        .markdown-content code {
            background: #21262d;
            color: #e6edf3;
            padding: 0.125rem 0.25rem;
            border-radius: 0.25rem;
            font-family: 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, 'Courier New', monospace;
        }
        
        .markdown-content pre {
            background: #0d1117;
            border: 1px solid #30363d;
            border-radius: 0.5rem;
            padding: 1rem;
            overflow-x: auto;
            margin: 1rem 0;
        }
        
        .markdown-content pre code {
            background: none;
            padding: 0;
        }
        
        .claude-btn {
            background: #1f6feb;
            color: white;
            border: none;
            padding: 0.5rem 1rem;
            border-radius: 0.25rem;
            cursor: pointer;
            font-size: 0.9rem;
            transition: background 0.2s;
            display: flex;
            align-items: center;
            gap: 0.5rem;
        }
        
        .claude-btn:hover {
            background: #388bfd;
        }
        
        .claude-btn:disabled {
            background: #6e7681;
            cursor: not-allowed;
        }
        
        .secondary-btn {
            background: #21262d;
            color: #c9d1d9;
            border: 1px solid #30363d;
            padding: 0.5rem 1rem;
            border-radius: 0.25rem;
            cursor: pointer;
            font-size: 0.9rem;
            transition: background 0.2s;
        }
        
        .secondary-btn:hover {
            background: #30363d;
        }
        
        .claude-response {
            background: #0d1117;
            padding: 1rem;
            border-radius: 0.5rem;
            border: 1px solid #30363d;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            line-height: 1.6;
            white-space: pre-wrap;
            max-height: 600px;
            overflow-y: auto;
        }
    </style>
</head>
<body>
    <div class="container">
        <header>
            <h1>🎣 Hook Line Sinker</h1>
            <div class="subtitle">GitHub Webhook Monitor</div>
            <div class="webhook-url">Webhook URL: <span id="webhookUrl"></span>/webhook</div>
            <div style="margin-top: 1rem; display: flex; gap: 1rem; justify-content: center; flex-wrap: wrap;">
                <button onclick="showWebhookSetupModal()" style="color: rgba(255,255,255,0.9); text-decoration: none; font-size: 1rem; background: rgba(31, 111, 235, 0.8); border: none; padding: 0.5rem 1rem; border-radius: 0.25rem; display: inline-block; cursor: pointer; transition: background 0.2s;">
                    ⚙️ Setup GitHub Webhook
                </button>
                <a href="/events" style="color: rgba(255,255,255,0.9); text-decoration: none; font-size: 1rem; background: rgba(0,0,0,0.3); padding: 0.5rem 1rem; border-radius: 0.25rem; display: inline-block;">
                    📚 GitHub Events Reference
                </a>
                <a href="/prompts" style="color: rgba(255,255,255,0.9); text-decoration: none; font-size: 1rem; background: rgba(0,0,0,0.3); padding: 0.5rem 1rem; border-radius: 0.25rem; display: inline-block;">
                    🤖 Prompt Management
                </a>
                <a href="/api-docs" style="color: rgba(255,255,255,0.9); text-decoration: none; font-size: 1rem; background: rgba(0,0,0,0.3); padding: 0.5rem 1rem; border-radius: 0.25rem; display: inline-block;">
                    🔗 API Documentation
                </a>
            </div>
        </header>
        
        <div class="stats">
            <div class="stat-card">
                <div class="stat-value" id="totalWebhooks">0</div>
                <div>Total Webhooks</div>
            </div>
            <div class="stat-card">
                <div class="stat-value" id="verifiedCount">0</div>
                <div>Verified</div>
            </div>
            <div class="stat-card">
                <div class="stat-value" id="todayCount">0</div>
                <div>Today</div>
            </div>
        </div>
        
        <div class="webhook-list" id="webhookList">
            <div class="empty-state">
                <h3>No webhooks received yet</h3>
                <p>Configure your GitHub repository to send webhooks to the URL above</p>
            </div>
        </div>
    </div>
    
    <button class="refresh-btn" onclick="loadWebhooks()" title="Refresh">
        🔄
    </button>
    
    <div class="modal" id="detailModal">
        <div class="modal-content">
            <div class="modal-header">
                <h2 id="modalTitle">Webhook Details</h2>
                <button class="close-btn" onclick="closeModal()">&times;</button>
            </div>
            <div id="modalBody"></div>
        </div>
    </div>
    
    <script>
        // Set webhook URL - use external URL if on production
        const isProduction = window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';
        const webhookUrl = isProduction ? 'https://hls.zpaper.com' : window.location.origin;
        document.getElementById('webhookUrl').textContent = webhookUrl;
        
        let webhooks = [];
        
        async function loadWebhooks() {
            try {
                const response = await fetch('/api/webhooks');
                webhooks = await response.json();
                
                // Load parsed prompts for each webhook
                for (let webhook of webhooks) {
                    try {
                        const promptResponse = await fetch(\`/api/parsed-prompts?webhook_id=\${webhook.id}&limit=1\`);
                        const prompts = await promptResponse.json();
                        webhook.parsedPrompt = prompts.length > 0 ? prompts[0] : null;
                    } catch (err) {
                        webhook.parsedPrompt = null;
                    }
                }
                
                renderWebhooks();
                updateStats();
            } catch (err) {
                console.error('Failed to load webhooks:', err);
            }
        }
        
        function renderWebhooks() {
            const container = document.getElementById('webhookList');
            
            if (webhooks.length === 0) {
                container.innerHTML = \`
                    <div class="empty-state">
                        <h3>No webhooks received yet</h3>
                        <p>Configure your GitHub repository to send webhooks to the URL above</p>
                    </div>
                \`;
                return;
            }
            
            container.innerHTML = webhooks.map(webhook => \`
                <div class="webhook-item">
                    <span class="event-badge \${webhook.event_type}">\${webhook.event_type}</span>
                    <div class="webhook-info webhook-item-clickable" onclick="showDetails(\${webhook.id})">
                        <div class="webhook-repo">\${webhook.repository}</div>
                        <div class="webhook-sender">by \${webhook.sender_login}\${webhook.action ? \` • \${webhook.action}\` : ''}</div>
                    </div>
                    <div class="webhook-time">\${formatTime(webhook.timestamp)}</div>
                    <div class="\${webhook.verified ? 'verified-badge' : 'unverified-badge'}">
                        \${webhook.verified ? '✓' : '✗'}
                    </div>
                    \${webhook.parsedPrompt ? \`
                        <button class="prompt-btn" onclick="showParsedPrompt(\${webhook.parsedPrompt.id})" title="View Parsed Prompt">
                            🤖
                        </button>
                    \` : \`
                        <div class="no-prompt" title="No prompt template found">—</div>
                    \`}
                    <button class="delete-btn" onclick="deleteWebhook(\${webhook.id})" title="Delete webhook">
                        🗑️
                    </button>
                </div>
            \`).join('');
        }
        
        function updateStats() {
            document.getElementById('totalWebhooks').textContent = webhooks.length;
            
            const verified = webhooks.filter(w => w.verified).length;
            document.getElementById('verifiedCount').textContent = verified;
            
            const today = new Date().toDateString();
            const todayWebhooks = webhooks.filter(w => 
                new Date(w.timestamp).toDateString() === today
            ).length;
            document.getElementById('todayCount').textContent = todayWebhooks;
        }
        
        async function showDetails(id) {
            try {
                const response = await fetch(\`/api/webhooks/\${id}\`);
                const webhook = await response.json();
                
                // Extract GitHub links from the webhook payload
                const githubLinks = extractGitHubLinks(webhook.payload, webhook.event_type);
                
                document.getElementById('modalTitle').textContent = 
                    \`\${webhook.event_type} Event - \${webhook.repository}\`;
                
                document.getElementById('modalBody').innerHTML = \`
                    <div style="margin-bottom: 1rem;">
                        <strong>Repository:</strong> <a href="https://github.com/\${webhook.repository}" target="_blank" style="color: #58a6ff;">\${webhook.repository}</a><br>
                        <strong>Delivery ID:</strong> \${webhook.delivery_id}<br>
                        <strong>Timestamp:</strong> \${new Date(webhook.timestamp).toLocaleString()}<br>
                        <strong>Sender:</strong> \${webhook.sender_login} (ID: \${webhook.sender_id})<br>
                        <strong>Signature Verified:</strong> \${webhook.verified ? '✓ Yes' : '✗ No'}<br>
                        \${webhook.action ? \`<strong>Action:</strong> \${webhook.action}<br>\` : ''}
                        \${githubLinks ? '<strong>GitHub Links:</strong> ' + githubLinks + '<br>' : ''}
                        <strong>Raw Payload:</strong> <a href="/api/webhooks/\${webhook.id}/payload" target="_blank" style="color: #58a6ff;">View Raw JSON</a>
                    </div>
                    <h3>Complete Event Payload</h3>
                    <div class="payload-viewer">
                        <pre>\${JSON.stringify(webhook.payload, null, 2)}</pre>
                    </div>
                \`;
                
                document.getElementById('detailModal').style.display = 'block';
            } catch (err) {
                console.error('Failed to load webhook details:', err);
            }
        }
        
        function closeModal() {
            document.getElementById('detailModal').style.display = 'none';
        }
        
        async function showParsedPrompt(promptId) {
            try {
                const response = await fetch(\`/api/parsed-prompts/\${promptId}\`);
                const parsedPrompt = await response.json();
                
                // Check if there's an existing Claude response
                const claudeResponse = await fetch(\`/api/claude-responses/\${promptId}\`);
                const existingResponse = claudeResponse.ok ? await claudeResponse.json() : null;
                
                document.getElementById('modalTitle').textContent = 
                    \`Parsed Prompt - \${parsedPrompt.event_type} • \${parsedPrompt.repository}\`;
                
                // Parse payload to extract GitHub links
                const payload = JSON.parse(parsedPrompt.payload);
                const githubLinks = extractGitHubLinks(payload, parsedPrompt.event_type);
                
                document.getElementById('modalBody').innerHTML = \`
                    <div style="margin-bottom: 1rem;">
                        <strong>Repository:</strong> <a href="https://github.com/\${parsedPrompt.repository}" target="_blank" style="color: #58a6ff;">\${parsedPrompt.repository}</a><br>
                        <strong>Event Type:</strong> \${parsedPrompt.event_type}<br>
                        <strong>Created:</strong> \${new Date(parsedPrompt.created_at).toLocaleString()}<br>
                        <strong>Webhook ID:</strong> \${parsedPrompt.webhook_id}<br>
                        <strong>Delivery ID:</strong> \${parsedPrompt.delivery_id}
                        \${githubLinks ? '<br><strong>GitHub Links:</strong> ' + githubLinks : ''}
                    </div>
                    <div style="margin-bottom: 1rem; display: flex; gap: 1rem; align-items: center;">
                        <button id="sendToClaudeBtn" onclick="sendToClaude(\${parsedPrompt.id})" class="claude-btn">
                            🤖 Send to Claude
                        </button>
                        <button id="viewResponseBtn" onclick="viewExistingResponse(\${parsedPrompt.id})" class="secondary-btn" style="display: none;">
                            👁️ View Last Response
                        </button>
                        <div id="claudeStatus" style="color: #8b949e; font-size: 0.9rem;"></div>
                    </div>
                    <div id="promptSection">
                        <h3>Parsed Prompt Content</h3>
                        <div class="markdown-content" id="markdownContent"></div>
                        <div style="margin-top: 1rem;">
                            <h4>Original Template</h4>
                            <div class="payload-viewer" style="max-height: 200px; overflow-y: auto;">
                                <pre>\${parsedPrompt.prompt_template}</pre>
                            </div>
                        </div>
                    </div>
                    <div id="claudeResponseSection" style="display: none;">
                        <h3>Claude Response</h3>
                        <div class="claude-response" id="claudeResponse"></div>
                        <button onclick="showPromptContent()" class="secondary-btn" style="margin-top: 1rem;">
                            ← Back to Prompt
                        </button>
                    </div>
                \`;
                
                // Render markdown content
                renderMarkdown(parsedPrompt.parsed_content, 'markdownContent');
                
                // Store current prompt ID for later use
                window.currentPromptId = promptId;
                window.currentExistingResponse = existingResponse;
                
                // Show/hide buttons based on existing Claude response
                if (existingResponse) {
                    document.getElementById('viewResponseBtn').style.display = 'block';
                    document.getElementById('claudeStatus').textContent = \`Last response: \${new Date(existingResponse.created_at).toLocaleString()} (\${existingResponse.execution_time}ms)\`;
                } else {
                    document.getElementById('viewResponseBtn').style.display = 'none';
                    document.getElementById('claudeStatus').textContent = '';
                }
                
                document.getElementById('detailModal').style.display = 'block';
            } catch (err) {
                console.error('Failed to load parsed prompt:', err);
                alert('Failed to load parsed prompt');
            }
        }
        
        function formatTime(timestamp) {
            const date = new Date(timestamp);
            const now = new Date();
            const diff = now - date;
            
            if (diff < 60000) return 'just now';
            if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago';
            if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago';
            
            return date.toLocaleDateString();
        }
        
        function extractGitHubLinks(payload, eventType) {
            const links = [];
            
            try {
                // Issue events
                if (payload.issue) {
                    links.push('<a href="' + payload.issue.html_url + '" target="_blank" style="color: #58a6ff;">Issue #' + payload.issue.number + '</a>');
                }
                
                // Pull request events
                if (payload.pull_request) {
                    links.push('<a href="' + payload.pull_request.html_url + '" target="_blank" style="color: #58a6ff;">PR #' + payload.pull_request.number + '</a>');
                }
                
                // Comment events (issue comments, PR comments, review comments)
                if (payload.comment && payload.comment.html_url) {
                    links.push('<a href="' + payload.comment.html_url + '" target="_blank" style="color: #58a6ff;">Comment</a>');
                }
                
                // Release events
                if (payload.release) {
                    links.push('<a href="' + payload.release.html_url + '" target="_blank" style="color: #58a6ff;">Release ' + payload.release.tag_name + '</a>');
                }
                
                // Push events - link to commit or compare view
                if (eventType === 'push' && payload.head_commit) {
                    const commitUrl = 'https://github.com/' + payload.repository.full_name + '/commit/' + payload.head_commit.id;
                    links.push('<a href="' + commitUrl + '" target="_blank" style="color: #58a6ff;">Commit ' + payload.head_commit.id.substring(0, 7) + '</a>');
                    
                    if (payload.compare) {
                        links.push('<a href="' + payload.compare + '" target="_blank" style="color: #58a6ff;">Compare View</a>');
                    }
                }
                
                // Workflow run events
                if (payload.workflow_run) {
                    links.push('<a href="' + payload.workflow_run.html_url + '" target="_blank" style="color: #58a6ff;">Workflow Run</a>');
                }
                
                // Check run/suite events
                if (payload.check_run) {
                    links.push('<a href="' + payload.check_run.html_url + '" target="_blank" style="color: #58a6ff;">Check Run</a>');
                }
                if (payload.check_suite) {
                    const checkUrl = 'https://github.com/' + payload.repository.full_name + '/commit/' + payload.check_suite.head_sha + '/checks';
                    links.push('<a href="' + checkUrl + '" target="_blank" style="color: #58a6ff;">Check Suite</a>');
                }
                
                // Branch/tag creation/deletion
                if (eventType === 'create' || eventType === 'delete') {
                    if (payload.ref_type === 'branch') {
                        const branchUrl = 'https://github.com/' + payload.repository.full_name + '/tree/' + payload.ref;
                        links.push('<a href="' + branchUrl + '" target="_blank" style="color: #58a6ff;">Branch ' + payload.ref + '</a>');
                    } else if (payload.ref_type === 'tag') {
                        const tagUrl = 'https://github.com/' + payload.repository.full_name + '/releases/tag/' + payload.ref;
                        links.push('<a href="' + tagUrl + '" target="_blank" style="color: #58a6ff;">Tag ' + payload.ref + '</a>');
                    }
                }
                
                // Deployment events
                if (payload.deployment) {
                    const deployUrl = 'https://github.com/' + payload.repository.full_name + '/deployments';
                    links.push('<a href="' + deployUrl + '" target="_blank" style="color: #58a6ff;">Deployment</a>');
                }
                
                // Fork events
                if (payload.forkee) {
                    links.push('<a href="' + payload.forkee.html_url + '" target="_blank" style="color: #58a6ff;">Fork: ' + payload.forkee.full_name + '</a>');
                }
                
            } catch (err) {
                console.error('Error extracting GitHub links:', err);
            }
            
            return links.length > 0 ? links.join(' • ') : null;
        }
        
        // Close modal when clicking outside
        window.onclick = function(event) {
            const modal = document.getElementById('detailModal');
            if (event.target === modal) {
                closeModal();
            }
        }
        
        // Load webhooks on page load
        loadWebhooks();
        
        // Delete webhook function
        async function deleteWebhook(id) {
            if (!confirm('Are you sure you want to delete this webhook?')) {
                return;
            }
            
            try {
                const response = await fetch(\`/api/webhooks/\${id}\`, {
                    method: 'DELETE'
                });
                
                if (response.ok) {
                    loadWebhooks(); // Refresh the list
                } else {
                    const error = await response.json();
                    alert('Failed to delete webhook: ' + error.error);
                }
            } catch (err) {
                console.error('Failed to delete webhook:', err);
                alert('Failed to delete webhook');
            }
        }
        
        // Auto-refresh every 10 seconds
        setInterval(loadWebhooks, 10000);
        
        // Markdown rendering function
        function renderMarkdown(markdown, targetElementId) {
            const html = marked.parse(markdown);
            document.getElementById(targetElementId).innerHTML = html;
            
            // Apply syntax highlighting to code blocks
            document.querySelectorAll('#' + targetElementId + ' pre code').forEach(block => {
                Prism.highlightElement(block);
            });
        }
        
        // Send parsed prompt to Claude
        async function sendToClaude(promptId) {
            const btn = document.getElementById('sendToClaudeBtn');
            const status = document.getElementById('claudeStatus');
            
            // Disable button and show loading state
            btn.disabled = true;
            btn.innerHTML = '⏳ Sending to Claude...';
            status.textContent = 'Executing claude -p command...';
            
            try {
                const response = await fetch(\`/api/claude-execute/\${promptId}\`, {
                    method: 'POST'
                });
                
                const result = await response.json();
                
                if (response.ok) {
                    // Show Claude response
                    document.getElementById('promptSection').style.display = 'none';
                    document.getElementById('claudeResponseSection').style.display = 'block';
                    document.getElementById('claudeResponse').textContent = result.output;
                    
                    // Update modal title
                    document.getElementById('modalTitle').textContent = 'Claude Response - ' + result.repository + ' • ' + result.event_type;
                    
                    status.textContent = \`Completed in \${result.execution_time}ms\`;
                    
                    // Enable "View Last Response" button for future use
                    document.getElementById('viewResponseBtn').style.display = 'block';
                    
                    // Update stored response data
                    window.currentExistingResponse = {
                        created_at: new Date().toISOString(),
                        execution_time: result.execution_time
                    };
                } else {
                    throw new Error(result.error || 'Failed to execute Claude');
                }
            } catch (error) {
                console.error('Failed to send to Claude:', error);
                status.textContent = 'Error: ' + error.message;
                status.style.color = '#f85149';
            } finally {
                // Reset button
                btn.disabled = false;
                btn.innerHTML = '🤖 Send to Claude';
            }
        }
        
        // View existing Claude response
        async function viewExistingResponse(promptId) {
            try {
                const response = await fetch(\`/api/claude-responses/\${promptId}\`);
                const claudeResponse = await response.json();
                
                if (response.ok) {
                    // Get prompt info for title
                    const promptResponse = await fetch(\`/api/parsed-prompts/\${promptId}\`);
                    const promptInfo = await promptResponse.json();
                    
                    // Show Claude response section
                    document.getElementById('promptSection').style.display = 'none';
                    document.getElementById('claudeResponseSection').style.display = 'block';
                    document.getElementById('claudeResponse').textContent = claudeResponse.response_content;
                    
                    // Update modal title
                    document.getElementById('modalTitle').textContent = \`Claude Response - \${promptInfo.event_type} • \${promptInfo.repository}\`;
                    
                    // Update status
                    const status = document.getElementById('claudeStatus');
                    status.textContent = \`Executed: \${new Date(claudeResponse.created_at).toLocaleString()} (\${claudeResponse.execution_time}ms)\`;
                    status.style.color = '#8b949e';
                } else {
                    throw new Error(claudeResponse.error || 'Failed to load Claude response');
                }
            } catch (error) {
                console.error('Failed to load Claude response:', error);
                const status = document.getElementById('claudeStatus');
                status.textContent = 'Error: ' + error.message;
                status.style.color = '#f85149';
            }
        }
        
        // Show prompt content (back from Claude response)
        function showPromptContent() {
            document.getElementById('claudeResponseSection').style.display = 'none';
            document.getElementById('promptSection').style.display = 'block';
            
            // Reset modal title (get from current modal state)
            const title = document.getElementById('modalTitle').textContent;
            if (title.startsWith('Claude Response - ')) {
                document.getElementById('modalTitle').textContent = title.replace('Claude Response - ', 'Parsed Prompt - ');
            }
            
            // Restore original status (check if there's an existing response)
            const status = document.getElementById('claudeStatus');
            if (window.currentExistingResponse) {
                status.textContent = \`Last response: \${new Date(window.currentExistingResponse.created_at).toLocaleString()} (\${window.currentExistingResponse.execution_time}ms)\`;
            } else {
                status.textContent = '';
            }
            status.style.color = '#8b949e';
        }

        // Webhook setup modal functions
        function showWebhookSetupModal() {
            document.getElementById('webhookSetupModal').style.display = 'block';
        }

        function closeWebhookSetupModal() {
            document.getElementById('webhookSetupModal').style.display = 'none';
        }

        function copyToClipboard(text) {
            navigator.clipboard.writeText(text).then(() => {
                // Show temporary success feedback
                const button = event.target;
                const originalText = button.textContent;
                button.textContent = 'Copied!';
                button.style.background = '#2ea043';
                setTimeout(() => {
                    button.textContent = originalText;
                    button.style.background = '#1f6feb';
                }, 2000);
            }).catch(() => {
                // Fallback for older browsers
                const textArea = document.createElement('textarea');
                textArea.value = text;
                document.body.appendChild(textArea);
                textArea.select();
                document.execCommand('copy');
                document.body.removeChild(textArea);
                
                const button = event.target;
                const originalText = button.textContent;
                button.textContent = 'Copied!';
                setTimeout(() => {
                    button.textContent = originalText;
                }, 2000);
            });
        }

        // Close modal when clicking outside
        window.onclick = function(event) {
            const modal = document.getElementById('webhookSetupModal');
            const detailModal = document.getElementById('detailModal');
            if (event.target === modal) {
                closeWebhookSetupModal();
            }
            if (event.target === detailModal) {
                closeModal();
            }
        }
    </script>

    <!-- Webhook Setup Modal -->
    <div id="webhookSetupModal" class="modal">
        <div class="modal-content" style="max-width: 900px;">
            <div class="modal-header">
                <h2>⚙️ GitHub Webhook Setup Guide</h2>
                <button class="close-btn" onclick="closeWebhookSetupModal()">&times;</button>
            </div>
            
            <div style="margin-bottom: 2rem;">
                <h3>📋 Quick Setup</h3>
                <div style="background: #0d1117; padding: 1rem; border-radius: 0.5rem; border: 1px solid #30363d; margin-bottom: 1rem;">
                    <div style="margin-bottom: 1rem;">
                        <strong>Webhook URL:</strong>
                        <div style="display: flex; gap: 0.5rem; align-items: center; margin-top: 0.5rem;">
                            <code style="background: #21262d; padding: 0.5rem; border-radius: 0.25rem; flex: 1;">https://hls.zpaper.com/webhook</code>
                            <button onclick="copyToClipboard('https://hls.zpaper.com/webhook')" style="background: #1f6feb; color: white; border: none; padding: 0.5rem 1rem; border-radius: 0.25rem; cursor: pointer; font-size: 0.875rem;">Copy URL</button>
                        </div>
                    </div>
                    <div>
                        <strong>Webhook Secret:</strong>
                        <div style="display: flex; gap: 0.5rem; align-items: center; margin-top: 0.5rem;">
                            <code style="background: #21262d; padding: 0.5rem; border-radius: 0.25rem; flex: 1; font-size: 0.75rem;">0eafeebff81353f861742e1391ba371f045d1fbc586f9033f8e789954c7c9733</code>
                            <button onclick="copyToClipboard('0eafeebff81353f861742e1391ba371f045d1fbc586f9033f8e789954c7c9733')" style="background: #1f6feb; color: white; border: none; padding: 0.5rem 1rem; border-radius: 0.25rem; cursor: pointer; font-size: 0.875rem;">Copy Secret</button>
                        </div>
                    </div>
                </div>
            </div>

            <div style="margin-bottom: 2rem;">
                <h3>🏢 Organization-Level Webhook (Recommended)</h3>
                <div style="background: rgba(31, 111, 235, 0.1); padding: 1rem; border-radius: 0.5rem; border: 1px solid rgba(31, 111, 235, 0.3); margin-bottom: 1rem;">
                    <p style="margin: 0; color: #58a6ff;"><strong>Best for:</strong> zpaper-com and shawn-storie organizations - covers ALL repositories automatically</p>
                </div>
                <ol style="margin-left: 1.5rem;">
                    <li>Go to your GitHub organization page</li>
                    <li>Click <strong>Settings</strong> → <strong>Webhooks</strong></li>
                    <li>Click <strong>Add webhook</strong></li>
                    <li>Configure the webhook:
                        <ul style="margin-top: 0.5rem;">
                            <li><strong>Payload URL:</strong> <code>https://hls.zpaper.com/webhook</code></li>
                            <li><strong>Content type:</strong> <code>application/json</code></li>
                            <li><strong>Secret:</strong> Use the secret above</li>
                            <li><strong>Which events:</strong> Select "Send me everything"</li>
                            <li><strong>Active:</strong> ✅ Checked</li>
                        </ul>
                    </li>
                    <li>Click <strong>Add webhook</strong></li>
                </ol>
            </div>

            <div style="margin-bottom: 2rem;">
                <h3>📁 Repository-Level Webhook</h3>
                <div style="background: rgba(255, 212, 0, 0.1); padding: 1rem; border-radius: 0.5rem; border: 1px solid rgba(255, 212, 0, 0.3); margin-bottom: 1rem;">
                    <p style="margin: 0; color: #f0c040;"><strong>Use when:</strong> You want to monitor specific repositories only</p>
                </div>
                <ol style="margin-left: 1.5rem;">
                    <li>Go to your repository on GitHub</li>
                    <li>Click <strong>Settings</strong> → <strong>Webhooks</strong></li>
                    <li>Click <strong>Add webhook</strong></li>
                    <li>Use the same configuration as above</li>
                </ol>
            </div>

            <div style="margin-bottom: 2rem;">
                <h3>🤖 What Happens Next?</h3>
                <div style="background: #0d1117; padding: 1rem; border-radius: 0.5rem; border: 1px solid #30363d;">
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem;">
                        <div>
                            <div style="font-size: 1.5rem; margin-bottom: 0.5rem;">⚡</div>
                            <strong>Instant Processing</strong>
                            <div style="font-size: 0.875rem; color: #8b949e;">All GitHub events are captured in real-time</div>
                        </div>
                        <div>
                            <div style="font-size: 1.5rem; margin-bottom: 0.5rem;">🤖</div>
                            <strong>Claude Auto-Analysis</strong>
                            <div style="font-size: 0.875rem; color: #8b949e;">Every event triggers Claude AI analysis</div>
                        </div>
                        <div>
                            <div style="font-size: 1.5rem; margin-bottom: 0.5rem;">🔄</div>
                            <strong>GitHub Actions</strong>
                            <div style="font-size: 0.875rem; color: #8b949e;">Automated labels, assignments, comments</div>
                        </div>
                        <div>
                            <div style="font-size: 1.5rem; margin-bottom: 0.5rem;">📊</div>
                            <strong>Web Dashboard</strong>
                            <div style="font-size: 0.875rem; color: #8b949e;">Monitor all activity from this interface</div>
                        </div>
                    </div>
                </div>
            </div>

            <div style="margin-bottom: 1rem;">
                <h3>🔧 Troubleshooting</h3>
                <details style="background: #0d1117; padding: 1rem; border-radius: 0.5rem; border: 1px solid #30363d;">
                    <summary style="cursor: pointer; font-weight: bold; color: #58a6ff;">Common Issues & Solutions</summary>
                    <div style="margin-top: 1rem;">
                        <p><strong>Webhook not receiving events:</strong></p>
                        <ul>
                            <li>Check webhook delivery history in GitHub settings</li>
                            <li>Verify the URL is exactly: <code>https://hls.zpaper.com/webhook</code></li>
                            <li>Ensure "application/json" content type is selected</li>
                        </ul>
                        
                        <p><strong>Signature verification failing:</strong></p>
                        <ul>
                            <li>Double-check the webhook secret matches exactly</li>
                            <li>Make sure there are no extra spaces in the secret</li>
                        </ul>
                        
                        <p><strong>Events not appearing:</strong></p>
                        <ul>
                            <li>Check that "Send me everything" is selected</li>
                            <li>Or manually select specific events like "Issues", "Pull requests", "Pushes"</li>
                        </ul>
                    </div>
                </details>
            </div>

            <div style="text-align: center; padding: 1rem; background: rgba(46, 160, 67, 0.1); border-radius: 0.5rem; border: 1px solid rgba(46, 160, 67, 0.3);">
                <p style="margin: 0; color: #2ea043;"><strong>✅ Ready to go!</strong> After setting up your webhook, all GitHub events will be automatically processed with Claude AI analysis.</p>
            </div>
        </div>
    </div>

</body>
</html>
  `);
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`
  🎣 Hook Line Sinker (HLS) is running!
  
  Webhook URL: http://localhost:${PORT}/webhook
  Web Interface: http://localhost:${PORT}
  Health Check: http://localhost:${PORT}/health
  
  Server is bound to all network interfaces (0.0.0.0:${PORT})
  
  To use with GitHub:
  1. Go to your repository settings > Webhooks
  2. Add webhook URL: http://your-server:${PORT}/webhook
  3. Set a secret (optional) and add it as GITHUB_WEBHOOK_SECRET env variable
  4. Select events to monitor
  5. Save and start receiving webhooks!
  `);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  db.close(() => {
    console.log('Database connection closed.');
    process.exit(0);
  });
});
