# Olienta 写作平台 — 项目进度审计

审计时间：2026-05-08
当前版本：v0.1.1

---

## 一、项目概况

Olienta 是一个本地优先的 Tauri 桌面小说写作平台，技术栈为 Rust 后端 + React/TypeScript 前端。项目数据完全存储在本地文件夹中，不依赖数据库（不使用 SQLite/Prisma/IndexedDB），所有数据都是可见的 Markdown 文件和 JSON 配置文件。

### 已构建产物

- `olienta-writing-platform.exe`（桌面端主程序）
- MSI 安装包：`Olienta Writer_0.1.0_x64_en-US.msi`
- NSIS 安装包：`Olienta Writer_0.1.0_x64-setup.exe`
- 冒烟测试全部通过（`cargo test smoke_tests`）
- 前端构建通过（`npm run build`）
- Rust 编译通过（`cargo check`）

---

## 二、已完成功能（全部已验证可运行）

### 2.1 项目管理
- 新建项目（名称、路径、语言、章节数、每章字数）
- 打开本地项目
- 最近打开项目记录（持久化到 `recent-projects.json`）
- 系统文件夹选择器（PowerShell FolderBrowserDialog）
- 三个项目模板：严肃文学长篇、网文长篇、空白项目
- 旧项目自动补齐缺失目录和文件（非破坏性）

### 2.2 本地文件模型
完整实现本地文件夹结构，所有数据对用户可见：
```
project.yaml
framework/          — 框架设定、大纲、世界观、前提、角色、时间轴
blueprints/chapters/ — 章节蓝图
blueprints/history/  — 蓝图覆盖历史备份
manuscript/chapters/ — 已确认正文
manuscript/author-input/ — 每章作者输入
manuscript/copies/  — 章节副本（双屏对照用）
facts/              — 已确认事实、作者确认账本
timeline/           — Timeline Pro 时间线文件
skills/selected/    — Skill 文件
exports/            — 导出文件
.olienta/           — AI 配置、类型配置、Timeline 配置、任务记录
```

### 2.3 写作工作台
- Markdown 所见即所得编辑器（原型级，支持标题、引用、列表、源码模式切換）
- 本章助手面板：蓝图显示、作者输入、生成整章按钮
- 自动保存（500ms 防抖）
- 每章字数统计
- 纯写作模式（全屏专注）
- 双屏对照（左屏历史副本只读，右屏当前章可编辑）
- 章节副本创建和管理

### 2.4 候选稿流程
- AI 生成 → 候选稿区域（不直接覆盖正文）
- 候选稿可逐字编辑
- 规则型冲突检查（蓝图约束、事实库约束、已确认正文冲突）
- 作者确认后「采用为正文」才写入正式文件
- 清空候选稿功能

### 2.5 章节蓝图
- 章节蓝图编辑（本章目标、必须发生、禁止提前发生）
- AI 生成蓝图草案（作者可修改后保存）
- 保存后级联覆盖后续章节蓝图
- 蓝图覆盖前自动备份到 `blueprints/history/`
- 最近覆盖记录（`last-cascade.md`）
- 批量生成蓝图（指定范围或全量）

### 2.6 框架文件
- 六个框架文件的完整读/写/保存流程
- 框架设定、大纲、世界观、前提、角色图谱、时间轴与里程碑
- AI 生成框架草案（作者可修改后保存）
- 框架文件作为 AI 后续生成的硬约束

### 2.7 事实库
- 正文保存后自动抽取事实（规则型）
- 去重
- 手动重扫全部章节事实
- 重扫前自动备份旧事实库
- 事实参与 AI 生成上下文

### 2.8 作者确认
- 保存即确认原则
- 自动生成作者确认账本（`facts/author-confirmation.md`）
- AI 后续必须服从已确认章节
- 筛选排除占位正文（"正文待写。""待确认"等）

### 2.9 AI 配置
- 支持 9 种 Provider 类型：OpenAI-compatible、OpenAI、DeepSeek、Gemini、Claude、通义千问、智谱、Moonshot、Ollama
- 新增/复制/删除 Provider
- 编辑 Base URL、API Key、模型名、上下文窗口、温度、流式输出
- 用途映射：framework、blueprint、chapter、style、facts、timeline、translation
- 连接测试（OpenAI-compatible 类型）
- 配置按项目独立保存到 `.olienta/ai-providers.json`

### 2.10 AI 生成能力
三个生成命令已接入真实 API 调用（OpenAI-compatible 协议）：
- 框架草案生成（`generate_framework_draft`）
- 章节蓝图生成（`generate_chapter_blueprint`）
- 整章正文生成（`generate_chapter_draft`）
- 上下文组装包含：框架文件、事实库、已确认正文、类型配置、Skill、时间轴约束、蓝图
- 无可用 Provider 时自动降级为本地占位草案

### 2.11 类型与小说配置
- 三组分类：文学定位、网络文学男频、网络文学女频
- 可自定义关键词
- 保存到 `.olienta/genre-profile.json`
- 分类信息参与 AI 生成提示词

### 2.12 Timeline Pro
- 可视化时间轴预览
- 从蓝图和事实推导时间线节点
- 里程碑、角色进入/成长分类
- 锁定/解锁状态切换（基础版预览 vs Pro 编辑）
- 时间轴约束可参与 AI 生成前检查（解锁状态下）
- 配置文件 `.olienta/timeline-settings.json`

### 2.13 Skill 系统
- 导入本地 Markdown Skill 文件
- 长期选择库（项目默认规则）
- 临时选择库（单章/单轮策略）
- 双库独立管理，同时可多选
- AI 生成时 Skill 进入提示词上下文

### 2.14 导出
- Markdown 汇总（所有章节合为一个文件）
- TXT（去除 Markdown 标记）
- Word（基础 docx，带首行缩进）

### 2.15 其他
- 任务面板（实时反馈状态，持久化到 `.olienta/tasks.json`）
- 本地文件浏览（按分类分组查看所有 Markdown 文件）
- 项目自检页面（一键测试所有核心模块）
- AI 助手面板（预留槽位）
- 系统状态栏

---

## 三、尚未完成的功能

以下是文档中明确标注为「下一步」「后续升级」「当前边界」但尚未实现的功能：

### 3.1 高优先级（影响核心写作体验）

| 功能 | 当前状态 | 文档参考 |
|------|----------|----------|
| 流式 AI 生成输出 | 一次性返回，无流式 | AI_CHAPTER_GENERATION.md |
| 可中止的 AI 生成任务 | 不支持取消 | AI_CHAPTER_GENERATION.md |
| AI 语义级冲突检查 | 仅有规则型 | CANDIDATE_CONFLICT_CHECK.md |
| 候选稿多版本历史 | 仅一个版本，清空不可恢复 | EDITABLE_CANDIDATE_DRAFT.md |
| 候选稿采用方式 | 仅全文替换，无追加/插入 | CANDIDATE_DRAFT_FLOW.md |
| 候选稿与正文 diff 对比 | 未实现 | EDITABLE_CANDIDATE_DRAFT.md |
| 成熟 Markdown 编辑器 | 当前为原型编辑器 | MARKDOWN_EDITOR.md（建议 ProseMirror/TipTap/Milkdown） |
| API Key 加密存储 | 明文 JSON | AI_PROVIDER_CONFIG.md（建议系统钥匙串） |

### 3.2 中优先级（扩展 AI 能力）

| 功能 | 当前状态 | 文档参考 |
|------|----------|----------|
| Gemini/Claude/通义千问/智谱/Moonshot 官方协议 | 仅 OpenAI-compatible 路径可用 | AI_PROVIDER_CONFIG.md |
| AI 事实抽取（语义级） | 仅规则型 | FACT_EXTRACTION.md |
| 事实来源定位（章节/段落/原文） | 未实现 | FACT_EXTRACTION.md |
| 事实库拆分 Markdown + SQLite | 仅 Markdown | FACT_EXTRACTION.md |
| Provider 排序/分组/导入导出 | 未实现 | AI_PROVIDER_CONFIG.md |
| 按用途的模型选择策略 | 未实现 | AI_PROVIDER_CONFIG.md |
| AI 深度重写蓝图级联 | 当前用规则重写 | BLUEPRINT_CASCADE.md |

### 3.3 中优先级（完善写作工具）

| 功能 | 当前状态 | 文档参考 |
|------|----------|----------|
| Skill 文件选择器 | 手动填路径 | SKILL_MODULE.md |
| Skill 分类体系 | 未实现 | SKILL_MODULE.md |
| Skill 冲突提示 | 未实现 | SKILL_MODULE.md |
| Word 导出正式排版 | 基础版，无模板/页眉页脚/章节样式 | EXPORTS.md |
| 事实库作者可编辑确认界面 | 未实现 | FACT_EXTRACTION.md |

### 3.4 低优先级（Pro 模块和增强）

| 功能 | 当前状态 | 文档参考 |
|------|----------|----------|
| Timeline Pro 手动节点编辑 | 仅预览模式 | TIMELINE_PRO.md |
| Timeline Pro 节点拖拽 | 仅预览模式 | TIMELINE_PRO.md |
| Timeline Pro 节点锁定 | 仅预览模式 | TIMELINE_PRO.md |
| Timeline Pro 角色成长可视化 | 仅预览模式 | TIMELINE_PRO.md |
| 付费/授权逻辑 | 未实现 | TIMELINE_PRO.md |
| 最近项目使用用户配置目录 | 当前使用 app_config_dir | PROJECT_MANAGER.md |

---

## 四、示例项目 "无痛剥离"

项目位于 `D:\windsurf\olienta-projects\wutongboli-sample-project`，包含：
- 完整 6 个框架文件（含备份）
- 6 章蓝图（001-006.md）
- 已配置类型配置（`genre-profile.json`）
- 2 个 Skill（严肃现实主义长篇、网文节奏控制）
- 已导入 AI providers 配置
- Timeline Pro 配置文件
- 已作为默认打开项目和冒烟测试基准

---

## 五、关于 Codex → Antigravity 切换

当前代码库中没有发现 Antigravity 特定的 SDK 调用。所有前后端通信使用标准 Tauri `invoke` 模式：

- 前端：`import { invoke } from '@tauri-apps/api/core'`
- 后端：`#[tauri::command]` 标注的 Rust 函数

项目在 30 个文档文件中没有提到 Antigravity 或 Codex。之前用 Codex/Antigravity 可能指的是 Windsurf IDE 中的 AI 编程助手切换（而非项目代码依赖的变更）。项目代码库本身当前是可编译、可运行的 Tauri 2 应用。

---

## 六、总结

**项目进度：约 70%**

核心写作功能环路已完整打通：框架设计 → 蓝图规划 → AI 草案 → 作者修改 → 确认正文 → 事实抽取 → 导出成品。所有基础 CRUD 操作、文件管理、AI 调用路径、版本备份、冲突检查、Skill 管理均已实现并经过测试验证。

主要缺失集中在三个方面：
1. **AI 体验升级**（流式输出、取消任务、语义检查、多候选版）
2. **编辑器升级**（从原型编辑器到成熟内核）
3. **Pro 模块解锁**（Timeline Pro 从预览到可编辑）
