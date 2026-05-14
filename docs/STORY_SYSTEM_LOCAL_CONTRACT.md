# 本地 Story System 合同

日期：2026-05-14

Olienta 不照搬插件式 Story System，而是把它改造成桌面端、本地文件优先的“章节写作任务书”。每章生成候选稿前，系统会装配一份 Markdown 文件：

```text
tasks/writing-briefs/001.md
tasks/writing-briefs/002.md
```

这份任务书不是正文，也不是蓝图本身。它是 AI 写候选稿前必须读取的上下文合同。

## 内容来源

任务书组合以下本地文件：

- `blueprints/chapters/{章节号}.md`：当前章蓝图。
- `manuscript/author-input/{章节号}.md`：作者本章输入。
- `framework/*.md`：小说设置和故事构架。
- `characters/cards/*.md`：结构化角色卡。
- `characters/relations.md`：关系图谱。
- `characters/growth.md`：角色成长线。
- `facts/confirmed-facts.md`：已确认事实。
- `facts/*.md`：分类事实、禁止规则、未闭合伏笔。
- `facts/author-confirmation.md`：作者确认记录。
- `skills/selected/*.md`：当前启用 Skill。
- `.olienta/writing-methodology.json`：写作方法配置。
- `timeline/events.md`、`timeline/milestones.md`：只在 Timeline Pro 已解锁并开启冲突检查时进入任务书。

## 优先级

任务书固定写入以下规则：

1. 作者已保存正文、故事构架、事实库、角色卡和作者确认记录最高优先。
2. 当前章节蓝图和本章作者输入必须被尊重。
3. AI 只能生成候选稿，不得直接覆盖正文。
4. 不得提前释放后续高潮、终局真相或尚未铺垫的角色关键转折。
5. 如上下文冲突，必须提醒作者，不得自行改写已确认事实。

## 与蓝图、草稿、正文的关系

- 蓝图：规定本章应该发生什么。
- 任务书：把蓝图和全局上下文装配为 AI 写作合同。
- 草稿箱：AI 候选稿输出位置。
- 正文：作者采用、修改并保存后的最终真源。

## 时间轴边界

时间轴是 Pro 模块。基础版仍保留文件和入口，但不会把时间轴内容注入 AI 约束链。

当 `.olienta/timeline-settings.json` 中 `enabled` 和 `conflictCheck` 都为 `true` 时：

- 任务书会包含 `timeline/events.md` 和 `timeline/milestones.md`。
- 候选稿审查会检查是否提前触发未来里程碑。
- 风险会写入候选稿审查报告，不自动阻止作者采用。

## 当前界面入口

- 左侧框架栏 -> 项目结构 -> 章节蓝图：可装配当前章任务书。
- 左侧框架栏 -> 项目结构 -> 草稿箱：生成候选稿前可装配任务书。
- 左侧框架栏 -> 任务：可读取 `tasks/writing-briefs/` 下已经生成的任务书。
