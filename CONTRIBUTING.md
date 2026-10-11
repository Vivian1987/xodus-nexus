# Contributing to Xodus Nexus

Xodus Nexus is an independent Linux launcher. It does not bundle Xodus, Proton, games, Microsoft credentials, or game saves.

## Development

Use Node.js and npm, then run `npm ci`, `npm run build`, and `npm run pack`. The backend manager builds upstream Xodus separately with Git, Cargo, Rust and protoc. Do not develop against a user's active Xodus checkout or game folder; use disposable test directories.

Keep title detection based on package manifests and advertised CLI capabilities. If a workaround applies only to one game, document it as experimental and do not present it as generic support. Store artwork and product data must come from the live catalog, not static fabricated fixtures in the production UI.

When reporting bugs, include the launcher version, Xodus commit, runtime version, distribution, and a redacted diagnostic log. Remove account identifiers, tokens, private paths, and save data before uploading anything. Do not attach game files or proprietary artwork.

## Release hygiene

Only publish the tracked source tree and freshly built artifacts. `outputs/`, `work/`, `release/`, local Electron userData, game prefixes, and save backups are ignored and must never enter a public repository. Review `git status` and the archive file list before publishing.
