# Skill 文件模块第一版

本轮把 Skill 文件从概念入口推进到第一版可用形态。

## 当前规则

- Skill 是 Markdown 文件。
- 当前项目会扫描 `skills/selected/*.md`。
- 被扫描到的 Skill 默认视为已选择。
- AI 整章生成时会把已选择 Skill 放进提示词上下文。
- Skill 只提供写作方法，不能覆盖作者已确认正文、事实库、蓝图和框架文件。

## 已放入样例项目的 Skill

- `skills/selected/serious-realism-novel.md`：严肃现实主义长篇小说。
- `skills/selected/commercial-serial-pacing.md`：网文长篇节奏控制。

## 下一版要补

- 文件选择器，不需要作者手填路径。
- 选择/取消选择持久化。
- Skill 分类：小说、剧本、风格、结构、事实抽取、蓝图生成。
- Skill 冲突提示，例如两个 Skill 对章节节奏要求相反。
