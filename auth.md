# auth.md

Quillpane's website documents a local-first desktop application. Its public
documentation and discovery files are anonymous and require no account, API
key, OAuth token, or agent registration.

Quillpane does not expose a hosted document API, remote MCP transport, or OAuth
authorization server. Notes, workspace paths, drafts, and history remain on the
user's device. Agents may read the public documentation listed in
[`llms.txt`](https://quillpane.shreyam1008.com.np/llms.txt).

```yaml
agent_auth:
  registration_required: false
  identity_types_supported: [anonymous]
  credential_types_supported: [none]
  protected_resources: []
  authorization_servers: []
```
