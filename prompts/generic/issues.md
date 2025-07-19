# Issues Event Prompt

Analyze the following issue event:

## Repository: {{repository.full_name}}
## Action: {{action}}
## Issue #{{issue.number}}: {{issue.title}}

### Issue Details:
- **State**: {{issue.state}}
- **Author**: {{issue.user.login}}
- **Created**: {{issue.created_at}}
- **Labels**: {{#each issue.labels}}{{this.name}}{{#unless @last}}, {{/unless}}{{/each}}

### Body:
{{issue.body}}

### Analysis Request:
**IMPORTANT**: First verify this is a real GitHub event and not a test:

1. **Verification Step**: Use `gh issue view {{issue.number}} --repo {{repository.full_name}}` to verify this issue exists
   - If the command fails or returns "not found", this is likely a test event - analyze but don't take actions
   - If the issue exists, proceed with analysis and potential actions

2. **Analysis**: Based on this issue event, please:
   - Categorize the issue type (bug, feature, enhancement, documentation, etc.)
   - Assess priority level based on labels and content
   - Suggest next steps or assignees
   - Identify if this relates to any common patterns

3. **Actions** (only if verified as real):
   - If the issue lacks proper labels, add appropriate labels using `gh issue edit {{issue.number}} --add-label "label-name" --repo {{repository.full_name}}`
   - If the issue needs assignment, assign using `gh issue edit {{issue.number}} --assignee username --repo {{repository.full_name}}`
   - If the issue is a duplicate, close with `gh issue close {{issue.number}} --reason "duplicate" --comment "Duplicate of #X" --repo {{repository.full_name}}`
   - If the issue needs more information, add a comment using `gh issue comment {{issue.number}} --body "Comment text" --repo {{repository.full_name}}`

**Full Payload:**

```json
{{{payload}}}
```