# Check Run Event Prompt

Analyze the following check run event:

## Repository: {{repository.full_name}}
## Action: {{action}}
## Check: {{check_run.name}}

### Check Run Details:
- **Status**: {{check_run.status}}
- **Conclusion**: {{check_run.conclusion}}
- **Started**: {{check_run.started_at}}
- **Completed**: {{check_run.completed_at}}
- **Head SHA**: {{check_run.head_sha}}
- **External ID**: {{check_run.external_id}}

### Check Output:
- **Title**: {{check_run.output.title}}
- **Summary**: {{check_run.output.summary}}

### Pull Requests:
{{#each check_run.pull_requests}}
- **PR #{{this.number}}**: {{this.head.ref}} → {{this.base.ref}}
{{/each}}

### Analysis Request:
Please analyze this check run and provide:
1. Assessment of check results
2. Impact on code quality/security
3. Recommendations if check failed
4. Next steps for resolution

**Full Payload:**

```json
{{{payload}}}
```