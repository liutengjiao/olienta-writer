# Olienta 本地项目模型

日期：2026-05-14

Olienta 的项目不是数据库工程，而是一组作者可以直接看到、复制、备份和版本管理的本地文件。所有正文、蓝图、框架、事实、Skill、任务书、日志都应优先落在普通文本或 Markdown 文件里。

小说项目必须是软件目录外的独立作品文件夹。Olienta 程序目录只放软件本身；作品文件夹可以被 Obsidian、VS Code 或文件管理器直接打开和编辑。

## 顶层结构

```text
项目根目录/
  project.json
  manuscript/
  blueprints/
  framework/
  facts/
  knowledge/
  characters/
  timeline/
  skills/
  tasks/
  logs/
  models/
  exports/
  .olienta/
  .olienta-events/
```

## 项目配置

```text
project.json
```

保存项目名、语言、总章数、每章目标字数、模板等基础信息。它是普通 JSON，不保存 API Key。

## 正文与草稿

```text
manuscript/
  chapters/
    001.md
    002.md
  candidates/
    001.md
    history/
    reviews/
  author-input/
    001.md
```

- `manuscript/chapters/`：正文。作者采用并保存后，这里就是最高真源。
- `manuscript/candidates/`：AI 候选稿。不是正文，作者确认前不能覆盖正文。
- `manuscript/candidates/history/`：候选稿历史版本。
- `manuscript/candidates/reviews/`：候选稿冲突审查报告。
- `manuscript/author-input/`：作者本章输入，可长可短，不强制格式。

## 章节蓝图

```text
blueprints/
  chapters/
    001.md
    002.md
  history/
```

蓝图和正文分开。重生成后续蓝图时，默认覆盖后续章节蓝图，但保留历史版本。作者每章正式写作时再确认。

## 小说设置与故事构架

```text
framework/
  01-setting.md
  02-premise.md
  03-characters.md
  04-plot-outline.md
  05-world.md
  06-style.md
```

- 小说设置：基础信息、目标受众、结构、视角、总章数、每章字数。
- 故事前提：这部小说为什么成立。
- 角色图谱：角色关系、欲望、弱点、成长与不可误写边界。
- 世界观：时代、地点、规则、职业体系、力量体系。
- 情节大纲：全书结构、阶段、关键转折。
- 文风配置：语言风格、禁忌、参考作品。

这些文件都可以作为简单 Markdown 呈现和编辑，不需要复杂表单先行。

## 事实库

```text
facts/
  confirmed-facts.md
  author-confirmation.md
  character-facts.md
  time-facts.md
  place-facts.md
  relationship-facts.md
  world-rules.md
  open-loops.md
  forbidden-rules.md
```

正文保存后，系统自动抽取事实进入事实库。事实可以手动编辑。后续 AI 生成必须尊重已确认事实。

## 知识库

```text
knowledge/
  README.md
  sources/
  notes/
```

知识库用于保存参考资料、作者笔记、外部素材摘要。第一版先以 Markdown 和文本文件为主，不引入数据库。

## 角色模块

```text
characters/
  README.md
  cards/
    INDEX.md
    001-角色名.md
  relations.md
  growth.md
```

角色模块可以从 `framework/03-characters.md` 抽取结构化角色卡。候选稿审查会读取角色卡、关系和成长线，避免 AI 写反角色。

## 时间轴及里程碑

```text
timeline/
  README.md
  events.md
  milestones.md
  history/
```

时间轴与里程碑是 Pro 功能，但文件仍然是本地可读 Markdown。

免费版：

- 可以看到入口和文件。
- 不把时间轴内容注入 AI 生成。
- 不做时间轴冲突检查。

Pro 且开启冲突检查：

- 写作任务书读取 `timeline/events.md` 和 `timeline/milestones.md`。
- 候选稿审查会提醒未来里程碑是否被提前触发。

## Skill、任务、日志与模型调用

```text
skills/
  imported/
  selected/
  README.md

tasks/
  writing-briefs/
    001.md
  current.json
  history.jsonl

logs/
  system-events.jsonl
  confirmations/
  model-calls/
    history.md

models/
  README.md
```

- `skills/selected/`：第一版只支持导入和选择 Skill 文件。
- `tasks/writing-briefs/`：章节写作任务书，是本地化 Story System 合同。
- `tasks/history.jsonl`：任务历史，供底部“任务”模块读取。
- `logs/system-events.jsonl`：系统事件流水。
- `logs/confirmations/`：候选稿采用为正文后的本章确认摘要。
- `logs/model-calls/history.md`：候选稿生成、Provider 测试等模型调用记录，不记录 API Key。
- `models/`：模型调用模块的说明和导出记录。

## 软件内部配置

```text
.olienta/
  ai-providers.json
  genre-profile.json
  writing-methodology.json
  timeline-settings.json
  disabled-skills.json
  temporary-skills.json
  tasks.json

.olienta-events/
  commits/
```

`.olienta/` 只保存软件配置和内部状态。AI Provider 的密钥配置放在这里，不写入日志和导出文件。

`.olienta-events/commits/` 保存正文保存等关键动作的轻量提交记录，用于后续版本回溯。

## 作者确认链

正文保存后，系统会：

1. 更新 `facts/author-confirmation.md`。
2. 自动抽取事实到 `facts/confirmed-facts.md` 和分类事实文件。
3. 记录系统事件。
4. 如来自候选稿采用，写入 `logs/confirmations/{章节号}.md`。

作者确认链的含义是：作者保存过的内容优先级高于任何 AI 生成。

## 章节写作任务书

每章任务书保存为：

```text
tasks/writing-briefs/{章节号}.md
```

它会读取：

- 当前章蓝图。
- 本章作者输入。
- 故事构架。
- 角色模块资料。
- 已确认事实。
- 作者确认记录。
- 未闭合伏笔。
- 已选择 Skill。
- 写作方法配置。
- Timeline Pro 开启后读取时间轴及里程碑。

任务书明确写入：

- AI 只能生成候选稿。
- 不得直接覆盖正文。
- 不得提前释放后续高潮、终局真相或尚未铺垫的关键转折。
- 如上下文冲突，必须提醒作者。

## 导入与导出

```text
exports/
```

导出支持 Markdown、TXT、DOCX。导出范围应在具体页面明确选择：全书、当前章、选中章节或当前文件。

导入应优先落到本地文件夹和 Markdown 文件，不把作者资料藏进不可见数据库。
