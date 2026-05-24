# Contributing to Olienta Writer

Thank you for considering a contribution.

## Development

```powershell
cd app
npm install
npm run verify
```

Use `npm run dev` for browser preview only. Use `npm run desktop:dev` for real desktop behavior.

## Rules

- Do not commit API keys, local provider config, private projects, or absolute local paths.
- Keep author files local-first and human-readable.
- AI output must remain a candidate until the author explicitly adopts it.
- Prefer small, focused pull requests.
- Run `npm run verify` before submitting.

## Recommended Areas

- Cross-platform packaging.
- Markdown preview.
- Dark theme.
- Provider setup guides, especially Ollama.
- Refactoring large modules into smaller domains.
