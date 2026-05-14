# AI 整章生成接口 v0.1

本轮新增 AI 调用服务接口，先实现 OpenAI-compatible 协议。

## 前端行为

写作工作台右侧“生成整章”现在调用：

- `generateChapterDraft(input)`

输入：

- `rootPath`
- `chapterNumber`
- `authorInput`

返回：

- `manuscript`
- `providerName`
- `model`
- `usedRemoteModel`
- `contextSummary`

生成结果会写入当前章节正文，然后触发现有自动保存和事实抽取链路。

## 后端命令

新增 Tauri 命令：

- `generate_chapter_draft(input)`

当前支持：

- OpenAI-compatible
- OpenAI
- DeepSeek
- Ollama 本地 OpenAI-compatible 地址

其他 Provider 类型先保留配置，不真实调用。

## 上下文组装

生成前会读取：

- 当前章节蓝图
- 作者本章输入
- `facts/confirmed-facts.md`
- `framework/` 中第 1-6 号框架文件摘要

约束要求：

- 只输出正文 Markdown
- 不输出解释
- 不得违背作者输入
- 不得违背事实库
- 不得违背蓝图
- 不得提前释放后续高潮

## 降级策略

如果没有可用 Provider、没有 API Key、不在 Tauri 环境，或 Provider 类型暂不支持，则返回本地占位稿。

这样界面和写作流程可以继续开发，不被 API 配置阻塞。

## 新增依赖

后端新增：

```toml
reqwest = { version = "0.12", default-features = false, features = ["json", "rustls-tls"] }
```

## 当前限制

- 还没有流式输出。
- 还没有取消生成。
- 还没有生成后事实冲突检查。
- API Key 仍保存在本地 JSON，后续需要系统钥匙串或本机加密。
- 当前环境没有 `cargo`，尚未做 Rust 编译验证。

## 下一步

1. 增加生成后冲突检查。
2. 增加“候选稿”区域，不直接覆盖正文。
3. 增加 OpenAI-compatible 连通性测试按钮。
4. 替换正文 textarea 为 Markdown 所见即所得编辑器。
