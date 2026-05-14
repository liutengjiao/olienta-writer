# 系统事件日志

日期：2026-05-13

## 文件位置

```text
logs/system-events.jsonl
```

这是本地 JSONL 文件，一行一个事件。作者可以直接打开文件查看，软件里的“日志 → 系统事件”会把它渲染成可读列表。

## 当前事件

- `chapter_saved`：正文保存。
- `candidate_adopted`：候选稿被作者采用为正文。
- `facts_rescanned`：事实库重扫。
- `blueprint_cascade`：章节蓝图级联覆盖。
- `export_created`：导出文件生成。
- `skill_imported`：Skill 文件导入。
- `skill_disabled_changed`：Skill 长期启用状态变更。
- `skill_temporary_changed`：Skill 临时启用状态变更。
- `providers_saved`：AI Provider 配置保存，日志只记录 Provider 摘要，不记录 API Key。

## 原则

- 日志只记录动作摘要和本地路径。
- 不记录 API Key。
- 不替代作者确认记录。
- 不参与正文内容生成，只用于追踪和审计。

## 后续

后续可以加入：

- 任务开始、取消、失败事件。
