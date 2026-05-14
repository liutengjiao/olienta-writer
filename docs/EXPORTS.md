# 作品导出第一版

本轮新增“导出”页面和桌面端导出命令。

## 支持格式

- Markdown：汇总所有章节为一个 `.md` 文件。
- TXT：从 Markdown 汇总稿转换为纯文本。
- Word：生成基础 `.docx` 文件，正文段落带首行缩进。

## 支持范围

- 全书：导出为 `exports/manuscript.md`、`exports/manuscript.txt`、`exports/manuscript.docx`。
- 当前章：导出为 `exports/chapter-章节号.md`、`exports/chapter-章节号.txt`、`exports/chapter-章节号.docx`。
- 选中章节：导出为 `exports/selected-chapters.md`、`exports/selected-chapters.txt`、`exports/selected-chapters.docx`。

正文页只保留“导出本章”的轻入口；全书导出和选中章节导出统一放在“工具与设置 -> 导出”页面，避免全局按钮到处常驻。

## 文件位置

导出文件写入当前项目目录：

`exports/`

这符合 Olienta 的本地化存储原则，不上传、不走网页端。

## 当前边界

- Word 导出是第一版基础 OpenXML，已能生成 `exports/manuscript.docx`。
- 第一版支持标题、普通段落、引用和基础列表；正文段落带首行缩进。
- 后续需要补正式模板、页眉页脚、章节样式、字数统计和更细的自动缩进规则。
- 导出不会修改原始章节文件。
- 导出基于当前本地章节 Markdown 文件。
- 当前章导出同样不会写回正文，只在 `exports/` 下生成副本。
- 选中章节导出按章节列表顺序汇总，不改变原章节文件。
