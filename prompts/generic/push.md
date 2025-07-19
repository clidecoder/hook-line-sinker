# Push Event Prompt

Analyze the following push event and provide insights:

## Repository: {{repository.full_name}}
## Branch: {{ref}}
## Commits: {{commits.length}}

### Recent Commits:
{{#each commits}}
- **{{this.id}}**: {{this.message}} by {{this.author.name}}
  - Added: {{this.added.length}} files
  - Modified: {{this.modified.length}} files
  - Removed: {{this.removed.length}} files
{{/each}}

### Analysis Request:
**IMPORTANT**: First verify this is a real GitHub event and not a test:

1. **Verification Step**: Use `gh repo view {{repository.full_name}}` to verify this repository exists
   - For recent commits, verify with `gh api repos/{{repository.full_name}}/commits/{{commits.0.id}}` if commits exist
   - If commands fail, this is likely a test event - analyze but don't take actions
   - If verified, proceed with analysis and potential actions

2. **Analysis**: Please analyze this push event and provide:
   - Summary of changes and their significance
   - Potential impact assessment on the codebase
   - Code quality observations from commit messages
   - Any security concerns from the changes
   - Branch management recommendations

3. **Actions** (only if verified as real):
   - **Add a commit comment** summarizing your analysis using `gh api repos/{{repository.full_name}}/commits/{{commits.0.id}}/comments --method POST --field body="Your analysis comment"`
   - Include impact assessment, code quality observations, and any recommendations in the comment
   - If this is a direct push to main/master, consider suggesting branch protection using `gh api repos/{{repository.full_name}}/branches/main/protection --method PUT`
   - If commits have poor messages, suggest creating a commit message guideline issue
   - If there are potential security issues, create a security issue or alert
   - If this breaks CI/CD, check workflow status using `gh run list --repo {{repository.full_name}}`

**Full Payload:**

```json
{{{payload}}}
```