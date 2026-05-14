# 本章写作链路

日期：2026-05-13

Olienta 的核心不是让 AI 直接写正文，而是让每一章经过清晰、可追溯、可读取的本地链路。

```text
章节蓝图 -> 写作任务书 -> 候选稿 -> 正文 -> 事实库与作者确认
```

## 页面显示

章节蓝图、草稿箱和正文页面顶部会显示本章链路：

- 章节蓝图：`blueprints/chapters/{章节号}.md`
- 写作任务书：`tasks/writing-briefs/{章节号}.md`
- 候选稿：`manuscript/candidates/{章节号}.md`
- 候选稿审查：`manuscript/candidates/reviews/{章节号}.md`
- 正文：`manuscript/chapters/{章节号}.md`
- 采用确认：`logs/confirmations/{章节号}.md`
- 事实库：`facts/confirmed-facts.md`
- 作者确认记录：`facts/author-confirmation.md`

## 关键规则

- 候选稿永远不是正文。
- 正文保存才是作者确认。
- 采用候选稿后，会额外写入本章采用确认摘要。
- 正文保存后会更新事实库和作者确认记录。
- AI 后续生成必须读取任务书、故事构架、事实库、作者确认记录和候选稿审查结果。
- 蓝图保存后可以默认覆盖后续蓝图，但每一章正式写作时仍由作者重新确认。

## 任务记录

以下动作会写入 `tasks/history.jsonl`：

- `blueprint_saved`：蓝图已保存，并触发后续蓝图覆盖策略。
- `writing_brief_composed`：任务书已装配。
- `candidate_draft_generated`：候选稿已生成。
- `candidate_reviewed`：候选稿已审查。
- `candidate_adopted`：候选稿已采用为正文。
- `candidate_confirmation_summary_written`：采用确认摘要已写入。
- `chapter_confirmation_chain_updated`：正文保存后，作者确认记录和事实库已更新。

作者可以在“任务 -> 历史任务”里回看本章写作链路的每一步。
