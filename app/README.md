# Olienta App

This directory contains the React + Tauri desktop app for Olienta Writer.

## Commands

```powershell
npm install
npm run dev
npm run desktop:dev
npm run verify
npm run desktop:build
```

`npm run dev` is browser preview only. It cannot read or write local project files through Tauri.

`npm run desktop:dev` starts the real desktop app and requires port `1420`.

## Structure

- `src/`: React UI and workspace logic.
- `src-tauri/`: Rust backend, Tauri commands, local file model.
- `scripts/`: smoke checks and verification helpers.

## Safety

Do not commit real API keys, `ai-providers.json`, `provider-secret.key`, private manuscript projects, or local absolute paths.
