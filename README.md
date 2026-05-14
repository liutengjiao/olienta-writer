# Olienta

Olienta is a local-first AI assisted writing desktop app. The current codebase is a rebuild from preserved product documents.

## Current Status

- `docs/` contains product memory and the rebuild plan.
- `app/` contains the new React + Tauri source tree.
- The first backend modules define local project scaffolding, path safety, and atomic writes.
- Latest handoff checkpoint: `docs/当前进度_2026-05-15_接手推进总控.md`.

## Development

```powershell
cd app
npm install
npm run build
```

Desktop commands require Rust and Cargo:

```powershell
cd app
npm run desktop:dev
```

## Product Direction

The author's local files are the source of truth. AI output enters editable candidate drafts first, and only explicit author adoption can move generated text into confirmed manuscript files.
