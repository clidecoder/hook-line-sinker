# Pull Request Event Prompt

Analyze the following pull request event:

## Repository: {{repository.full_name}}
## Action: {{action}}
## PR #{{pull_request.number}}: {{pull_request.title}}

### PR Details:
- **State**: {{pull_request.state}}
- **Author**: {{pull_request.user.login}}
- **Base**: {{pull_request.base.ref}} ← **Head**: {{pull_request.head.ref}}
- **Created**: {{pull_request.created_at}}
- **Mergeable**: {{pull_request.mergeable}}

### Description:
{{pull_request.body}}

### Changes:
- **Additions**: {{pull_request.additions}}
- **Deletions**: {{pull_request.deletions}}
- **Changed Files**: {{pull_request.changed_files}}

### Analysis Request:
**IMPORTANT**: First verify this is a real GitHub event and not a test:

1. **Verification Step**: Use `gh pr view {{pull_request.number}} --repo {{repository.full_name}}` to verify this PR exists
   - If the command fails or returns "not found", this is likely a test event - analyze but don't take actions
   - If the PR exists, proceed with analysis and potential actions

2. **Analysis**: Please analyze this pull request and provide:
   - Code review priorities and focus areas
   - Potential merge conflicts or issues
   - Testing recommendations
   - Documentation needs assessment
   - Security considerations if applicable

3. **Actions** (only if verified as real):
   - If the PR lacks proper labels, add them using `gh pr edit {{pull_request.number}} --add-label "label-name" --repo {{repository.full_name}}`
   - If the PR needs reviewers, assign them using `gh pr edit {{pull_request.number}} --add-reviewer username --repo {{repository.full_name}}`
   - If the PR has issues, add a review comment using `gh pr comment {{pull_request.number}} --body "Review comment" --repo {{repository.full_name}}`
   - If the PR is ready to merge, suggest using `gh pr merge {{pull_request.number}} --merge --repo {{repository.full_name}}`
   - If the PR needs changes, request changes using `gh pr review {{pull_request.number}} --request-changes --body "Change request" --repo {{repository.full_name}}`

**Full Payload:**

```json
{{{payload}}}
```