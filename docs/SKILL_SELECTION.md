# Skill 选择确认库

Olienta 的 Skill 模块现在分为两个确认库：长期选择库和临时选择库。

## 长期选择库

长期确认的 Skill 是项目默认写作方法。它会持续进入整章生成上下文，适合现实主义方法、长篇节奏规则、类型约束等长期有效规则。

## 临时选择库

临时确认的 Skill 用于当前阶段、某一章、某一次改写或临时策略。它不改变长期默认规则，但会和长期 Skill 一起进入 AI 生成上下文。

## 本地文件

- Skill 文件：`skills/selected/*.md`
- 长期取消记录：`.olienta/disabled-skills.json`
- 临时选择记录：`.olienta/temporary-skills.json`

长期库和临时库都支持多选。两者都只提供写作方法，不能覆盖作者确认的正文、事实库、蓝图和框架文件。

## 系统事件

Skill 导入、长期停用/启用、临时启用/取消都会写入 `logs/system-events.jsonl`。

这些事件只记录 Skill 名称和状态变化，用于追踪本章生成时可能受哪些写作方法影响；它不记录正文内容，也不能替代作者最终确认。

## 结构化分类和冲突提示

Skill 列表现在会为每个文件给出分类、作用范围和冲突标签。系统会优先读取 Markdown front matter，例如：

```markdown
---
category: pacing
scope: chapter
conflicts: [fast]
---
```

如果文件没有元数据，Olienta 会根据文件名和正文关键词推断分类。当前内置分类包括 `pacing`、`style`、`structure`、`facts`、`blueprint` 和 `general`。

当前内置冲突标签包括：

- `fast-pace` 与 `slow-burn`：提示节奏冲突。
- `strict-outline` 与 `free-rewrite`：提示改写边界冲突。
- `first-person` 与 `third-person`：提示叙事视角冲突。

停用的 Skill 不参与冲突分析；如果同一个 Skill 被标记为临时启用，它会重新进入本次冲突分析和任务书上下文。
