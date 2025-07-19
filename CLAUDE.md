# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Application Overview

Hook Line Sinker (HLS) is a Node.js-based GitHub webhook monitoring service that:
- Receives GitHub webhooks at `/webhook` endpoint
- Stores webhook data in SQLite database (`hls_webhooks.db`)
- Provides a web interface at root (`/`) for viewing webhook history
- Offers API endpoints for programmatic access to webhook data
- Verifies webhook signatures using HMAC-SHA256 when secret is configured
- Features advanced prompt management system with Claude AI integration
- Automatically detects @clide tags in webhook payloads for AI analysis
- Supports GitHub CLI verification and automated repository actions

## Service URLs

- **Production Web Interface**: https://hls.zpaper.com/
- **Webhook Endpoint**: https://hls.zpaper.com/webhook
- **Health Check**: https://hls.zpaper.com/health
- **API Documentation**: https://hls.zpaper.com/api-docs
- **Local Development**: http://localhost:4665/

## Running the Application

### Development Mode
```bash
# Start the server directly
node hls.js

# With webhook secret (recommended for production)
GITHUB_WEBHOOK_SECRET=your_secret_here node hls.js
```

### Production Mode (PM2)
```bash
# Install PM2 globally
npm install -g pm2

# Start with PM2 using ecosystem file
pm2 start ecosystem.config.js

# Other PM2 commands
pm2 status          # Check status
pm2 logs hls        # View logs
pm2 restart hls     # Restart service
pm2 stop hls        # Stop service
pm2 delete hls      # Remove from PM2

# Start PM2 on system boot
pm2 startup
pm2 save
```

The server runs on port 4665 by default, binds to all network interfaces (0.0.0.0), and creates the SQLite database file automatically. PM2 provides process management with auto-restart, logging, and monitoring capabilities.

## Architecture

### Core Components

- **Express Server** (`hls.js`): Single-file application containing all functionality
- **SQLite Database**: Stores webhook events with fields: id, timestamp, event_type, action, delivery_id, signature, payload, sender_login, sender_id, repository, verified
- **Webhook Handler** (`/webhook`): POST endpoint that verifies signatures and logs events
- **API Endpoints**: 
  - `GET /api/webhooks` - List webhooks with pagination
  - `GET /api/webhooks/:id` - Get specific webhook details
  - `GET /api/webhooks/:id/payload` - Get raw JSON payload for analysis
  - `DELETE /api/webhooks/:id` - Delete specific webhook
  - `GET /api/parsed-prompts` - List parsed prompts with optional webhook filtering
  - `GET /api/parsed-prompts/:id` - Get specific parsed prompt details
  - `GET /api/claude-responses/:promptId` - Get Claude response for a prompt
  - `POST /api/claude-execute/:id` - Execute Claude with parsed prompt
  - `GET /api/prompts` - Manage prompt templates
  - `GET /prompts` - Monaco editor interface for prompt management
  - `GET /events` - GitHub events documentation page
- **Web Interface** (`/`): Single-page application with embedded HTML, CSS, and JavaScript

### Security Features

- HMAC-SHA256 signature verification using `crypto.timingSafeEqual()` for timing attack protection
- Raw body capture for accurate signature verification
- Environment variable for webhook secret (`GITHUB_WEBHOOK_SECRET`)
- SQL prepared statements to prevent injection

### Database Schema

```sql
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

## Claude AI Integration

### Universal Auto-Execution
- **ALL webhook events trigger Claude analysis automatically** (no @clide tag required as of latest version)
- Auto-execution enabled for both shawn-storie and zpaper-com organizations
- Uses `claude -p --dangerously-skip-permissions` for full GitHub CLI access
- Verifies events exist using GitHub CLI before taking actions
- Stores complete responses in `claude_responses` table with execution metrics
- Average execution time: 60-90 seconds per analysis

### Prompt Management System
- Generic prompt templates in `/prompts/generic/` for all event types
- Repository-specific overrides in `/prompts/repos/{owner}/{repo}/`
- Monaco editor web interface at `/prompts` for template editing
- Handlebars templating system for dynamic content injection
- Auto-suggestion for unique prompt names with conflict resolution
- GitHub CLI integration for repository listing and management

### GitHub CLI Verification
- All prompt templates include verification steps using `gh` commands
- Verifies events exist in GitHub before taking actions
- Distinguishes between real events and test payloads
- Provides specific CLI commands for repository management actions

### Webhook Secret Configuration
Use the following secret for GitHub webhook configuration:
```
0eafeebff81353f861742e1391ba371f045d1fbc586f9033f8e789954c7c9733
```

## Current System Status

### Live Testing Results
- **HookHaven Test**: Issue #1 processed successfully with @clide detection
- **Patient-SPRKZ Test**: Issue #3 processed with universal auto-execution
- **Total Webhooks**: 22+ events processed across both organizations
- **Claude Executions**: 6 successful auto-executions stored
- **GitHub Actions**: Labels, comments, assignments working correctly
- **Performance**: Stable 60-90 second execution times

### Recent Updates
- **Universal Auto-Execution**: All events trigger Claude analysis (hasClideTag() returns true)
- **GitHub Link Integration**: Direct links in both webhook and parsed prompt modals
- **Cross-Organization Support**: Working for both shawn-storie and zpaper-com
- **Enhanced Security**: Dangerous permissions flag for GitHub CLI access
- **Response Storage**: Complete Claude outputs with execution metrics

### Production Configuration
- **Process Manager**: PM2 with auto-restart enabled
- **Database**: SQLite with 22+ webhook records and 6 Claude responses
- **GitHub CLI**: Authenticated and working with dangerous permissions
- **Webhook Secret**: Configured for organization-level webhooks
- **External Access**: Available at https://hls.zpaper.com/

## Development Notes

- No build process required - runs directly with Node.js
- Dependencies: express, sqlite3, handlebars (see package.json)
- Database is created automatically on first run
- Web interface auto-refreshes every 10 seconds
- Graceful shutdown handling for database connections
- PM2 ecosystem configuration for production deployment
- GitHub CLI must be authenticated for full functionality