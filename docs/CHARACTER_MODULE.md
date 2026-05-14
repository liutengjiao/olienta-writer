# 角色模块

日期：2026-05-14

## 定位

角色模块是最左侧一级框架栏里的独立模块。它不同于“项目结构 -> 故事构架 -> 角色图谱”。

- `framework/03-characters.md` 是作者写的角色图谱原文。
- `characters/cards/*.md` 是从角色图谱派生出来的结构化角色卡。
- `characters/relations.md` 是关系图谱。
- `characters/growth.md` 是成长线。

## 角色图谱抽取

点击角色模块里的“抽取角色卡”后，系统会读取：

```text
framework/03-characters.md
```

然后写入：

```text
characters/cards/INDEX.md
characters/cards/001-角色名.md
characters/cards/002-角色名.md
characters/relations.md
characters/growth.md
```

第一版使用本地规则抽取，不依赖 AI。它会识别二级或三级 Markdown 标题中的角色名，例如：

```markdown
## 一、杨志远——高压容器
### 王静（女，27岁）——栖息者
```

抽取出的角色卡仍然是普通 Markdown。作者可以继续修改每一个字。

## 进入写作任务书

装配章节写作任务书时，系统会读取：

```text
characters/cards/INDEX.md
characters/cards/*.md
characters/relations.md
characters/growth.md
```

并写入任务书的“角色模块资料”部分。候选稿生成会直接使用这部分上下文。

## 候选稿审查

候选稿审查会读取角色模块资料。如果候选稿提到某个角色，却没有明显承接角色卡里的定位、欲望、恐惧、关系或不可误写边界，审查报告会给出“角色提醒”。

如果候选稿含否定表达并触碰角色卡边界，审查报告会给出“角色风险”。

## 任务与日志

抽取完成后会写入：

- `logs/system-events.jsonl`：`character_cards_extracted`
- `tasks/history.jsonl`：`character_cards_extracted`

记录内容包括来源文件、角色卡数量、索引路径、关系图谱路径和成长线路径。

## 边界

- 抽取角色卡不会改写 `framework/03-characters.md`。
- 角色卡是派生文件，不替代原始角色图谱。
- 角色卡保存后可以被 AI 读取，但最终仍以作者保存的本地 Markdown 为准。
