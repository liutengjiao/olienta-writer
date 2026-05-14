# AI Provider 配置层 v0.2

Olienta 的 AI Provider 配置按项目本地保存。当前版本已经接入 OpenAI-compatible 调用路径，并用于框架草案、章节蓝图和整章正文生成；没有可用密钥或调用失败时，桌面端会退回本地占位草案，避免阻断写作。

## 存储位置

每个小说项目独立保存：

```text
.olienta/ai-providers.json
logs/model-calls/history.md
```

这符合 Olienta 的本地优先原则：不同小说可以使用不同模型组合。

`logs/model-calls/history.md` 只记录调用摘要、输入路径、输出路径、Provider 名称和结果说明，不记录 API Key。

`logs/system-events.jsonl` 会在保存 Provider 配置时写入 `providers_saved` 事件。事件只记录 Provider 数量、启用数量、名称、模型和用途，不记录 `apiKey` 字段。

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

## 当前限制

- API Key 目前保存为本地项目 JSON 明文。后续应支持系统钥匙串或本机加密。
- 真实调用目前优先覆盖 OpenAI-compatible 接口；其它供应商会先按兼容接口和本地占位处理，后续再逐个适配官方协议。
- 生成还不是流式显示。
- Provider 管理已支持新增、复制、删除；更细的排序和分组后续再补。

## 下一步

1. 增加 Provider 排序、按用途推荐和导入导出配置。
2. 将 API Key 改为系统钥匙串或本机加密保存。
3. 给各用途增加明确的模型选择策略。
4. 增加流式生成和可中止任务。

配置文件必须保持标准 JSON，建议写入为 UTF-8 无 BOM。
