# Hook Line Sinker (HLS) 🎣

A comprehensive GitHub webhook monitoring service with Claude AI integration for automated repository analysis and management. Built for zpaper-com and shawn-storie organizations with universal @clide auto-execution.

## 🌐 Live Service

- **Web Interface**: https://hls.zpaper.com/
- **Webhook Endpoint**: https://hls.zpaper.com/webhook
- **Health Check**: https://hls.zpaper.com/health
- **API Documentation**: https://hls.zpaper.com/api-docs
- **Events Documentation**: https://hls.zpaper.com/events
- **Prompt Management**: https://hls.zpaper.com/prompts

## ✨ Features

### 📊 Webhook Monitoring
- Real-time GitHub webhook capture and analysis
- Secure HMAC-SHA256 signature verification with timing attack protection
- SQLite database storage with complete audit trail and foreign key relationships
- Web interface with auto-refresh, filtering, and GitHub link integration
- Support for both organization-level and repository-level webhooks

### 🤖 Claude AI Integration
- **Universal Auto-Execution**: ALL webhook events trigger Claude analysis automatically (no @clide tag required)
- **GitHub CLI Verification**: Uses `gh` commands to verify events exist before taking actions
- **Dangerous Permissions**: Runs with `--dangerously-skip-permissions` for full GitHub access
- **Template-Based Prompts**: Handlebars templates with repository-specific overrides
- **Monaco Editor**: Web-based prompt template editor with syntax highlighting
- **Response Storage**: Complete Claude responses stored with execution metrics

### 🛠️ Repository Management
- Automated label management and assignment using GitHub CLI
- Pull request review automation and assignee suggestions
- Release management and validation with changelog analysis
- Workflow failure detection and remediation suggestions
- Branch protection recommendations and security scanning
- Issue triage and priority assessment

### 📝 Supported GitHub Events (22 Event Types)
- **Issues**: Creation, updates, comments, labels, assignment, milestones
- **Pull Requests**: Creation, reviews, merges, comments, synchronization
- **Pushes**: Commit analysis, branch management, security scanning
- **Releases**: Version analysis, changelog validation, asset management
- **Workflows**: CI/CD monitoring, failure investigation, optimization
- **Comments**: Issue comments, PR comments, review comments, commit comments
- **Branches/Tags**: Creation, deletion, protection rules
- **Deployments**: Status tracking, environment management
- **Security**: Vulnerability alerts, code scanning, secret scanning
- **And more**: Forks, stars, watches, gollum (wiki), check runs/suites

## 🚀 Quick Start

### GitHub Webhook Setup

1. Go to your repository settings → Webhooks
2. Add webhook with these settings:
   - **Payload URL**: `https://hls.zpaper.com/webhook`
   - **Content Type**: `application/json`
   - **Secret**: `0eafeebff81353f861742e1391ba371f045d1fbc586f9033f8e789954c7c9733`
   - **Events**: Select "Send me everything" or specific events

### Universal Auto-Execution

**ALL webhook events automatically trigger Claude analysis** - no special tags required! The system will:

1. ✅ Receive and verify webhook signature
2. ✅ Parse event with repository-specific or generic templates
3. ✅ Execute Claude analysis with GitHub CLI verification
4. ✅ Store complete response with execution metrics
5. ✅ Take automated actions (add labels, assign reviewers, comment, etc.)

Example workflow for any GitHub event:
```
GitHub Event → HLS Webhook → Claude Analysis → GitHub Actions → Response Storage
```

### GitHub Link Integration

Both webhook detail and parsed prompt modals include direct GitHub links:
- **Repository links**: Direct to GitHub repo
- **Issue/PR links**: Direct to specific issues and pull requests  
- **Commit links**: Direct to commits and compare views
- **Release links**: Direct to releases and tags
- **Workflow links**: Direct to workflow runs and checks
- **Comment links**: Direct to specific comments

## 🎛️ Web Interface

### Main Dashboard
- Real-time webhook feed with event details
- 🤖 "View Parsed Prompt" buttons for events with templates
- 👁️ "View Last Response" for events with Claude analysis
- One-click Claude execution with "Send to Claude" buttons

### Prompt Management (`/prompts`)
- Monaco editor for creating and editing prompt templates
- Repository-specific prompt overrides
- GitHub CLI integration for repository discovery
- Auto-suggestion for unique prompt names

### Events Documentation (`/events`)
- Comprehensive GitHub events reference
- Event-specific payload examples
- Integration guidance for each event type

## 🏗️ Architecture

### Technology Stack
- **Backend**: Node.js + Express
- **Database**: SQLite with three main tables
- **Frontend**: Vanilla JS with Monaco Editor and Prism.js
- **AI Integration**: Claude via command-line interface
- **Repository Integration**: GitHub CLI (`gh`)

### Database Schema
```sql
-- Core webhook storage
CREATE TABLE webhooks (
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
);

-- Parsed prompt templates
CREATE TABLE parsed_prompts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  webhook_id INTEGER,
  repository TEXT,
  event_type TEXT,
  prompt_template TEXT,
  parsed_content TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(webhook_id) REFERENCES webhooks(id)
);

-- Claude AI responses
CREATE TABLE claude_responses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  prompt_id INTEGER,
  response_content TEXT,
  execution_time INTEGER,
  exit_code INTEGER,
  error_message TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(prompt_id) REFERENCES parsed_prompts(id)
);
```

## 📖 API Reference

### Webhook Data
- `GET /api/webhooks` - List webhooks with pagination
- `GET /api/webhooks/:id` - Get specific webhook details
- `DELETE /api/webhooks/:id` - Delete webhook

### Claude Integration
- `GET /api/parsed-prompts` - List parsed prompts
- `GET /api/claude-responses/:promptId` - Get Claude response
- `POST /api/claude-execute/:id` - Execute Claude with prompt

### Prompt Management
- `GET /api/prompts` - List available prompt templates
- `POST /api/prompts/generic/:eventType` - Save generic template
- `POST /api/prompts/repo/:repo/:eventType` - Save repo-specific template

## 🔧 Local Development

```bash
# Clone and setup
git clone <repository>
cd hls
npm install

# Start development server
node hls.js

# Or with PM2 for production-like environment
npm run pm2
```

Server runs on `http://localhost:4665` with:
- Webhook endpoint: `/webhook`
- Web interface: `/`
- Health check: `/health`

## 🔐 Security Features

- **Signature Verification**: HMAC-SHA256 validation with timing attack protection
- **Input Sanitization**: SQL prepared statements prevent injection
- **Environment Configuration**: Secure secret management via `.env`
- **GitHub CLI Authentication**: Secure repository access for real event verification
- **Dangerous Permissions**: Controlled use of `--dangerously-skip-permissions` for GitHub CLI access

## ✅ Test Results

### Live Testing Validation

**HookHaven Repository Test** (shawn-storie/HookHaven):
- ✅ Issue #1 with @clide tag processed successfully
- ✅ Claude verified issue exists using GitHub CLI
- ✅ Automated label application and comprehensive analysis
- ✅ Response stored: 59.7 seconds execution time
- ✅ Auto-execution trigger confirmed working

**Patient-SPRKZ Repository Test** (zpaper-com/patient-sprkz):
- ✅ Issue #3 processed with universal auto-execution
- ✅ GitHub CLI verification successful
- ✅ Added "enhancement" label automatically
- ✅ Comprehensive comment added by Claude
- ✅ Response stored: 88.6 seconds execution time
- ✅ Cross-organization webhook confirmed working

### System Status
- **Total Webhooks Processed**: 22+ events across both organizations
- **Claude Executions**: 6 successful auto-executions
- **Database Storage**: All webhooks, prompts, and responses stored
- **GitHub Actions**: Labels, comments, and assignments working
- **Performance**: Average execution time 60-90 seconds

## 📁 Directory Structure

```
hls/
├── hls.js                 # Main application (single file)
├── package.json           # Dependencies and scripts
├── ecosystem.config.js    # PM2 configuration
├── .env                   # Environment variables
├── CLAUDE.md             # Claude Code integration guide
├── README.md             # This file
├── hls_webhooks.db       # SQLite database (auto-created)
└── prompts/              # Prompt templates
    ├── generic/          # Default templates for all repos
    │   ├── issues.md
    │   ├── pull_request.md
    │   ├── push.md
    │   └── ...
    └── repos/            # Repository-specific overrides
        └── owner/
            └── repo/
                ├── issues.md
                └── ...
```

## 🤝 Contributing

This is a specialized tool for GitHub webhook automation with Claude AI. For questions or contributions, please review the `CLAUDE.md` file for technical details and development guidance.

## 📄 License

MIT License - see LICENSE file for details.

---

**Hook Line Sinker** - *Because every webhook deserves the perfect catch* 🎣