# AI Provider 配置层 v0.2

Olienta 的 AI Provider 配置按项目本地保存。当前版本已经接入 OpenAI-compatible 调用路径，并用于框架草案、章节蓝图和整章正文生成；没有可用密钥或调用失败时，桌面端会退回本地占位草案，避免阻断写作。

## 存储位置

每个小说项目独立保存：

```text
.olienta/ai-providers.json
.olienta/provider-secret.key
logs/model-calls/history.md
```

这符合 Olienta 的本地优先原则：不同小说可以使用不同模型组合。

`logs/model-calls/history.md` 只记录调用摘要、输入路径、输出路径、Provider 名称和结果说明，不记录 API Key。

`logs/system-events.jsonl` 会在保存 Provider 配置时写入 `providers_saved` 事件。事件只记录 Provider 数量、启用数量、名称、模型和用途，不记录 `apiKey` 字段。

保存 Provider 时，后端会把非空 `apiKey` 转成 `apiKeyEncrypted` 写入 `.olienta/ai-providers.json`，并在 `.olienta/provider-secret.key` 中保存本项目的本地解密材料。加载到编辑器时会临时还原成 `apiKey`，方便作者修改和测试。这个机制用于避免项目 JSON 直接暴露明文密钥；它不是系统钥匙串，拥有整个项目文件夹的人仍可能恢复密钥。

## 当前支持的供应商类型

- OpenAI-compatible
- OpenAI
- DeepSeek
- Gemini
- Claude
- 通义千问
- 智谱
- Moonshot
- Ollama 本地模型

## 配置字段

每个 Provider 包含：

- `id`
- `name`
- `kind`
- `enabled`
- `baseUrl`
- `apiKey`
- `model`
- `contextWindow`
- `temperature`
- `stream`
- `useCases`

## 用途映射

第一版用途：

- `framework`：框架整理
- `blueprint`：章节蓝图
- `chapter`：整章正文
- `style`：风格提炼
- `facts`：事实抽取
- `timeline`：时间线检查，Pro
- `translation`：中英文辅助

## 前端页面

导航：`AI 配置`

功能：

- 启用/禁用 Provider
- 编辑供应商类型
- 编辑 Base URL
- 编辑 API Key
- 编辑模型名
- 编辑上下文长度
- 编辑温度
- 设置是否流式输出
- 选择用途映射
- 上移/下移 Provider 顺序；同一用途优先使用排在前面的可用 Provider
- 查看各用途当前命中的 Provider
- 新增、复制、删除 Provider
- 导入/导出 Provider JSON 配置
- 保存到本地项目配置
- 测试当前 Provider 是否可连通

## 后端命令

Tauri 命令：

- `load_ai_providers(rootPath)`
- `save_ai_providers(rootPath, providers)`
- `test_ai_provider(provider)`

如果 `.olienta/ai-providers.json` 不存在，后端返回默认配置。

Provider 测试会写入 `logs/model-calls/history.md`，便于之后追查连接测试结果。

## 生成能力

当前已经接入：

- `generate_framework_draft(input)`：基于项目框架、事实库、作者输入和选中的框架文件生成 Markdown 草案。
- `generate_chapter_blueprint(input)`：生成当前章蓝图草案，作者保存后才触发后续蓝图覆盖重生成。
- `generate_chapter_draft(input)`：一次生成整章正文候选稿，作者采纳后才写入正文。

候选稿生成也会写入 `logs/model-calls/history.md`，记录本次使用的任务书路径和候选稿输出路径。

## Provider 匹配规则

生成链路按用途选择 Provider：

- `chapter`：整章候选稿生成。
- `blueprint`：章节蓝图草案。
- `framework`：故事框架草案。

选择规则：

1. 跳过 `enabled: false` 的 Provider。
2. 按 `.olienta/ai-providers.json` 中的数组顺序从上到下匹配。
3. 如果 Provider 的 `useCases` 包含当前用途，则命中。
4. 如果 Provider 没有配置 `useCases`，视为通用 Provider。
5. 没有命中时回退本地占位草案，不阻断写作流程。

前端 Provider 页面会显示每个用途当前命中的 Provider，方便作者调整排序和用途覆盖。

## 当前限制

- API Key 已不再直接明文写入 `.olienta/ai-providers.json`，但当前仍是项目内本地加密材料，不等同于系统钥匙串。后续仍应接入系统钥匙串或平台级安全存储。
- 真实调用目前优先覆盖 OpenAI-compatible 接口；其它供应商会先按兼容接口和本地占位处理，后续再逐个适配官方协议。
- 生成还不是流式显示。
- Provider 分组仍未独立建模，目前主要依靠用途映射和排序管理。

## 下一步

1. 将 API Key 从项目内本地加密升级为系统钥匙串或平台级安全存储。
2. 给各用途增加明确的模型选择策略。
3. 增加 Provider 分组和成本/速度标记。
4. 增加流式生成和可中止任务。

配置文件必须保持标准 JSON，建议写入为 UTF-8 无 BOM。
