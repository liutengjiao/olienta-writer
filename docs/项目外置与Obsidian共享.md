# 项目外置与 Obsidian 共享

日期：2026-05-14

Olienta 的软件目录只保存程序代码、构建文件和开发资料。作者的小说成果不能放在软件目录内部，也不能依赖软件私有数据库保存。

## 基本规则

- 小说项目是一个独立的本地作品文件夹。
- 推荐位置：`D:\windsurf\olienta-projects\作品名`，或作者自己选择的任意写作目录。
- 不允许把小说项目创建在 `D:\windsurf\olienta` 软件工程目录内部。
- 项目文件夹可以被 Obsidian、VS Code、普通文件管理器或同步盘直接打开。
- 正文、蓝图、草稿、故事构架、事实库、任务书、日志和导出结果都以 Markdown、TXT、JSON 或 JSONL 等普通文件保存。
- `.olienta/` 只保存项目级软件配置，例如 AI Provider、Skill 选择、Timeline Pro 状态；这些配置也仍然是本地 JSON 文件。

## 与软件目录的关系

建议结构：

```text
D:\windsurf\
  olienta\                 # 软件工程，只放 Olienta 程序
  olienta-projects\        # 作者作品库，可被 Obsidian 打开
    无痛剥离\
      project.yaml
      framework\
      blueprints\
      manuscript\
      facts\
      skills\
      timeline\
      tasks\
      logs\
      exports\
      .olienta\
```

这样做的目的：

- 软件升级、重装或重新构建时，不会影响作者作品。
- 作者可以在 Olienta 之外直接查看和编辑 `.md` 文件。
- 项目文件夹可以作为 Obsidian vault 使用，也可以同步、备份或迁移到其它电脑。
- Olienta 只是读取和增强这个作品文件夹，不把作品锁进软件内部。

## 当前实现

- 新建项目和打开项目时，后端会拒绝 Olienta 软件目录及其子目录。
- 文件选择器标题会提示作者选择软件目录外的小说项目文件夹。
- “无痛剥离”测试项目默认生成到 `D:\windsurf\olienta-projects\wutongboli-sample-project`。
- 前端小说设置页会把项目路径称为“外部作品文件夹”，避免误解为软件内部目录。

