# Release Event Prompt

Analyze the following release event:

## Repository: {{repository.full_name}}
## Action: {{action}}
## Release: {{release.tag_name}} - {{release.name}}

### Release Details:
- **Version**: {{release.tag_name}}
- **Name**: {{release.name}}
- **Draft**: {{release.draft}}
- **Prerelease**: {{release.prerelease}}
- **Created**: {{release.created_at}}
- **Published**: {{release.published_at}}
- **Author**: {{release.author.login}}

### Release Notes:
{{release.body}}

### Assets:
{{#each release.assets}}
- **{{this.name}}** ({{this.size}} bytes) - {{this.download_count}} downloads
{{/each}}

### Analysis Request:
**IMPORTANT**: First verify this is a real GitHub event and not a test:

1. **Verification Step**: Use `gh release view {{release.tag_name}} --repo {{repository.full_name}}` to verify this release exists
   - If the command fails or returns "not found", this is likely a test event - analyze but don't take actions
   - If the release exists, proceed with analysis and potential actions

2. **Analysis**: Please analyze this release and provide:
   - Release impact assessment (breaking changes, new features, bug fixes)
   - Version significance analysis (semantic versioning compliance)
   - Notable changes or features from release notes
   - Deployment and upgrade considerations
   - Community impact (if public repository)

3. **Actions** (only if verified as real):
   - If the release notes are incomplete, suggest improvements or add details using `gh release edit {{release.tag_name}} --notes "Updated notes" --repo {{repository.full_name}}`
   - If this is a major release, consider creating announcement issue or discussion
   - If there are security fixes, ensure proper CVE references and security advisories
   - If assets are missing, suggest adding them using `gh release upload {{release.tag_name}} file.zip --repo {{repository.full_name}}`
   - For significant releases, consider notifying stakeholders or updating documentation

**Full Payload:**

```json
{{{payload}}}
```