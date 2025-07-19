# Hook Line Sinker (HLS) - API Documentation

Complete API reference for the GitHub webhook monitoring service with Claude AI integration.

## 🌐 Base URL

- **Production**: `https://hls.zpaper.com`
- **Local Development**: `http://localhost:4665`

## 📊 Webhook Data API

### List Webhooks
**GET** `/api/webhooks`

Returns a paginated list of webhook events, sorted by most recent first.

#### Response Format
```json
[
  {
    "id": 22,
    "timestamp": "2025-07-17T03:14:04",
    "event_type": "issue_comment",
    "action": "created",
    "delivery_id": "172d3de0-62bc-11f0-878a-6edd72b6346e",
    "signature": "sha256=...",
    "payload": "{...}",
    "sender_login": "shawn-storie",
    "sender_id": 12345,
    "repository": "shawn-storie/HookHaven",
    "verified": true
  }
]
```

#### Example Usage
```bash
# Get all webhooks
curl https://hls.zpaper.com/api/webhooks

# Filter by repository (query parameter)
curl "https://hls.zpaper.com/api/webhooks?repository=zpaper-com/patient-sprkz"

# Get specific event types
curl "https://hls.zpaper.com/api/webhooks?event_type=issues"
```

### Get Specific Webhook
**GET** `/api/webhooks/:id`

Returns detailed information for a specific webhook event.

#### Parameters
- `id` (required) - Webhook ID

#### Response Format
```json
{
  "id": 21,
  "timestamp": "2025-07-17T03:13:16",
  "event_type": "issues",
  "action": "opened",
  "delivery_id": "test-script-1752721996501",
  "signature": "sha256=abc123...",
  "payload": {
    "action": "opened",
    "issue": {
      "number": 1,
      "title": "Test @clide Auto-Execution",
      "body": "...",
      "html_url": "https://github.com/shawn-storie/HookHaven/issues/1"
    },
    "repository": {
      "full_name": "shawn-storie/HookHaven"
    }
  },
  "sender_login": "shawn-storie",
  "sender_id": 12345,
  "repository": "shawn-storie/HookHaven",
  "verified": true
}
```

### Get Raw Payload
**GET** `/api/webhooks/:id/payload`

Returns the raw JSON payload for analysis and debugging.

#### Response Format
Raw JSON object as received from GitHub.

### Delete Webhook
**DELETE** `/api/webhooks/:id`

Removes a webhook event from the database.

#### Response Format
```json
{
  "success": true,
  "message": "Webhook deleted successfully"
}
```

## 🤖 Claude AI Integration API

### List Parsed Prompts
**GET** `/api/parsed-prompts`

Returns all parsed prompts with optional filtering.

#### Query Parameters
- `webhook_id` (optional) - Filter by webhook ID
- `repository` (optional) - Filter by repository
- `event_type` (optional) - Filter by event type

#### Response Format
```json
[
  {
    "id": 11,
    "webhook_id": 21,
    "repository": "zpaper-com/patient-sprkz",
    "event_type": "issues",
    "prompt_template": "# Issues Event Prompt\n\nAnalyze...",
    "parsed_content": "# Issues Event Prompt\n\n## Repository: zpaper-com/patient-sprkz...",
    "created_at": "2025-07-17T03:34:45"
  }
]
```

### Get Specific Parsed Prompt
**GET** `/api/parsed-prompts/:id`

Returns detailed information for a specific parsed prompt including webhook data.

#### Response Format
```json
{
  "id": 11,
  "webhook_id": 21,
  "repository": "zpaper-com/patient-sprkz",
  "event_type": "issues",
  "prompt_template": "...",
  "parsed_content": "...",
  "created_at": "2025-07-17T03:34:45",
  "webhook_timestamp": "2025-07-17T03:34:45",
  "delivery_id": "fb413598-62be-11f0-8ec7-1c53d2a7ab15",
  "sender_login": "shawn-storie",
  "payload": "{...}"
}
```

### Get Claude Response
**GET** `/api/claude-responses/:promptId`

Returns the Claude AI response for a specific prompt.

#### Parameters
- `promptId` (required) - Parsed prompt ID

#### Response Format
```json
{
  "id": 6,
  "prompt_id": 11,
  "response_content": "Based on the GitHub issue event analysis:\n\n## Issue Analysis...",
  "execution_time": 88647,
  "exit_code": 0,
  "error_message": null,
  "created_at": "2025-07-17T03:36:14"
}
```

### Execute Claude Analysis
**POST** `/api/claude-execute/:id`

Manually triggers Claude analysis for a parsed prompt.

#### Parameters
- `id` (required) - Parsed prompt ID

#### Request Body
None required.

#### Response Format
```json
{
  "success": true,
  "output": "## Actions Taken\n\n**✅ Issue Verified...",
  "execution_time": 65432,
  "repository": "zpaper-com/patient-sprkz",
  "event_type": "issues",
  "prompt_id": 11,
  "webhook_id": 21
}
```

#### Error Response
```json
{
  "error": "Claude execution failed",
  "exit_code": 1,
  "stderr": "Error message...",
  "execution_time": 1234
}
```

## 📝 Prompt Management API

### List Available Prompts
**GET** `/api/prompts`

Returns all available prompt templates organized by type.

#### Response Format
```json
{
  "generic": {
    "issues": "# Issues Event Prompt\n\nAnalyze...",
    "pull_request": "# Pull Request Event Prompt\n\nAnalyze...",
    "push": "# Push Event Prompt\n\nAnalyze..."
  },
  "repos": {
    "shawn-storie/HookHaven": {
      "issues": "# Custom HookHaven Issues Prompt..."
    },
    "zpaper-com/patient-sprkz": {
      "issues": "# Custom Patient-SPRKZ Issues Prompt..."
    }
  }
}
```

### Get Generic Prompt Template
**GET** `/api/prompts/generic/:eventType`

Returns a specific generic prompt template.

#### Parameters
- `eventType` (required) - Event type (issues, pull_request, push, etc.)

#### Response Format
Raw markdown template content.

### Save Generic Prompt Template
**POST** `/api/prompts/generic/:eventType`

Saves or updates a generic prompt template.

#### Headers
- `Content-Type: text/plain`

#### Request Body
Raw markdown template content.

### Get Repository-Specific Prompt
**GET** `/api/prompts/repo/:repo/:eventType`

Returns a repository-specific prompt template.

#### Parameters
- `repo` (required) - Repository name (URL encoded)
- `eventType` (required) - Event type

### Save Repository-Specific Prompt
**POST** `/api/prompts/repo/:repo/:eventType`

Saves or updates a repository-specific prompt template.

#### Example
```bash
# Save custom issues prompt for patient-sprkz
curl -X POST "https://hls.zpaper.com/api/prompts/repo/zpaper-com%2Fpatient-sprkz/issues" \
  -H "Content-Type: text/plain" \
  -d "# Custom Patient-SPRKZ Issues Prompt..."
```

### Delete Prompt Template
**DELETE** `/api/prompts/generic/:eventType`
**DELETE** `/api/prompts/repo/:repo/:eventType`

Removes a prompt template.

## 🔗 Repository Integration API

### List Repositories
**GET** `/api/repositories`

Returns available repositories from GitHub CLI.

#### Response Format
```json
[
  "shawn-storie/HookHaven",
  "zpaper-com/patient-sprkz",
  "zpaper-com/agents"
]
```

## 🏥 Health Check API

### Health Status
**GET** `/health`

Returns service health status and uptime.

#### Response Format
```json
{
  "status": "ok",
  "timestamp": "2025-07-17T03:00:00.000Z",
  "uptime": 123.456
}
```

## 📱 Web Interface Endpoints

### Main Dashboard
**GET** `/`

Returns the main webhook monitoring interface.

### Events Documentation
**GET** `/events`

Returns comprehensive GitHub events reference page.

### Prompt Management Interface
**GET** `/prompts`

Returns Monaco editor interface for prompt template management.

## 🔒 Authentication & Security

### Webhook Authentication
All webhook endpoints validate GitHub signatures using HMAC-SHA256:

```bash
# Example webhook call with signature
curl -X POST https://hls.zpaper.com/webhook \
  -H "X-GitHub-Event: issues" \
  -H "X-GitHub-Delivery: unique-delivery-id" \
  -H "X-Hub-Signature-256: sha256=signature" \
  -H "Content-Type: application/json" \
  -d '{"action":"opened","issue":{...}}'
```

### API Rate Limiting
- No explicit rate limiting currently implemented
- GitHub webhook rate limits apply (5000 requests/hour per repository)

## 🏃‍♂️ Usage Examples

### Monitor Webhook Activity
```bash
# Get recent webhooks
curl -s https://hls.zpaper.com/api/webhooks | jq '.[0:5]'

# Check for specific repository activity
curl -s "https://hls.zpaper.com/api/webhooks?repository=zpaper-com/patient-sprkz" | jq 'length'

# Get Claude analysis results
curl -s https://hls.zpaper.com/api/parsed-prompts | jq '.[] | {id, repository, event_type, created_at}'
```

### Trigger Manual Analysis
```bash
# Get latest parsed prompt
PROMPT_ID=$(curl -s https://hls.zpaper.com/api/parsed-prompts | jq -r '.[0].id')

# Execute Claude analysis
curl -X POST https://hls.zpaper.com/api/claude-execute/$PROMPT_ID
```

### Manage Prompt Templates
```bash
# Download current issues template
curl https://hls.zpaper.com/api/prompts/generic/issues > issues_template.md

# Upload modified template
curl -X POST https://hls.zpaper.com/api/prompts/generic/issues \
  -H "Content-Type: text/plain" \
  --data-binary @issues_template.md
```

## 🚨 Error Handling

All API endpoints return appropriate HTTP status codes:

- **200 OK** - Successful operation
- **201 Created** - Resource created successfully
- **400 Bad Request** - Invalid request parameters
- **404 Not Found** - Resource not found
- **500 Internal Server Error** - Server error

Error responses include descriptive messages:

```json
{
  "error": "Parsed prompt not found",
  "code": 404
}
```

This API documentation covers all available endpoints in the Hook Line Sinker service as of the latest deployment.