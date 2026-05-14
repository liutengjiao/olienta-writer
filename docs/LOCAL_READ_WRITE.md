# 本地读写

Olienta 的第一版项目数据不使用数据库。项目文件夹就是作品数据模型。

## 已实现

- 正文保存到 `manuscript/chapters/{章节号}.md`。
- 本章作者输入保存到 `manuscript/author-input/{章节号}.md`。
- 章节蓝图保存到 `blueprints/chapters/{章节号}.md`。
- 蓝图覆盖前备份到 `blueprints/history/{章节号}/vXXX.md`。
- 框架文件保存到 `framework/*.md`。
- 事实库保存到 `facts/confirmed-facts.md`。
- 作者确认账本保存到 `facts/author-confirmation.md`。
- AI 配置、类型配置和收费模块设置保存到 `.olienta/*.json`。

## 原则

作者写下并保存的内容优先级最高。AI 可以生成候选内容，但只有作者采用或保存后才进入本地文件，并成为后续生成必须遵守的约束。
