# 项目管理第一版

本轮新增“项目管理”页面和桌面端 `create_project` 命令。

## 当前能力

- 输入项目名称、本地路径、语言、章节数、每章字数。
- 创建标准 Olienta 本地项目结构：
  - `framework/`
  - `blueprints/chapters/`
  - `manuscript/chapters/`
  - `facts/`
  - `skills/selected/`
  - `exports/`
  - `.olienta/`
- 自动生成基础框架文件、章节正文文件、章节蓝图、事实库、AI 配置、类型配置。
- 创建后直接打开项目。
- 当前界面内显示最近打开项目。

## 下一步可补

- 系统文件夹选择器。
- 最近项目持久化到 `.olienta/recent-projects.json` 或用户配置目录。
- 项目模板：严肃文学、网文长篇、剧本。
