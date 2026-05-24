# Olienta Writer

Olienta Writer is a local-first AI writing desktop app for long-form fiction.

Olienta Writer 是一款本地优先的 AI 辅助长篇写作桌面软件。

> 作者为自己打造的 AI 写作平台。AI 可以替你写每一个字，但只有你决定哪一个字留下。
>
> Built for authors. AI drafts, you decide.

## What Makes Olienta Different

Most AI writing tools start from a chat box. Olienta starts from the author's workflow:

- Novel structure and genre positioning
- Story framework, character map, worldbuilding, plot outline, key scenes, timeline
- Chapter blueprint and chapter writing brief
- AI candidate draft
- Candidate review, comparison, and author adoption
- Confirmed manuscript, facts, open loops, and model-call records

AI output never silently overwrites the manuscript. Generated text stays in candidate drafts until the author explicitly saves, adopts, inserts, or replaces it.

## Core Principles

- **Local first**: projects are plain local files controlled by the author.
- **Author sovereignty**: the confirmed manuscript is changed only by explicit author action.
- **Candidate draft workflow**: AI writes candidates; authors decide what survives.
- **Long-form consistency**: facts, open loops, forbidden rules, story contracts, and chapter reviews help reduce continuity drift.
- **Provider neutral**: works with OpenAI-compatible providers such as DeepSeek and Ollama-compatible local endpoints, plus Anthropic support.

## Download

For writers, use the installer from GitHub Releases. You do not need Node.js, Rust, or any development tooling.

Windows release files:

- `Olienta Writer_0.1.0_x64-setup.exe`
- `Olienta Writer_0.1.0_x64_en-US.msi`

## First Run

1. Create or open a novel project folder.
2. Open AI Provider settings.
3. Add a provider, for example DeepSeek as `OpenAI-compatible`.
4. Fill in Base URL, API Key, model name, then save and test.
5. Fill in novel structure and story framework.
6. Write or import chapter blueprints.
7. Generate candidate drafts.
8. Adopt only the text you want to enter the manuscript.

Olienta does not ship with any API key. Each user configures their own model provider.

## Local Model Quick Start: Ollama

Olienta can use local models through any OpenAI-compatible endpoint.

```powershell
ollama pull qwen2.5:14b
```

In Olienta, add a Provider:

- Type: `OpenAI-compatible`
- Base URL: `http://localhost:11434/v1`
- API Key: any local placeholder, for example `ollama`
- Model: the Ollama model name, for example `qwen2.5:14b`

Local models avoid API cost and keep generation on the author's machine, but quality and speed depend on hardware.

## Data And Security

- Novel files are stored in the project folder chosen by the author.
- Project Markdown files can also be opened with common Markdown editors such as Obsidian, Typora, VS Code, or MarkText.
- AI Provider settings are stored in the local software configuration, not in the novel project.
- On Windows, saved provider keys are protected with Windows DPAPI.
- Model-call logs do not record API keys.
- Do not commit real `ai-providers.json`, `provider-secret.key`, private projects, screenshots containing keys, or local absolute paths.

## Development

Requirements:

- Node.js
- Rust
- Windows WebView2 Runtime

Install dependencies:

```powershell
cd app
npm install
```

Browser preview:

```powershell
npm run dev
```

Desktop development:

```powershell
npm run desktop:dev
```

Full verification:

```powershell
cd app
npm run verify
```

Build Windows desktop packages:

```powershell
cd app
npm run desktop:build
```

## Browser Preview vs Desktop App

`npm run dev` is only a browser preview for development. It cannot access local project folders or Tauri desktop APIs.

Use the desktop app for real writing, importing, exporting, and AI-assisted project work.

## Documentation

Start with:

- [Build And Run](docs/BUILD_AND_RUN.md)
- [Local Project Model](docs/LOCAL_PROJECT_MODEL.md)
- [AI Provider Config](docs/AI_PROVIDER_CONFIG.md)
- [Chapter Workflow Chain](docs/CHAPTER_WORKFLOW_CHAIN.md)

## Official

- Website: [olienta.vip](https://olienta.vip)
- Contact: `olientavip@gmail.com`
- Trademark and official distribution: [TRADEMARK.md](TRADEMARK.md)
- Commercial terms and paid services: [COMMERCIAL.md](COMMERCIAL.md)
- License: [LICENSE](LICENSE)
