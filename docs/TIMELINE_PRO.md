# Timeline Pro 设计说明

时间轴及里程碑是 Olienta 第一版的收费解锁模块。基础版仍然可以本地写作、查看普通 Markdown 文件、使用 AI 候选稿、章节蓝图、事实库、Skill 和导出；Pro 只负责长篇一致性里的时间顺序、里程碑、防提前爆点和冲突检查。

## 文件位置

新建或打开项目时，系统会补齐：

```text
timeline/
  README.md
  events.md
  milestones.md
.olienta/
  timeline-settings.json
```

`timeline/events.md` 记录事件顺序。`timeline/milestones.md` 记录重大节点，例如高潮、真相、伏笔回收、角色退出、关键关系变化。它们都是普通 Markdown，作者可以直接看到和备份。

## 收费边界

免费版：

- 可以看到时间轴入口。
- 可以看到本地时间轴文件路径和锁定说明。
- 不把 `timeline/events.md`、`timeline/milestones.md` 注入 AI 生成约束。
- 不做时间轴冲突检查。

Pro 解锁并开启冲突检查后：

- 写作任务书会读取 `timeline/events.md` 和 `timeline/milestones.md`。
- 候选稿审查会检查是否提前触发未来章节里程碑。
- 章节蓝图和正文生成链路会把时间线视为高级约束。
- 后续可继续扩展可视化时间轴、伏笔回收轴、角色进出场轴。

## 设置文件

```json
{
  "enabled": false,
  "conflictCheck": false,
  "storage": "local-folder"
}
```

- `enabled`：是否解锁 Timeline Pro。
- `conflictCheck`：是否把时间轴参与 AI 生成和候选稿审查。
- `storage`：固定为本地文件夹，不引入远程数据库。

只有 `enabled = true` 且 `conflictCheck = true` 时，时间轴内容才会进入 AI 约束链路。

## 进入写作链路

装配章节写作任务书时，系统会写入：

```text
tasks/writing-briefs/{章节号}.md
```

其中会出现“时间轴及里程碑”段落：

- 未解锁或未开启冲突检查：只写入锁定说明，不暴露具体时间线内容给 AI。
- 已解锁并开启冲突检查：写入 `timeline/events.md` 和 `timeline/milestones.md` 的内容。

## 候选稿审查

候选稿保存到：

```text
manuscript/candidates/{章节号}.md
```

审查报告保存到：

```text
manuscript/candidates/reviews/{章节号}.md
```

当 Pro 冲突检查开启时，系统会检查候选稿是否出现这些风险：

- 第 1 章就揭开第 70 章才允许揭开的真相。
- 当前章节提前完成高潮、终局、伏笔回收。
- 候选稿出现“真相大白”“水落石出”等解决式表达，并触碰未来里程碑。

审查只提醒，不拦截。作者仍然可以强行采用，但采用并保存正文后，该内容会进入作者确认链。

## 后续目标

- 可视化章节时间轴。
- 伏笔埋设与回收分布。
- 角色出场、退出、成长节点。
- 重大事件密度和高潮分布。
- 与章节蓝图重生成联动，默认覆盖后续章节蓝图时同步更新后续时间线建议。
