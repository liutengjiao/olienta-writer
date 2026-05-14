# Olienta 重建计划

创建日期：2026-05-09

## 1. 当前判断

这个项目曾经删除过旧代码，目前以 `app/` 下的 Tauri + React + TypeScript 作为新的桌面端代码树继续重建。旧文档仍然有价值，但只能作为产品要求和行为约束，不能当作当前实现事实。

之后新增或维护的项目文档必须使用中文。

## 2. 不可违背的产品原则

- Olienta 是桌面写作平台，永远不做网页端。
- 写作项目就是一个普通本地文件夹。
- 作者必须能直接看到并打开项目里的 `.md` 文件。
- Markdown 是第一版的核心文本格式。
- 默认编辑器目标是 Obsidian 式 Markdown 所见即所得，同时保留纯 Markdown 源文件。
- 蓝图和正文必须分开存储。
- AI 不能默认直接写入已确认正文。
- AI 整章输出必须先进入候选稿/草稿箱。
- 作者可以修改 AI 候选稿里的每一个字。
- 正文保存即视为作者确认。
- 作者确认的正文、框架文件、事实库、蓝图和作者输入优先级高于 AI。
- 正文保存后应自动抽取事实进入事实库。
- 蓝图重生成时，默认覆盖后续章节蓝图，不弹窗确认；作者在每一章正式写作前会重新确认。
- 第一版只做中文和英文，其它语言以后再说。
- 基础版免费，类似开源发布；收费只解锁“时间轴及里程碑”模块能力。
- Skill 第一版只支持作者导入和选择，不做复杂市场、协作或自动管理。
- 暂时不做多人协作。
- Windows 和 macOS 是第一目标；手机/iPad 语音写作以后再做。

## 3. 栏目结构

一级栏目：

- 小说设置
- 故事构架
- 章节蓝图
- 草稿箱
- 正文

故事构架的二级栏目：

- 故事前提
- 角色图谱
- 世界观
- 情节大纲
- 时间轴及里程碑

章节蓝图的二级栏目是章节列表，每章对应一个 `blueprints/chapters/*.md`。

草稿箱的二级栏目是章节列表，每章对应候选稿和作者微操输入，候选稿位于 `manuscript/candidates/*.md`。

正文的二级栏目是章节列表，每章对应一个 `manuscript/chapters/*.md`。

## 4. 项目文件夹目标结构

```text
project.yaml
framework/
  01-setting.md
  02-premise.md
  03-characters.md
  04-plot-outline.md
  05-world.md
  06-style.md
blueprints/
  chapters/
  history/
manuscript/
  chapters/
  author-input/
  candidates/
  copies/
facts/
  confirmed-facts.md
  author-confirmation.md
  open-loops.md
timeline/
  events.md
skills/
  selected/
exports/
.olienta-events/
  commits/
.olienta/
  ai-providers.json
  genre-profile.json
  writing-methodology.json
  timeline-settings.json
  tasks.json
```

## 5. 第一版范围

第一版先完成一条可靠的作者控制链路：

1. 创建和打开本地项目。
2. 非破坏式补齐项目目录。
3. 读取和保存框架文件。
4. 读取和保存章节蓝图。
5. 读取和保存作者输入。
6. 读取和保存候选稿。
7. 作者明确采用候选稿后才写入正文。
8. 正文保存后更新作者确认记录、事实库和事件日志。
9. 支持 OpenAI-compatible Provider 配置。
10. 支持 Markdown 和 TXT 导出，后续补 Word。
11. Skill 支持导入和选择。
12. 时间轴及里程碑作为 Pro 模块，基础版可预览本地文件。

## 6. AI 工作流

第一版 AI 不做“全自动替作者写书”，只做可审查的流水线：

```text
本地项目文件
  -> 上下文装配
  -> 写作任务书
  -> 候选稿生成
  -> 规则审查
  -> 作者编辑
  -> 明确采用
  -> 正文确认、事实抽取、事件记录
```

AI 必须读取并服从：

- 框架文件
- 当前章节蓝图
- 作者输入
- 已确认正文记录
- 事实库
- 未闭合伏笔
- 已选择 Skill
- 类型方法论

## 7. 技术方向

- 桌面壳：Tauri 2。
- 后端：Rust Tauri commands，负责文件系统、项目迁移、导出和 AI 请求。
- 前端：React + TypeScript + Vite。
- 项目内容不使用数据库，直接使用本地 Markdown、YAML、JSON。
- 最近项目等软件偏好存储在项目外部。
- 编辑器第一阶段可先用稳定文本编辑器，随后升级为成熟 Markdown 所见即所得内核。

## 8. 当前优先级

1. 把界面结构改成和产品栏目一致，尤其是章节蓝图、草稿箱、正文下的章节二级栏目。
2. 完成 Skill 导入和选择。
3. 做 AI 生成框架文件草案，草案可编辑，保存后才确认。
4. 做 AI 生成章节蓝图草案，保存后默认覆盖后续章节蓝图。
5. 升级 Markdown 编辑器体验。
6. 补 Word 导出。
