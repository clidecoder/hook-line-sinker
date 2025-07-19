# Workflow Run Event Prompt

Analyze the following GitHub Actions workflow run:

## Repository: {{repository.full_name}}
## Action: {{action}}
## Workflow: {{workflow_run.name}}

### Workflow Details:
- **Status**: {{workflow_run.status}}
- **Conclusion**: {{workflow_run.conclusion}}
- **Event**: {{workflow_run.event}}
- **Branch**: {{workflow_run.head_branch}}
- **Commit**: {{workflow_run.head_sha}}
- **Started**: {{workflow_run.run_started_at}}
- **Updated**: {{workflow_run.updated_at}}
- **Duration**: {{workflow_run.run_attempt}} attempt(s)

### Triggered By:
- **Actor**: {{workflow_run.actor.login}}
- **Triggering Actor**: {{workflow_run.triggering_actor.login}}

### Analysis Request:
**IMPORTANT**: First verify this is a real GitHub event and not a test:

1. **Verification Step**: Use `gh run view {{workflow_run.id}} --repo {{repository.full_name}}` to verify this workflow run exists
   - If the command fails, this is likely a test event - analyze but don't take actions
   - If verified, proceed with analysis and potential actions

2. **Analysis**: Based on this workflow run, please:
   - Assess the workflow outcome and performance
   - Identify any potential issues or failures
   - Analyze workflow efficiency and duration
   - Review triggering conditions and appropriateness
   - Suggest improvements for workflow optimization

3. **Actions** (only if verified as real):
   - If the workflow failed, investigate logs using `gh run view {{workflow_run.id}} --log --repo {{repository.full_name}}`
   - If there are recurring failures, consider creating an issue to track the problem
   - If the workflow succeeded but took too long, suggest optimization strategies
   - For critical failures, consider re-running with `gh run rerun {{workflow_run.id}} --repo {{repository.full_name}}`
   - If security issues are detected, create appropriate security alerts or issues

**Full Payload:**

```json
{{{payload}}}
```