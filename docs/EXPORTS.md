# 作品导出第一版

本轮新增“导出”页面和桌面端导出命令。

## 支持格式

- Markdown：汇总所有章节为一个 `.md` 文件。
- TXT：从 Markdown 汇总稿转换为纯文本。
- Word：生成 `.docx` 文件，包含封面、目录、章节/字数统计、中文字体默认值、章节分页、页眉和页脚页码；正文段落带首行缩进。

## 支持范围

- 全书：导出为 `exports/manuscript.md`、`exports/manuscript.txt`、`exports/manuscript.docx`。
- 当前章：导出为 `exports/chapter-章节号.md`、`exports/chapter-章节号.txt`、`exports/chapter-章节号.docx`。
- 选中章节：导出为 `exports/selected-chapters.md`、`exports/selected-chapters.txt`、`exports/selected-chapters.docx`。

正文页只保留“导出本章”的轻入口；完整导出控制统一放在“工具与设置 -> 导出”页面。导出页提供全书、当前章、选中章节三组操作，每组都支持 Markdown、TXT 和 Word。

选中章节通过章节列表勾选后导出，未选择时导出按钮不可用。后端会按项目章节顺序汇总选中章节，即使界面勾选或调用参数的顺序不同，导出结果也不会打乱章节顺序。

## 文件位置

导出文件写入当前项目目录：

`exports/`

这符合 Olienta 的本地化存储原则，不上传、不走网页端。

## 当前边界

- Word 导出是第一版 OpenXML，已能生成 `exports/manuscript.docx`。
- 当前支持标题、普通段落、引用、分隔线、无序列表、编号列表和代码块；正文段落带首行缩进。
- Word 文件包含封面、目录、章节数、字数统计、默认中文字体、段落行距、一级标题居中、后续一级标题分页、页眉和页脚页码。
- 后续需要补可配置模板、目录页码域和更细的自动缩进规则。
- 导出不会修改原始章节文件。
- 导出基于当前本地章节 Markdown 文件。
- 当前章导出同样不会写回正文，只在 `exports/` 下生成副本。
- 选中章节导出按章节列表顺序汇总，不改变原章节文件。
- 当前章为空时会使用中文占位标题，避免导出文件出现英文占位文案。
