# 任务面板第一版

本轮把底部任务面板从占位变成真实的界面反馈流。

## 当前会记录的任务

- AI 整章候选稿生成。
- 保存章节蓝图并覆盖后续蓝图。
- 重新扫描事实库。
- 导出作品。
- 保存小说类型配置。
- 保存 AI 配置。
- 导入 Skill。

## 当前本地文件

```text
tasks/current.json
tasks/history.jsonl
tasks/writing-briefs/*.md
```

## 当前实现

- `任务 → 当前任务` 会读取 `tasks/current.json` 和 `tasks/writing-briefs/*.md`。
- `tasks/current.json` 现在保存最近一次工作流任务快照，包括任务类型、状态、来源、时间和核心文件路径。
- `任务 → 历史任务` 会读取 `tasks/history.jsonl`。
- 系统事件会同步写入 `tasks/history.jsonl`，因此蓝图覆盖、事实重扫、导出、候选稿采用、Skill 变更和 Provider 配置保存都会在历史任务中留下本地记录。
- AI 工作流也会直接写入 `tasks/history.jsonl`：
  - `writing_brief_composed`：章节写作任务书已装配。
  - `candidate_draft_generated`：候选稿已生成，记录输入任务书、输出候选稿、Provider 和降级原因。
  - `provider_tested`：Provider 连接测试完成或失败。
- 软件执行装配任务书、生成候选稿、导出、保存 Provider 和测试 Provider 后，会自动刷新任务历史。
- 当前任务和历史任务共用同一套中文摘要规则，作者可以直接看懂任务在做什么、用了哪些输入、产出了什么文件。
- 任务书仍然是 Markdown 文件，作者可以直接在项目文件夹里看到。

## 当前边界

- 当前任务队列还没有完整的后台任务调度器，只先落成本地文件和界面读取。
- 历史任务已经包含关键系统事件和部分 AI 工作流结果。后续会继续增加任务开始、任务完成、任务失败、耗时和更详细的输出文件。
- 任务记录不替代作者确认。正文、蓝图、故事构架和事实库仍由各自正式保存流程确认。
