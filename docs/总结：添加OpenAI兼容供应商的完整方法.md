# 总结：添加 OpenAI 兼容供应商的完整方法

基于 DeepSeek 供应商的完整实现链路，以下是标准化的操作清单，供后续添加 OpenAI 兼容供应商（即使用 OpenAI SDK `chat.completions` 协议的一级供应商）参考。

> 与 Anthropic 兼容供应商的区别：OpenAI 兼容供应商走 OpenAI function calling 协议（`tools` + `tool_calls`），原生工具转换器走 `toolSpecFunctionDefinition`（default 分支，**无需在 `ClineToolSet.getNativeConverter()` 中添加 case**）；而 Anthropic 兼容供应商需要显式添加到 `toolSpecInputSchema` 分支。

---

## 📋 核心文件清单（新建 2 个 + 修改 12 个 + 命令 1 个）

### 🆕 新建文件（2个）

| 文件路径 | 用途 | 参考模板 |
|---------|------|---------|
| `apps/vscode/src/core/api/providers/{provider-id}.ts` | API 处理器，用 **OpenAI SDK** 实现 `ApiHandler` | `deepseek.ts` |
| `apps/vscode/webview-ui/src/components/settings/providers/{ProviderName}Provider.tsx` | 设置面板 UI 组件 | `DeepSeekProvider.tsx` |

### 🔧 修改文件（12个源文件）

| # | 文件路径 | 修改内容 |
|---|---------|---------|
| 1 | `apps/vscode/proto/cline/models.proto` | **3 处**：① `ApiProvider` 枚举添加 `XXX = N;`（查看末尾确认下一个可用编号）<br>② `ModelsApiSecrets` 添加 `optional string xxx_api_key = N;`<br>③ `ModelsApiConfiguration` 添加 `optional string xxx_api_key = N;`（两处字段编号独立递增、不留空隙） |
| 2 | `apps/vscode/src/shared/api.ts` | ① `ApiProvider` 联合类型添加 ` \| "xxx"`<br>② 模型三件套：`XxxModelId` 类型 + `xxxDefaultModelId` 常量 + `xxxModels` 模型定义对象 |
| 3 | `apps/vscode/src/shared/storage/state-keys.ts` | `SECRETS_KEYS` 数组添加 API key 字段名（如 `"deepSeekApiKey"`）。**链式生效**：`SECRETS_KEYS` → `Secrets` 类型 → `ApiHandlerSettings` → `ApiConfiguration`，`buildApiHandler` 的 options 即可用该字段 |
| 4 | `apps/vscode/src/shared/storage/provider-keys.ts` | ① 导入默认模型 ID<br>② `ProviderToApiKeyMap` 添加 `xxx: "xxxApiKey"`<br>③ `ProviderDefaultModelMap` 添加 `xxx: xxxDefaultModelId`<br>（**不需要**加 `ProviderKeyMap`——使用通用 `apiModelId` 字段，见下方说明） |
| 5 | `apps/vscode/src/core/api/index.ts` | ① 导入新 Handler<br>② `buildApiHandler` switch 添加 case（传 `onRetryAttempt` / apiKey / `apiModelId`，按 mode 选择 plan/act 模型） |
| 6 | `apps/vscode/src/shared/proto-conversions/models/api-configuration-conversion.ts` | **4 处**双向转换：<br>① `convertApiProviderToProto`：`case "xxx"` → `ProtoApiProvider.XXX`<br>② `convertProtoToApiProvider`：`case ProtoApiProvider.XXX` → `"xxx"`<br>③ `convertApiConfigurationToProto`：`xxxApiKey: config.xxxApiKey`<br>④ `convertProtoToApiConfiguration`：`xxxApiKey: protoConfig.xxxApiKey` |
| 7 | `apps/vscode/src/shared/providers/providers.json` | `list` 数组添加 `{"value": "xxx", "label": "Xxx"}` 下拉选项 |
| 8 | `apps/vscode/webview-ui/src/components/settings/ApiOptions.tsx` | ① 导入 Provider 组件<br>② 条件渲染块 `{selectedProvider === "xxx" && <XxxProvider ... />}` |
| 9 | `apps/vscode/webview-ui/src/components/settings/utils/providerUtils.ts` | **3 处**：<br>① 导入模型对象和默认模型 ID<br>② `getModelsForProvider` 添加 `case "xxx": return xxxModels`<br>③ `normalizeApiConfiguration` 添加 `case "xxx": return getProviderData(xxxModels, xxxDefaultModelId)`<br>（若该函数内有 plan/act 模式切换 switch，`case "xxx"` 归入 "Providers that use apiProvider + apiModelId fields" 通用组即可） |
| 10 | `apps/vscode/webview-ui/src/utils/validate.ts` | 验证 switch 添加 `case "xxx"`（检查 API key 非空） |
| 11 | `apps/vscode/webview-ui/src/utils/getConfiguredProviders.ts` | 添加 `if (apiConfiguration.xxxApiKey) { configured.push("xxx") }`（控制欢迎页/欢迎流程中显示"已配置"状态） |
| 12 | `apps/vscode/src/core/storage/state-migrations.ts` | VSCode 旧存储 → 文件存储迁移代码中，**两处** secret 列表添加新 apiKey 字段（`await context.secrets.get("xxxApiKey")` 读取处 + 对象组装处）。不加则老用户升级后需重新输入 key |
| — | **运行 `npm run protos`** | 在 `apps/vscode` 目录下执行。生成 `src/shared/proto/`、`src/generated/` 下的类型；**`state.proto` 的 `Secrets` 消息也会由 `scripts/generate-state-proto.mjs` 从 `SECRETS_KEYS` 自动再生**，无需手动编辑 state.proto |

> ⚠️ 注意：`proto/cline/state.proto` 的 `Secrets` 消息（含 `deep_seek_api_key = 12` 等）是由 `scripts/generate-state-proto.mjs` 脚本从 `state-keys.ts` 的 `SECRETS_KEYS` 自动生成的——修改 SECRETS_KEYS 后运行 protos 即可，**不要手改 state.proto**。

---

## 🎯 Handler 实现要点（OpenAI 兼容特有）

参考 `deepseek.ts`（完整 143 行），核心结构：

```typescript
import OpenAI from "openai"
import type { ChatCompletionTool as OpenAITool } from "openai/resources/chat/completions"
import { fetch } from "@/shared/net"  // ⚠️ 代理支持的 fetch，必须传给 OpenAI 客户端
import { withRetry } from "../retry"
import { convertToOpenAiMessages } from "../transform/openai-format"
import { getOpenAIToolParams, ToolCallProcessor } from "../transform/tool-call-processor"

interface XxxHandlerOptions extends CommonApiHandlerOptions {
	xxxApiKey?: string
	apiModelId?: string   // 通用模型 ID 字段（非专有 ProviderKeyMap 键）
}

export class XxxHandler implements ApiHandler {
	private client: OpenAI | undefined

	private ensureClient(): OpenAI {
		if (!this.client) {
			if (!this.options.xxxApiKey) throw new Error("Xxx API key is required")
			this.client = new OpenAI({
				baseURL: "https://api.xxx.com/v1",
				apiKey: this.options.xxxApiKey,
				fetch,                       // ⚠️ 代理支持，必传
				// defaultHeaders: buildExternalBasicHeaders(),  // 仅需要额外头部的供应商用
			})
		}
		return this.client
	}

	@withRetry()
	async *createMessage(systemPrompt, messages, tools?: OpenAITool[]): ApiStream {
		const model = this.getModel()
		// 1. 消息转换：convertToOpenAiMessages()
		//    推理模型（R1 风格）还需 addReasoningContent(convertedMessages, messages)
		const convertedMessages = convertToOpenAiMessages(messages)
		const openAiMessages = [{ role: "system", content: systemPrompt }, ...convertedMessages]

		// 2. 流式请求
		const stream = await client.chat.completions.create({
			model: model.id,
			max_completion_tokens: model.info.maxTokens,
			messages: openAiMessages,
			stream: true,
			stream_options: { include_usage: true },  // ⚠️ usage 统计必需
			// 思考模型不要设 temperature，非思考模型可设 temperature: 0
			...getOpenAIToolParams(tools),            // 工具参数（自动处理 tools 为空的情况）
		})

		// 3. 流处理三件套
		const toolCallProcessor = new ToolCallProcessor()
		for await (const chunk of stream) {
			const delta = chunk.choices?.[0]?.delta
			// a) 推理内容：delta.reasoning_content → yield { type: "reasoning", ... }
			// b) 文本内容：delta.content → yield { type: "text", ... }
			// c) 工具调用：delta.tool_calls → yield* toolCallProcessor.processToolCallDeltas(...)
			// d) 用量统计：chunk.usage → 计算 input/output/cacheRead/cacheWrite/totalCost
		}
	}

	getModel(): { id: XxxModelId; info: ModelInfo } {
		// options.apiModelId 合法则用之，否则回退默认模型
	}
}
```

### Usage 统计的供应商差异

DeepSeek 特有字段（如果你的供应商也返回缓存统计，参考此模式）：

```typescript
// DeepSeek 的 usage 含扩展字段，且 prompt_tokens = 缓存命中 + 未命中之和
interface DeepSeekUsage extends OpenAI.CompletionUsage {
	prompt_cache_hit_tokens?: number   // 缓存命中 → cacheReadTokens
	prompt_cache_miss_tokens?: number  // 缓存未命中 → cacheWriteTokens
}
// 用 calculateApiCostOpenAI(info, input, output, cacheWrite, cacheRead) 计算成本
// 若供应商无缓存统计，直接用 usage.prompt_tokens / completion_tokens，缓存项传 0
```

---

## 🎯 关键配置参数（模型定义示例）

```typescript
// shared/api.ts
export type DeepSeekModelId = keyof typeof deepSeekModels
export const deepSeekDefaultModelId: DeepSeekModelId = "deepseek-chat"
export const deepSeekModels = {
	"deepseek-chat": {
		maxTokens: 8_000,          // 最大输出 tokens
		contextWindow: 128_000,    // 上下文窗口
		supportsImages: false,     // 是否支持图像
		supportsPromptCache: true, // 是否支持缓存（影响 usage 展示逻辑）
		supportsReasoning: true,   // 是否支持推理/思考（可选）
		inputPrice: 0,             // 输入价格 (per M tokens)
		outputPrice: 1.1,          // 输出价格
		cacheWritesPrice: 0.27,    // 缓存写入价格
		cacheReadsPrice: 0.07,     // 缓存命中价格
	},
} as const satisfies Record<string, ModelInfo>
```

---

## 📌 为什么不需要改 `ProviderKeyMap`

`provider-keys.ts` 中的 `ProviderKeyMap`（如 `deepseek` 不在其中）决定模型 ID 存储在哪个 state key：

- **在 Map 中**（如 openrouter → `OpenRouterModelId`）→ 存到 `planModeOpenRouterModelId` 等专有键
- **不在 Map 中**（deepseek/qwen/doubao 等大多数一级供应商）→ 存到通用 `apiModelId`（即 `planModeApiModelId` / `actModeApiModelId`）

DeepSeek 走通用路径，因此：
- `core/api/index.ts` 的 case 传 `apiModelId: mode === "plan" ? options.planModeApiModelId : options.actModeApiModelId`
- UI 组件的 `ModelSelector onChange` 调 `handleModeFieldChange({ plan: "planModeApiModelId", act: "actModeApiModelId" }, ...)`
- `providerUtils.ts` 的模式切换 switch 中归入 "Providers that use apiProvider + apiModelId fields" 组（default 组）

---

## ⚠️ 易错点 & 踩坑记录

| 问题 | 解决方案 |
|------|---------|
| **忘记传 `fetch` 给 OpenAI 客户端** | 企业代理/CLI/JetBrains 环境会直连失败。必须 `import { fetch } from "@/shared/net"` 并传入 |
| **忘记 `stream_options: { include_usage: true }`** | 拿不到 usage，token 统计和成本计算全为 0 |
| **proto 字段编号冲突** | `ModelsApiSecrets` 与 `ModelsApiConfiguration` 是两个独立消息，编号各自递增，查看各自末尾确认下一个可用编号，不留空隙 |
| **手改了 `state.proto` 的 Secrets 消息** | 该消息由 `scripts/generate-state-proto.mjs` 从 `SECRETS_KEYS` 生成，改 `state-keys.ts` 后跑 `npm run protos` 即可 |
| **忘记 `state-migrations.ts`** | 老用户从 VSCode 存储 Migration 时 key 不会带过来，需在两处 secret 列表都加上 |
| **忘记 `getConfiguredProviders.ts`** | 设置了 key 但欢迎流程仍提示未配置 |
| **忘记 proto 转换层的 4 处中任何一处** | 供应商会**静默重置为 Anthropic**，不报错（`convertApiProviderToProto` default 分支返回 ANTHROPIC） |
| **SEARCH 匹配失败** | 大文件用精确的单行/少行 SEARCH 块，或用脚本插入 |
| **导入路径错误** | 后端统一用 `@shared/api`、`@utils/xxx` 别名；webview 用 `@shared/api` 和 `@/context/...` |
| **思考模型误设 `temperature`** | DeepSeek 思考模型（reasoner/v4）传 temperature 会报错，条件展开 `...(isThinking ? {} : { temperature: 0 })` |
| **R1 格式消息缺失** | 推理模型（deepseek-reasoner 等）必须用 `addReasoningContent()` 包裹历史消息，否则多轮对话报错 |
| **enum 值重复** | 查看 `models.proto` 的 `ApiProvider` 枚举末尾确认下一个可用编号 |

---

## 🔄 标准化执行顺序（建议）

```bash
# 1. 修改 proto/cline/models.proto（枚举 + 2 个字段）
# 2. 修改 state-keys.ts 的 SECRETS_KEYS
# 3. 运行原型生成（同时再生 state.proto 的 Secrets 消息）
cd apps/vscode && npm run protos

# 4. 核心类型定义 (shared/api.ts + provider-keys.ts)
# 5. 后端 Handler (core/api/providers/xxx.ts + core/api/index.ts)
# 6. Proto 转换层 (api-configuration-conversion.ts 4 处)
# 7. state-migrations.ts（老用户 key 迁移）
# 8. 前端 UI (Provider 组件 + ApiOptions + providerUtils + validate + getConfiguredProviders)
# 9. providers.json 下拉列表
# 10. （推荐）启用原生工具调用，见下方附录
```

---

## 📂 参考文件速查表

| 类别 | 文件 | 说明 |
|------|------|------|
| **OpenAI 兼容 Handler 参考** | `apps/vscode/src/core/api/providers/deepseek.ts` | 标准 OpenAI SDK 接入（含缓存 usage、推理内容、工具调用） |
| **简化版参考** | `apps/vscode/src/core/api/providers/qwen.ts` | 同为 OpenAI 兼容，另有 `together.ts`、`sambanova.ts`（R1 格式处理） |
| **UI 组件参考** | `apps/vscode/webview-ui/src/components/settings/providers/DeepSeekProvider.tsx` | ApiKeyField + ModelSelector + ModelInfoView 标准三件套 |
| **Proto 转换参考** | `apps/vscode/src/shared/proto-conversions/models/api-configuration-conversion.ts` | 搜索 `deepseek` 找 4 处双向转换 |
| **验证参考** | `apps/vscode/webview-ui/src/utils/validate.ts` | 搜索 `case "deepseek"` |
| **原生工具调用参考** | `apps/vscode/src/utils/model-utils.ts` | `NATIVE_OPENAI_COMPATIBLE_PROVIDERS` 白名单 |

---

## ✅ 验证清单

- [ ] `npm run protos` 无报错
- [ ] `npm run compile` 通过（或 `npm run check`）
- [ ] 设置面板下拉能看到新供应商
- [ ] 输入 API key 后验证通过（validate.ts 生效）
- [ ] 选择模型后 ModelInfoView 显示正确的上下文/价格信息
- [ ] 能正常发起对话并获得响应
- [ ] Plan/Act 模式切换正常，模型选择各自保留
- [ ] token 用量与成本统计正常显示（验证 `stream_options` 和 usage 处理）
- [ ] （若启用原生工具调用）工具以 function calling 格式调用而非 XML 标签

---

# 附录：为 OpenAI 兼容供应商启用原生工具调用

## 背景

新供应商添加完成后，若不在原生工具调用白名单中，模型会回退到 Cline XML 工具解析（`<parameter name="path">value` 风格），对支持 function calling 的端点是浪费且更易出错。

OpenAI 兼容供应商与 Anthropic 兼容供应商的启用方式不同：

| 维度 | Anthropic 兼容 | OpenAI 兼容（本文） |
|------|---------------|-------------------|
| 白名单常量 | `ANTHROPIC_COMPATIBLE_PROVIDERS` | `NATIVE_OPENAI_COMPATIBLE_PROVIDERS` |
| 门控逻辑 | provider 在白名单即放行（固定协议） | provider 在白名单即放行（**前提：全目录可靠支持 function calling**） |
| 工具格式转换器 | `toolSpecInputSchema`（Anthropic `input_schema`） | `toolSpecFunctionDefinition`（OpenAI `function`，**default 分支，无需加 case**） |
| 模型族启发式 | 不需要 | 白名单供应商绕过；其他供应商仍走 `isNextGenModelFamily()` |
| 变体 | 专属 `native-athrapi` 变体 | 复用 `native-next-gen` 变体（matcher 已含 `isNativeOpenAiCompatibleProvider`） |

## 解决方案（以 deepseek 为例，共 2 个必改文件 + 2 个测试文件）

### 1. `apps/vscode/src/utils/model-utils.ts`

```typescript
// ① 添加到 OpenAI 兼容白名单（语义：全目录可靠支持 function calling 的固定目录供应商）
export const NATIVE_OPENAI_COMPATIBLE_PROVIDERS = ["xiaomi", "mimo-tp", "zai", "deepseek"] as const
//                                                              在此追加 "xxx" ⤴

export function isNativeOpenAiCompatibleProvider(providerInfo: ApiProviderInfo): boolean {
	return NATIVE_OPENAI_COMPATIBLE_PROVIDERS.includes(
		normalize(providerInfo.providerId) as (typeof NATIVE_OPENAI_COMPATIBLE_PROVIDERS)[number],
	)
}

// ② 白名单通过展开自动并入 isNextGenModelProvider()：
//    ...NATIVE_OPENAI_COMPATIBLE_PROVIDERS,
//    ...ANTHROPIC_COMPATIBLE_PROVIDERS,

// ③ isNativeToolCallingConfig() 中已有放行分支（无需再改）：
export function isNativeToolCallingConfig(providerInfo, enableNativeToolCalls) {
	if (!enableNativeToolCalls) return false
	if (!isNextGenModelProvider(providerInfo)) return false
	if (isAnthropicCompatibleProvider(providerInfo)) return true
	// OpenAI-compatible providers with fixed model catalogs (xiaomi, mimo-tp, zai,
	// deepseek) reliably support function calling across their entire catalog, so
	// provider membership is a sufficient capability signal here as well.
	if (isNativeOpenAiCompatibleProvider(providerInfo)) return true   // ⤴ 命中这里
	const modelId = providerInfo.model.id.toLowerCase()
	return isNextGenModelFamily(modelId)  // 非白名单供应商仍走模型族启发式
}
```

**（可选）添加模型族判断**——若该供应商的模型也可能经由其他供应商（如 openrouter）使用，且需要原生工具调用：

```typescript
export function isDeepSeekNativeModelFamily(id: string): boolean {
	const modelId = normalize(id)
	return modelId.includes("deepseek-chat") || modelId.includes("deepseek-reasoner")
}
// 并加入 isNextGenModelFamily() 的或运算链
```

### 2. `apps/vscode/src/core/prompts/system-prompt/variants/native-next-gen/config.ts`

**通常无需修改**——matcher 已包含：

```typescript
.matcher((context) => {
	if (!context.enableNativeToolCalls) return false
	const providerInfo = context.providerInfo
	if (!isNextGenModelProvider(providerInfo)) return false
	const modelId = providerInfo.model.id.toLowerCase()
	// Native-capable OpenAI-compatible providers with fixed model catalogs
	// (xiaomi, mimo-tp, zai, deepseek) bypass the model-family heuristic.
	return !isGPT5ModelFamily(modelId) && (isNextGenModelFamily(modelId) || isNativeOpenAiCompatibleProvider(providerInfo))
	//                                                                              ⤴ 白名单供应商命中这里
})
```

只有当新供应商需要**专属提示词变体**（不同于 native-next-gen）时才需要新建变体，参考 `variants/native-athrapi/`（Anthropic 版做法）。

### 3. `apps/vscode/src/core/prompts/system-prompt/registry/ClineToolSet.ts`

**无需修改**——`getNativeConverter()` 的 default 分支已返回 `toolSpecFunctionDefinition`（OpenAI function 格式）：

```typescript
public static getNativeConverter(providerId: string, modelId?: string) {
	switch (providerId) {
		case "minimax":
		case "anthropic":
		case "bedrock":
		case "xiaomi-athrapi": /* ... Anthropic 兼容供应商 ... */
			return toolSpecInputSchema        // Anthropic input_schema 格式
		case "gemini":
			return toolSpecFunctionDeclarations
		/* ... */
		default:
			// Default to OpenAI Compatible converter
			return toolSpecFunctionDefinition  // ⤴ OpenAI 兼容供应商走这里
	}
}
```

⚠️ **与 Anthropic 兼容相反**：OpenAI 兼容供应商**不要**添加到 `toolSpecInputSchema` 分支。

### 4. 测试（推荐补充）

| 文件 | 添加内容 |
|------|---------|
| `apps/vscode/src/utils/__tests__/model-utils.test.ts` | ① `isNativeOpenAiCompatibleProvider(providerInfo("xxx", "model-id")).should.equal(true)`<br>② 大小写不敏感测试（如 `providerInfo("DeepSeek", ...)`）<br>③ `isNativeToolCallingConfig(providerInfo("xxx", "model-id"), true).should.equal(true)` |
| `apps/vscode/src/core/prompts/system-prompt/__tests__/integration.test.ts` | 变体快照用例：`{ family: ModelFamily.NATIVE_NEXT_GEN, modelId: "model-id", providerId: "xxx" }` |

修改后重新生成快照：

```bash
UPDATE_SNAPSHOTS=true npm run test:unit
```

## ⚠️ 关键注意事项

1. **白名单的语义门槛**：加入 `NATIVE_OPENAI_COMPATIBLE_PROVIDERS` 意味着该供应商**全部模型**都启用原生工具调用。若目录中存在不支持 function calling 的模型，不要加白名单，而是走模型族启发式（`isNextGenModelFamily`）或为该模型族新增 `isXxxNativeModelFamily` 判断。
2. **转换器分支不要加错**：OpenAI 兼容走 default（`toolSpecFunctionDefinition`），加到 `toolSpecInputSchema` 分支会导致工具 schema 格式错误。
3. **大小写不敏感**：`isNativeOpenAiCompatibleProvider` 内部会 `normalize(providerId)`，测试建议覆盖大写形式（如 `"DeepSeek"`）。
4. **与 `getOpenAIToolParams` 配合**：Handler 侧用 `...getOpenAIToolParams(tools)` 展开，它会在 tools 为空时省略字段，避免部分端点对空 `tools` 数组报错。
5. **若供应商仅部分模型原生**：优先只把支持的模型族加入 `isNextGenModelFamily()`，不动 provider 白名单。

---

## 📎 DeepSeek 实际涉及的文件全览（检索核对清单）

以下是全项目检索 `deepseek`（不区分大小写）后，**与"添加一级 OpenAI 兼容供应商"直接相关**的完整落点，可用来核对是否遗漏：

| 层 | 文件 | 落点 |
|----|------|------|
| Proto 源 | `apps/vscode/proto/cline/models.proto` | `DEEPSEEK = 11;`（ApiProvider 枚举）；`deep_seek_api_key = 13`（ModelsApiSecrets）；`deep_seek_api_key = 31`（ModelsApiConfiguration） |
| Proto 源（自动生成） | `apps/vscode/proto/cline/state.proto` | `deep_seek_api_key = 12`（Secrets 消息，由 `scripts/generate-state-proto.mjs` 生成） |
| 共享类型 | `apps/vscode/src/shared/api.ts` | ApiProvider 联合 ` \| "deepseek"`；`DeepSeekModelId` / `deepSeekDefaultModelId` / `deepSeekModels` |
| 存储 | `apps/vscode/src/shared/storage/state-keys.ts` | `SECRETS_KEYS` 含 `"deepSeekApiKey"` |
| 存储 | `apps/vscode/src/shared/storage/provider-keys.ts` | import `deepSeekDefaultModelId`；`ProviderToApiKeyMap.deepseek`；`ProviderDefaultModelMap.deepseek` |
| Handler | `apps/vscode/src/core/api/providers/deepseek.ts` | 整个文件（新建模板） |
| 注册 | `apps/vscode/src/core/api/index.ts` | import + `case "deepseek"` |
| 转换层 | `apps/vscode/src/shared/proto-conversions/models/api-configuration-conversion.ts` | 4 处双向转换 |
| 下拉 | `apps/vscode/src/shared/providers/providers.json` | `{"value": "deepseek", "label": "DeepSeek"}` |
| 原生工具 | `apps/vscode/src/utils/model-utils.ts` | `NATIVE_OPENAI_COMPATIBLE_PROVIDERS`；`isNativeOpenAiCompatibleProvider`；`isDeepSeekNativeModelFamily` |
| 原生工具 | `apps/vscode/src/core/prompts/system-prompt/variants/native-next-gen/config.ts` | matcher（经白名单命中，无需专改） |
| 原生工具 | `apps/vscode/src/core/prompts/system-prompt/registry/ClineToolSet.ts` | default 分支（无需专改） |
| 迁移 | `apps/vscode/src/core/storage/state-migrations.ts` | secrets 读取/组装两处列表 |
| Webview | `apps/vscode/webview-ui/src/components/settings/providers/DeepSeekProvider.tsx` | 整个文件（新建模板） |
| Webview | `apps/vscode/webview-ui/src/components/settings/ApiOptions.tsx` | import + 条件渲染 |
| Webview | `apps/vscode/webview-ui/src/components/settings/utils/providerUtils.ts` | import + `getModelsForProvider` + `normalizeApiConfiguration` + 模式切换 case |
| Webview | `apps/vscode/webview-ui/src/utils/validate.ts` | `case "deepseek"` 校验 |
| Webview | `apps/vscode/webview-ui/src/utils/getConfiguredProviders.ts` | `deepSeekApiKey` 存在时 push |
| 测试 | `apps/vscode/src/utils/__tests__/model-utils.test.ts` | 白名单 / 门控 / 大小写测试 |
| 测试 | `apps/vscode/src/core/prompts/system-prompt/__tests__/integration.test.ts` | NATIVE_NEXT_GEN 变体快照用例 |
| 生成产物（勿手改） | `src/shared/proto/cline/{models,state}.ts`、`src/generated/{grpc-js,nice-grpc}/cline/*.ts` | `npm run protos` 生成 |

> 检索时还命中的其他 `deepseek` 出现位置（如 `openrouter-stream.ts`、`vercel-ai-gateway-stream.ts`、`bedrock.ts`、`groq.ts`、`context-window-utils.ts`、各第三方模型的 `deepseek-ai/*` 条目等）属于**其他供应商对 DeepSeek 模型的适配**，添加新供应商时无需处理。

---

此清单已覆盖完整流程，后续添加 OpenAI 兼容供应商可直接按此清单执行，避免遗漏。
