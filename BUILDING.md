# Building ClaudOrchestrator

## Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [Rust](https://rustup.rs/) (stable toolchain)
- [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) (Windows — required by Tauri)
- WebView2 Runtime (pre-installed on Windows 11)

Install Tauri CLI and frontend dependencies:

```powershell
npm install
```

---

## Development

Start the app in development mode with hot-reload:

```powershell
npm run tauri dev
```

This runs `npm run dev` (Vite on `http://localhost:1420`) and the Tauri shell concurrently.

---

## Production Build

Build the optimised frontend and Rust binary:

```powershell
npm run tauri build
```

Artifacts are placed in `src-tauri/target/release/bundle/nsis/`:

| File | Purpose |
|------|---------|
| `*.exe` | Standalone installer for direct download |
| `*.nsis.zip` | Update bundle (used by the auto-updater) |
| `*.nsis.zip.sig` | Signature for the update bundle |

---

## Signing (required for the auto-updater)

### Generate a key pair (one-time setup)

```powershell
npx @tauri-apps/cli signer generate -w "$HOME\.tauri\claudorchestrator.key"
```

This writes the **private key** to `~\.tauri\claudorchestrator.key` and prints the **public key** to the console.

Paste the public key into `src-tauri/tauri.conf.json` under `plugins.updater.pubkey`.

### Sign builds manually

If you are not using the release script, set the environment variable before building:

```powershell
$env:TAURI_SIGNING_PRIVATE_KEY = Get-Content "$HOME\.tauri\claudorchestrator.key" -Raw
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = ""   # omit if you set a password
npm run tauri build
```

---

## Releasing

Use the release script to bump the version, sign, build, and package in one step:

```powershell
.\scripts\release.ps1
```

The script will:

1. Show the current version and suggest the next patch bump
2. Prompt for a new version number (semver `X.Y.Z`)
3. Prompt for optional release notes
4. Update the version in `tauri.conf.json`, `Cargo.toml`, and `package.json`
5. Load the signing key from `~\.tauri\claudorchestrator.key` automatically
6. Run `npm run tauri build`
7. Generate `latest.json` for the auto-updater
8. Copy all artifacts to `release/`

### Uploading to GitHub

After the script finishes, upload the contents of `release/` to a new GitHub Release:

1. Go to `https://github.com/Apolog1ze-Dev/ClaudOrchestrator/releases/new`
2. Set the tag to `vX.Y.Z` and the title to `ClaudOrchestrator vX.Y.Z`
3. Upload all four files:
   - `*.exe`
   - `*.nsis.zip`
   - `*.nsis.zip.sig`
   - `latest.json`
4. Publish the release

The auto-updater endpoint reads `latest.json` directly from the release assets.

---

## Version locations

The version string lives in three files and must be kept in sync (the release script handles this automatically):

| File | Field |
|------|-------|
| `src-tauri/tauri.conf.json` | `"version"` |
| `src-tauri/Cargo.toml` | `version` under `[package]` |
| `package.json` | `"version"` |
