# AI Provider 配置说明

更新时间：2026-05-19

Olienta 的 AI Provider 配置属于软件级全局设置，不属于某一部小说项目。作者配置一次 API 后，所有小说项目都可以复用同一套 Provider；具体小说项目只保存正文、框架、资料、日志和写作状态。

## 存储位置

软件级保存：

```text
<Olienta 软件配置目录>/ai-providers.json
<Olienta 软件配置目录>/provider-secret.key
```

项目级只保存模型调用记录：

```text
logs/model-calls/history.md
```

`logs/model-calls/history.md` 只记录调用摘要、输入路径、输出路径、Provider 名称、模型名称、耗时、Token 和结果说明，不记录 API Key。

保存 Provider 时，后端会把非空 `apiKey` 转成 `apiKeyEncrypted` 写入软件配置目录下的 `ai-providers.json`，并在同一软件配置目录下保存 `provider-secret.key`。加载到编辑器时会临时还原成可编辑的 `apiKey`，方便作者修改和测试。

这套机制用于避免配置 JSON 直接暴露明文密钥；Windows 构建会优先使用 Windows DPAPI 保护密钥。

## 当前支持的 Provider 类型

新增 Provider 时使用下拉选择，不再让作者手写类型。

- `openai-compatible`：OpenAI 兼容接口，DeepSeek 等模型优先走这一类。
- `anthropic`：Anthropic Messages API。
- `custom`：自定义兼容类型。

## 多模型

同一个 Provider 支持多个模型。

示例：

```json
{
  "name": "deepseek",
  "kind": "openai-compatible",
  "baseUrl": "https://api.deepseek.com",
  "model": "deepseek-v4-pro",
  "models": [
    "deepseek-v4-pro",
    "deepseek-v4-flash"
  ]
}
```

规则：

- `models[0]` 是默认模型。
- `model` 会同步为第一个模型，兼容现有运行链路。
- 前端提供“增加模型”和“移除模型”。
- 保存时保留 `models` 字段，避免多模型配置丢失。
- 模型调用链路默认使用 `model`。

## 配置字段

每个 Provider 可以包含：

- `id`
- `name`
- `kind`
- `enabled`
- `baseUrl`
- `apiKey`
- `apiKeyEncrypted`
- `model`
- `models`
- `contextWindow`
- `temperature`
- `maxTokens`
- `timeoutSeconds`

其中 `apiKey` 只用于编辑器临时显示和保存转换，发布、导出和日志不应包含明文密钥。

## 前端页面

入口：`AI 设置`

当前作者化原则：

- 不显示原始 JSON 编辑器。
- 不显示导入 JSON、导出 JSON。
- 不显示“未覆盖”状态，避免作者误解。
- 接入一个可用 Provider 后，按全软件写作链路可用理解。
- 高级参数尽量下沉，只保留作者必须理解的字段。

当前功能：

- 新增 Provider。
- 启用/停用 Provider。
- 编辑 Provider 名称。
- 选择 Provider 类型。
- 编辑 Base URL。
- 编辑 API Key。
- 添加、删除、调整多个模型。
- 编辑上下文窗口、温度、最大输出、超时秒数。
- 上移/下移 Provider 顺序。
- 复制、删除 Provider。
- 保存软件级配置。
- 测试当前默认 Provider。
- 批量测试 Provider。

## 后端命令

- `load_ai_providers(rootPath)`：读取软件级 Provider；`rootPath` 只用于兼容旧项目配置迁移。
- `save_ai_providers(rootPath, providers)`：保存到软件级 Provider；`rootPath` 只用于当前项目事件记录。
- `test_ai_provider(rootPath)`：测试当前默认 Provider。
- `test_ai_providers(rootPath)`：批量测试 Provider。

测试规则：

- 如果 `rootPath` 为空或不存在，只测试软件级 Provider，不写项目日志。
- 如果 `rootPath` 指向有效项目，测试结果写入该项目 `logs/model-calls/history.md`。
- 这样 AI 设置页在未打开项目时也能测试，不再要求先创建或打开项目。

## 调用路径

当前真实调用优先覆盖：

- OpenAI-compatible `/chat/completions`
- Anthropic `/messages`

远程调用稳定性规则：

- 单次 Provider 调用最多自动尝试 3 次。
- 只有超时、响应读取失败、无有效内容、无效 JSON 等可重试错误会自动重试。
- 模型调用日志会写入 `retryAttempts`、`retryReason` 和 `attemptDurationsMs`，方便在日志页判断是模型失败、网络抖动还是上下文过长。

OpenAI-compatible 请求使用：

- `Authorization: Bearer <apiKey>`
- `model`
- `messages`
- `temperature`
- `max_tokens`

Anthropic 请求使用：

- `x-api-key: <apiKey>`
- `anthropic-version: 2023-06-01`
- `model`
- `system`
- `messages`
- `max_tokens`
- `temperature`

## 任务匹配

当前生成链路按软件级 Provider 顺序选择可用 Provider。

## 发布注意

- 不提交真实 `ai-providers.json`。
- 不提交 `provider-secret.key`。
- 不在 README、示例、截图中出现真实 API Key。
- 可以提交示例配置，但必须使用空 `apiKey` 或占位符。
- 模型调用日志可以提交测试样例，但不得包含真实密钥、私人小说内容和本机绝对路径。

## Current Security Boundary

As of 2026-05-23, Windows builds protect saved provider API keys with Windows DPAPI before writing them to the software-level configuration. The legacy `provider-secret.key` fallback remains for unsupported/non-Windows environments and should be treated as local obfuscation rather than a system keychain. Do not commit real `ai-providers.json`, `provider-secret.key`, screenshots containing keys, private projects, or local absolute paths.
- 支持更完整的失败诊断。
- 支持流式生成和可中断任务。
