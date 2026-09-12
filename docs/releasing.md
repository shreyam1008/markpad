# One-push releases

Update the current version metadata, run the normal checks and
`python packaging/check-release-version.py`, then commit and create an annotated
`vX.Y.Z` tag. Push `main` and that one tag with
`git push --atomic origin main vX.Y.Z`.

The release pipeline rejects source/tag version drift before building. Windows
Setup and MSIX share the same executable; the MSIX builder checks its PE version.
Snap builds the exact tag and verifies the packed Snap version before upload.
GitHub publication waits for Windows, macOS, Linux and Snap. Signed APT and the
website are then rebuilt from the exact release. An ordinary website push with a
version ahead of the published packages is deferred instead of linking missing
downloads.

Microsoft Store and Snap Store are external publication channels, not aliases for
GitHub assets. Their installed versions can remain older while credentials or
certification are pending. At this setup, only the APT signing credential is
configured in GitHub Actions. The Snap publishing workflow requires
`SNAPCRAFT_STORE_CREDENTIALS`; Microsoft Store automated submission requires its
account/API setup. Do not put those credentials in source or chat. Until connected,
use the matching MSIX for Partner Center submission and the verified Snap
publishing workflow. Do not claim either store is synchronized from a package
build alone.

An installed app does not change when a release is published. Windows, Linux/WSL,
and Store installations are separate; each must run its own update. Help displays
the version of the running app and labels GitHub's version separately.
