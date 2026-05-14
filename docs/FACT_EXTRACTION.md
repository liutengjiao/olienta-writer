# 自动事实抽取 v0.1

本轮新增“正文保存后自动抽取事实”的第一版骨架。

## 行为

保存章节正文时：

1. 写入 `manuscript/chapters/{chapterNumber}.md`。
2. 从正文中抽取规则型事实。
3. 追加到 `facts/confirmed-facts.md`。
4. 同步写入分类事实文件：
   - `facts/character-facts.md`
   - `facts/time-facts.md`
   - `facts/location-facts.md`
   - `facts/relation-facts.md`
   - `facts/event-facts.md`
   - `facts/world-rules.md`
4. 去重。
5. 重新读取项目并返回给前端，事实库页面立即刷新。

## 当前抽取规则

第一版先不用 AI，采用可验证的确定性规则：

- 当前章节已保存确认，AI 不得违背该章正文具体字句。
- 如果正文出现主要人物名，记录人物在该章出现。
- 如果正文出现 2017-2024 年份，记录该章涉及年份。
- 如果正文出现医美、诊所、现金流、退股、全返、双眼皮、剥离、深圳、CBD 等关键词，记录该章涉及主题。

## 手动重扫

新增 Tauri 命令：

- `rescan_facts(rootPath)`

行为：

1. 备份旧事实库到 `facts/history/confirmed-facts-vXXX.md`。
2. 清空并重建 `facts/confirmed-facts.md`。
3. 同步重建分类事实文件。

## 人工编辑

事实库不是只读抽取结果。作者可以在知识库模块中直接编辑并保存以下约束文件：

- `facts/confirmed-facts.md`
- `facts/character-facts.md`
- `facts/time-facts.md`
- `facts/location-facts.md`
- `facts/relation-facts.md`
- `facts/event-facts.md`
- `facts/world-rules.md`
- `facts/open-loops.md`
- `facts/forbidden-rules.md`

这些文件保存后会进入后续章节写作任务书。正文、蓝图和故事构架仍然不能从通用 Markdown 预览页绕过保存流程。
3. 扫描所有章节正文。
4. 重新写入事实库。
5. 返回刷新后的项目。

## 后续升级

- 接 AI 事实抽取，区分角色、时间、地点、关系、世界观规则、禁止违背。
- 加事实来源定位：章节号、段落、原文片段。
- 加作者可编辑事实确认界面。
- 将事实库拆为 Markdown 可读文件 + SQLite 索引。
