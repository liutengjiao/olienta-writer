# Skill 文件模块当前版本

当前已把 Skill 文件从概念入口推进到当前版本可用形态。

## 当前规则

- Skill 是 Markdown 文件。
- 当前项目会扫描 `skills/selected/*.md`。
- 被扫描到的 Skill 默认视为已选择。
- AI 整章生成时会把已选择 Skill 放进提示词上下文。
- Skill 只提供写作方法，不能覆盖作者已确认正文、事实库、蓝图和框架文件。

## 已放入样例项目的 Skill

- `skills/selected/serious-realism-novel.md`：严肃现实主义长篇小说。
- `skills/selected/commercial-serial-pacing.md`：网文长篇节奏控制。
- `skills/selected/fact-memory-extraction.md`：从作者确认正文抽取事实库、伏笔、回收、人物成长和变化。
- `skills/selected/chapter-context-assembly.md`：写前组装章节任务书，控制上下文召回顺序。
- `skills/selected/narrative-reviewer.md`：采用候选稿前审查设定、时间线、人物、逻辑、节奏和 AI 味。
- `skills/selected/chapter-blueprint-planning.md`：生成或审查章节蓝图，明确必须发生、禁止提前、信号和剧透边界。
- `skills/selected/anti-ai-prose-polish.md`：正文润色和改写时降低 AI 味，保留事实、视角和作者风格。
- `skills/selected/dialogue-and-scene-craft.md`：强化对话潜台词、场景调度、视角控制和细节质感。

这些默认 Skill 借鉴了通用小说写作 agent 的 Context Agent、Data Agent、Reviewer、写作/审稿/反套路资料，但已经改写为 Olienta 本地项目模型：作者确认正文优先，蓝图次之，候选稿不得直接写入事实库。

## 下一版要补

- 文件选择器，不需要作者手填路径。
- 选择/取消选择持久化。
- Skill 市集或候选库，允许从可信本地资料和受信任仓库导入。
