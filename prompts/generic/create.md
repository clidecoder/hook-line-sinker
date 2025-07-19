# Create Event Prompt

Analyze the following branch/tag creation event:

## Repository: {{repository.full_name}}
## Ref Type: {{ref_type}}
## Reference: {{ref}}

### Creation Details:
- **Type**: {{ref_type}} (branch or tag)
- **Name**: {{ref}}
- **Master Branch**: {{master_branch}}
- **Description**: {{description}}
- **Created By**: {{sender.login}}

### Analysis Request:
Please analyze this creation event and provide:
1. Purpose assessment (feature branch, release tag, etc.)
2. Naming convention compliance
3. Branch strategy recommendations
4. Potential impact on development workflow

**Full Payload:**

```json
{{{payload}}}
```