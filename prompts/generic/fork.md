# Fork Event Prompt

Analyze the following repository fork event:

## Original Repository: {{repository.full_name}}
## Forked To: {{forkee.full_name}}

### Fork Details:
- **Fork Owner**: {{forkee.owner.login}}
- **Fork Name**: {{forkee.name}}
- **Private**: {{forkee.private}}
- **Default Branch**: {{forkee.default_branch}}
- **Created**: {{forkee.created_at}}
- **Forked By**: {{sender.login}}

### Original Repository Stats:
- **Stars**: {{repository.stargazers_count}}
- **Forks**: {{repository.forks_count}}
- **Language**: {{repository.language}}

### Analysis Request:
Please analyze this fork event and provide:
1. Assessment of fork purpose (contribution, personal use, etc.)
2. Community engagement insights
3. Potential collaboration opportunities
4. Repository visibility and adoption trends

**Full Payload:**

```json
{{{payload}}}
```