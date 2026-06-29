# At-Rest Encryption for Self-Hosted Vaults

ZenNotes stores notes as plain `.md` files on disk. The server doesn't
encrypt them — by design, you should be able to read them with any text
editor and back them up with any tool. That puts the at-rest encryption
choice in your hands as the operator.

This guide lays out three approaches, in order of effort. Pick one
based on your threat model and where the vault lives.

## What you're protecting against

Reasonable threats for a self-hosted notes vault:

- **VPS snapshot exfiltration** — the hosting provider is compelled or
  compromised; the disk image leaves your control intact.
- **Stolen laptop / NAS** — physical theft of the host.
- **Backup leakage** — backup ends up in S3, Backblaze, a USB drive, or
  someone's email.
- **Sloppy handoff** — you decommission a server but the disk goes back
  into a pool without secure erase.

What this guide does *not* try to solve:

- A live, running ZenNotes server compromised at runtime. If the
  attacker is root on the box while ZenNotes is reading the vault, the
  decryption key is also in memory. End-to-end encryption (notes
  encrypted by the client before they reach the server) is the only
  defense for that case, and ZenNotes does not yet ship it.

## Option 1 — Encrypt the backup, not the volume

The cheapest, highest-value step. If the only realistic exposure is
backup leakage, encrypted backups are usually enough.

**[BorgBackup](https://www.borgbackup.org/)** or
**[restic](https://restic.net/)** both offer authenticated encryption
with a passphrase. Either one wraps your full vault into immutable,
encrypted snapshots that are safe to push to any object store.

```bash
# Borg, daily
borg init --encryption=repokey-blake2 /backup/vault.borg
borg create --stats /backup/vault.borg::"$(date +%F)" /workspace
borg prune --keep-daily 14 --keep-weekly 8 /backup/vault.borg
```

```bash
# restic, with a remote bucket
export RESTIC_REPOSITORY=s3:s3.amazonaws.com/your-bucket
export RESTIC_PASSWORD_FILE=~/.restic-pass
restic backup /workspace
restic forget --keep-daily 14 --keep-weekly 8 --prune
```

The vault itself stays plaintext on the live host. That keeps ZenNotes
fast and lets you grep the files directly. Anyone who steals only a
backup gets ciphertext.

## Option 2 — Encrypt the volume

If you also want protection against host-disk seizure or VPS
snapshots, put the vault on an encrypted block device or filesystem
and unlock it at boot.

### Linux LUKS (full encrypted volume)

```bash
# Create an encrypted block device on /dev/sdX (or a loopback file).
sudo cryptsetup luksFormat /dev/sdX
sudo cryptsetup luksOpen /dev/sdX zenvault
sudo mkfs.ext4 /dev/mapper/zenvault
sudo mkdir -p /srv/zenvault
sudo mount /dev/mapper/zenvault /srv/zenvault
```

Point Docker at the mounted directory:

```bash
CONTENT_ROOT=/srv/zenvault make up
```

After a reboot, you must re-unlock the volume before starting the
container — typically with `cryptsetup luksOpen` and a passphrase or a
keyfile from a hardware token.

### ZFS native encryption

If the host is on ZFS, native encryption is simpler than LUKS:

```bash
sudo zfs create -o encryption=on -o keylocation=prompt -o keyformat=passphrase tank/zenvault
sudo zfs mount tank/zenvault
```

Then bind-mount or symlink that dataset as the ZenNotes vault.

### macOS sparsebundle / APFS encrypted volume

`hdiutil create -encryption AES-256 -fs APFS -size 50g vault.sparsebundle`
gives you an encrypted disk image that auto-mounts when unlocked in
Finder. Useful for desktop-only setups.

## Option 3 — Encrypt remote backups *and* the volume

The recommended posture for a public VPS deployment:

1. Volume encryption (LUKS or ZFS) so a snapshot is ciphertext.
2. Encrypted off-site backups (Borg or restic) so a host loss doesn't
   take notes with it.
3. Token rotation in your deployment source of truth (see below) so a
   session leak doesn't grant indefinite access.

## Token rotation

If ZenNotes owns the token in host config and you suspect the bootstrap
auth token leaked, rotate it without restarting the container:

```bash
curl -X POST https://notes.example.com/api/session/rotate-token \
  -H "Authorization: Bearer $CURRENT" \
  -H "Content-Type: application/json" \
  -d '{"currentToken":"'"$CURRENT"'","newToken":"'"$NEW"'"}'
```

All existing sessions are invalidated; you'll need to log in again
with the new token.

If Docker, systemd, or another orchestrator supplies the token via
`ZENNOTES_AUTH_TOKEN` or `ZENNOTES_AUTH_TOKEN_FILE`, rotate it there
instead. For the default Docker `make up` workflow, edit
`./data/auth-token` and restart the container.

## What ZenNotes is *not* protecting

Two things worth being explicit about:

- **No end-to-end encryption.** Notes leave the server-side encryption
  layer (LUKS, etc.) and become plaintext the moment ZenNotes reads
  them. The browser sees plaintext. The desktop app sees plaintext. A
  compromised running server sees plaintext.
- **No per-note keys.** If you mount only part of the vault to a
  collaborator, they see everything in their slice. The unit of access
  is the vault.

If those gaps matter to you, the right answer is to keep ZenNotes on a
trusted local-network or single-user host and rely on the layered
mitigations above.

## Related docs

- [Secure Self-Hosting](./secure-self-hosting.md)
- [Security Reference](../reference/security-reference.md)
- [Security Model](../explanation/security-model.md)
