# AI 候选稿确认流程 v0.2

本流程保证 AI 只能生成候选稿，不能绕过作者直接改正文。

## 基本流程

1. 作者在本章助手里填写本章想法。
2. 点击“生成候选稿”。
3. 系统装配 `tasks/writing-briefs/{章节号}.md`，读取本章蓝图、故事构架、事实库、作者输入和已选 Skill。
4. AI 输出只写入 `manuscript/candidates/{章节号}.md`。
5. 系统同时生成审查报告：`manuscript/candidates/reviews/{章节号}.md`。
6. 作者可以在候选稿区修改任意文字。
7. 作者保存手动修改后的候选稿时，系统重新审查，并写入 `candidate_reviewed` 任务记录。
8. 作者点击“采用为正文”后，候选稿才写入 `manuscript/chapters/{章节号}.md`。
9. 正文保存成功后，系统更新事实库和作者确认记录。
10. 系统写入 `logs/confirmations/{章节号}.md`，记录本章候选稿采用确认摘要。

## 采用确认摘要

`logs/confirmations/{章节号}.md` 会记录：

- 采用方式：替换正文或追加到正文。
- 候选稿路径。
- 正文路径。
- 事实库路径。
- 作者确认记录路径。
- 后续 AI 必须遵守的确认规则。

这份文件是“候选稿进入正文”的本地证据链。后续 AI 生成、改写、续写、蓝图重生成和事实校验，都必须尊重正文、事实库和作者确认记录。

## 任务记录

候选稿流程会写入以下任务记录：

- `writing_brief_composed`：写作任务书已装配。
- `candidate_draft_generated`：候选稿已生成。
- `candidate_reviewed`：候选稿已审查。
- `candidate_adopted`：候选稿已采用为正文。
- `candidate_confirmation_summary_written`：采用确认摘要已写入。
- `chapter_confirmation_chain_updated`：正文保存后，作者确认记录和事实库已更新。

## 原则

Olienta 的核心原则是作者确认最大。AI 输出永远只是候选内容，正式正文必须由作者采用或手写保存后才算确认。
