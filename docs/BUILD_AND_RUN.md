# Build and Run

Olienta is a local-first Tauri desktop app. It is not a web product.

## Requirements

- Node.js 22+
- Rust / Cargo
- Visual Studio 2022 Build Tools with C++ workload

On this machine these were installed with `winget`:

```powershell
winget install --id Rustlang.Rustup --silent --accept-package-agreements --accept-source-agreements
winget install --id Microsoft.VisualStudio.2022.BuildTools --silent --accept-package-agreements --accept-source-agreements --override "--wait --quiet --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended --norestart"
```

## Frontend Build

```powershell
cd D:\windsurf\olienta\app
npm install
npm run build
```

## Rust Check

```powershell
cd D:\windsurf\olienta\app\src-tauri
$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"
$env:CARGO_BUILD_JOBS = "1"
cargo check
```

## Desktop Build

Use a separate target directory to avoid Windows file-lock issues in the default `target` folder:

```powershell
cd D:\windsurf\olienta\app
$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"
$env:CARGO_BUILD_JOBS = "1"
$env:CARGO_TARGET_DIR = "C:\tmp\olienta-tauri-target"
npm run desktop:build
```

## Current Artifacts

```text
C:\tmp\olienta-tauri-target\release\olienta-writing-platform.exe
C:\tmp\olienta-tauri-target\release\bundle\msi\Olienta Writer_0.1.0_x64_en-US.msi
C:\tmp\olienta-tauri-target\release\bundle\nsis\Olienta Writer_0.1.0_x64-setup.exe
```


## Backend Smoke Tests

```powershell
cd D:\windsurf\olienta\app\src-tauri
$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"
$env:CARGO_BUILD_JOBS = "1"
$env:CARGO_TARGET_DIR = "C:\tmp\olienta-tauri-target"
cargo test smoke_tests -- --nocapture
```

The smoke tests verify:

- The sample project loads.
- `timeline/events.md` is listed as a timeline Markdown file.
- Locked Timeline Pro settings do not inject constraints into AI generation.
- Unlocked Timeline Pro settings with conflict checking do inject timeline constraints.

## Verified

- `npm run build` passed.
- `cargo check` passed.
- `cargo test smoke_tests -- --nocapture` passed.
- `npm run desktop:build` passed.
- The built desktop exe starts and responds with the window title `Olienta Writer`.

## 《无痛剥离》测试项目

用于真实数据测试的导入命令：

```powershell
cd D:\windsurf\olienta\app
npm run sample:wutongboli
```

默认读取：

```text
D:\windsurf\小说\无痛剥离
```

默认生成：

```text
D:\windsurf\olienta-projects\wutongboli-sample-project
```

导入内容：

- 第 1 号文件：故事前提 -> `framework/02-premise.md`
- 第 2 号文件：世界观 -> `framework/05-world.md`
- 第 3 号文件：角色图谱 -> `framework/03-characters.md`
- 第 4 号文件：情节大纲 -> `framework/04-plot-outline.md`
- 第 5 号文件：本小说的特色 -> `framework/06-style.md`
- 第 6 号文件：时间轴及里程碑 -> `timeline/events.md`
- 前 3 章真实草稿 -> `manuscript/chapters/001.md` 到 `003.md`
- 34 章章节壳、蓝图、作者输入、候选稿、事实库、Skill 和本地 AI Provider 配置
