# Website and APT hosting

Cloudflare Pages project `quillpane` serves https://quillpane.shreyam1008.com.np/.
Its GitHub production branch is `cf-pages`, output directory `.`, with no build
command and `SKIP_DEPENDENCY_INSTALL=true`.

Do not point Pages directly at `main:docs`: that checkout does not include the
generated signed APT repository. `.github/workflows/pages.yml` builds the signed
repository, verifies a local APT installation, then publishes the complete docs
artifact to `cf-pages`. Cloudflare deploys that branch through GitHub integration.
APT signing secrets stay in GitHub Actions; Cloudflare receives only public files.

The existing GitHub Pages deployment and anonymous HTTPS APT check remain in the
workflow during migration. Rollback restores the custom-domain CNAME to
`shreyam1008.github.io`, DNS-only. Keep `/apt/`, public signing keys, package
hashes, canonical metadata and the explicit HTTP 404 page intact.

Website visitor analytics are separate from the installed app, which remains
local-only and has no telemetry.
