# Markdown 所见即所得编辑器

本轮新增第一版正文编辑器，目标是满足两个要求：

- 作者默认看到排版后的正文，而不是裸 textarea。
- 底层仍保存为 Markdown，作者可以切换到源码模式直接改 `.md` 文本。

## 第一版能力

- 支持标题、正文、引用、无序列表的基础编辑。
- 支持 Markdown 源码模式。
- 支持粘贴纯文本，避免把外部格式污染进正文文件。
- 普通写作工作台和纯写作模式共用同一个编辑器。
- 支持编辑 / 预览切换。
- 支持快捷工具栏：H1、H2、加粗、引用、列表、行内代码、代码块、分隔线。
- 支持键盘快捷键：Ctrl/Cmd+B、Ctrl/Cmd+`、Ctrl/Cmd+Shift+X、Ctrl/Cmd+Alt+1/2、Ctrl/Cmd+Alt+Q、Ctrl/Cmd+Shift+7、Ctrl/Cmd+-、Tab。
- 支持粘贴清洗：HTML 标题、引用、列表、段落会尽量转成基础 Markdown，其它样式会剥离。
- 支持段落操作：插入空行段落、清理选区或全文多余空白。
- 通用 `MarkdownDocument` 已接入工具栏、快捷键、粘贴清洗、字数/段落/行数统计和结构化预览。
- 纯写作模式复用同一套快捷键和粘贴清洗逻辑，但隐藏工具栏，只保留正文输入、保存和统计。
- 结构化预览支持 H1/H2/H3、段落、引用、列表、代码块、行内代码、加粗和分隔线，不再只是原文 `<pre>` 预览。
- `dev-smoke` 已固定 `applyMarkdownAction`、`htmlToMarkdown`、`renderMarkdownPreview` 和 `markdownActionForKey`，避免后续退回裸 textarea。

## 第一版边界

这是无外部依赖的原型编辑器。下一步如果要达到正式产品质量，应替换或升级为成熟编辑内核，例如 ProseMirror / TipTap / Milkdown 这一类 Markdown 编辑器内核，并继续保持本地 `.md` 文件读写。
