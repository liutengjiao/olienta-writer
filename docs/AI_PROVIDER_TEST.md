# AI 连接测试

Olienta 第一版支持在「AI 配置」里对单个模型配置执行连接测试。

## 行为

- OpenAI-compatible、OpenAI、DeepSeek、Ollama 走 `/chat/completions` 测试。
- 非 Ollama 的远程模型必须先填写 API Key，否则不发起请求。
- Gemini、Claude、通义千问、智谱、Moonshot 的专用协议第一版先不直连；可以先用 OpenAI-compatible 网关方式配置。
- 测试结果会显示在当前供应商卡片内，同时进入底部任务面板。

## 原则

连接测试只验证模型是否能回应一个极短请求，不会读取小说正文、框架文件、事实库或章节蓝图。
