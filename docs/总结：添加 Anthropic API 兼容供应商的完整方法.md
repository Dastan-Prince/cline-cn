# 总结：添加 Anthropic API 兼容供应商的完整方法

基于刚完成的 `dots-studio-athrapi` 供应商添加任务，以下是标准化的操作清单，供后续同类工作参考。

---

## 📋 核心文件清单（共 13 个文件）

### 🆕 新建文件（2个）

| 文件路径 | 用途 | 参考模板 |
|---------|------|---------|
| `apps/vscode/src/core/api/providers/{provider-id}.ts` | API 处理器，继承 `ApiHandler` | `xiaomi-athrapi.ts` / `xiaomi-tp-athrapi.ts` |
| `apps/vscode/webview-ui/src/components/settings/providers/{ProviderName}Provider.tsx` | 设置面板 UI 组件 | `XiaomiTpAthrapiProvider.tsx` |

### 🔧 修改文件（11个）

| # | 文件路径 | 修改内容 |
|---|---------|---------|
| 1 | `proto/cline/models.proto` | 添加 `ApiProvider` 枚举值 + `ModelsApiSecrets` 字段 + `ModelsApiConfiguration` 字段 |
| 2 | `apps/vscode/src/shared/api.ts` | 1. `ApiProvider` 联合类型添加<br>2. 模型类型/常量/模型定义对象 |
| 3 | `apps/vscode/src/shared/storage/state-keys.ts` | `SECRETS_KEYS` 数组添加 API key 字段名 |
| 4 | `apps/vscode/src/shared/storage/provider-keys.ts` | 1. 导入默认模型 ID<br>2. `ProviderToApiKeyMap` 添加映射<br>3. `ProviderDefaultModelMap` 添加默认模型 |
| 5 | `apps/vscode/src/core/api/index.ts` | 1. 导入新 Handler<br>2. `createHandlerForProvider` switch 添加 case |
| 6 | `apps/vscode/src/shared/providers/providers.json` | `list` 数组添加下拉选项 |
| 7 | `apps/vscode/src/shared/proto-conversions/models/api-configuration-conversion.ts` | 4 处双向转换：<br>- `convertApiProviderToProto`<br>- `convertProtoToApiProvider`<br>- `convertApiConfigurationToProto`<br>- `convertProtoToApiConfiguration` |
| 8 | `apps/vscode/webview-ui/src/components/settings/ApiOptions.tsx` | 1. 导入 Provider 组件<br>2. 条件渲染块 |
| 9 | `apps/vscode/webview-ui/src/components/settings/utils/providerUtils.ts` | 1. 导入模型<br>2. `getModelsForProvider` 添加 case<br>3. `normalizeApiConfiguration` 添加 case |
| 10 | `apps/vscode/webview-ui/src/utils/validate.ts` | 验证 switch 添加 case（检查 API key 非空） |
| 11 | **运行 `npm run protos`** | 在 `apps/vscode` 目录下执行，重新生成 TypeScript 类型 |

---

## 🎯 关键配置参数（按需调整）

```typescript
// 模型定义示例 (shared/api.ts)
export const providerModels = {
  "model-id": {
    maxTokens: 262144,            // 最大输出 tokens
    contextWindow: 524288,        // 上下文窗口
    supportsImages: true,         // 支持图像
    supportsPromptCache: true,    // 支持缓存
    supportsReasoning: true,      // 支持推理/思考
    inputPrice: 0.3,              // 输入价格 (per M tokens)
    outputPrice: 1,               // 输出价格
    cacheWritesPrice: 0.3,        // 缓存写入价格
    cacheReadsPrice: 0.025,       // 缓存命中价格
    description: "描述信息",
  },
} as const satisfies Record<string, ModelInfo>
```

---

## ⚠️ 易错点 & 踩坑记录

| 问题 | 解决方案 |
|------|---------|
| **proto 字段编号冲突** | `ModelsApiSecrets` 和 `ModelsApiConfiguration` 中的字段编号必须递增，不留空隙 |
| **SEARCH 匹配失败** | 大文件用精确的单行/少行 SEARCH 块，或用脚本插入 |
| **导入路径错误** | 统一用 `@shared/api` 别名，不要用相对路径 |
| **ContextWindowSwitcher 误用** | 只有有 `:1m` 后缀模型才需要，单模型供应商不需要 |
| **buildExternalBasicHeaders** | 仅 Xiaomi 等需要额外头部的供应商用，普通 Anthropic 兼容端不需要 |
| **enum 值重复** | 查看 `models.proto` 末尾确认下一个可用编号 |

---

## 🔄 标准化执行顺序（建议）

```bash
# 1. 修改 proto
# 2. 运行原型生成
cd apps/vscode && npm run protos

# 3. 核心类型定义 (shared/api.ts + state-keys.ts + provider-keys.ts)
# 4. 后端 Handler (core/api/providers/*.ts + core/api/index.ts)
# 5. Proto 转换层
# 6. 前端 UI (provider组件 + ApiOptions + providerUtils + validate)
# 7. providers.json 下拉列表
```

---

## 📂 参考文件速查表

| 类别 | 文件 | 说明 |
|------|------|------|
| **Anthropic 兼容参考** | `xiaomi-athrapi.ts` | 标准 Anthropic SDK 接入 |
| **Token Plan 参考** | `xiaomi-tp-athrapi.ts` | 无外部 headers 版本 |
| **UI 组件参考** | `XiaomiTpAthrapiProvider.tsx` | 含 ThinkingBudgetSlider |
| **Proto 转换参考** | `api-configuration-conversion.ts` | 搜索 `zhipu-athrapi` 找最近添加的 |
| **验证参考** | `validate.ts` | 搜索 `xiaomi-tp-athrapi` |

---

## ✅ 验证清单

- [ ] `npm run compile` 通过（或 `npm run check`）
- [ ] 设置面板能看到新供应商
- [ ] 输入 API key 后验证通过
- [ ] 能正常发起对话并获得响应
- [ ] Plan/Act 模式切换正常
- [ ] 思考预算滑块显示正常（如果模型支持）

---

此清单已覆盖完整流程，后续添加 Anthropic 兼容供应商可直接按此清单执行，避免遗漏。

---

# 附录：为已添加的 Anthropic 兼容供应商启用原生工具调用

## 背景

完成供应商添加后，Anthropic 兼容供应商（`xiaomi-athrapi`、`xiaomi-tp-athrapi`、`zhipu-athrapi`、`dots-studio-athrapi`、`anthropic-comp`）虽然使用 Anthropic SDK 原生支持 `tool_use` / `input_json_delta`，但 Cline 的原生工具调用路径对它们是关闭的。

**症状：** 模型输出 `<parameter name="path">value` 风格的标签，而非 Cline XML 解析器期望的 `<path>value` 元素风格，导致 `sayAndCreateMissingParamError`。

## 根因

`isNativeToolCallingConfig()` 有两道门：
1. `isNextGenModelProvider(providerInfo)` — provider 白名单
2. `isNextGenModelFamily(modelId)` — 模型族启发式判断

Anthropic 兼容供应商使用固定的 Anthropic Messages API 协议（`tool_use` / `input_json_delta`），不受 OpenAI 兼容供应商所需的模型族启发式约束。但这些供应商最初不在 `isNextGenModelProvider` 白名单中，导致原生工具调用被禁用，模型回退到 XML 工具解析。

## 解决方案

### 1. `src/utils/model-utils.ts`

- 新增 `ANTHROPIC_COMPATIBLE_PROVIDERS` 常量，列出 5 个 Anthropic 兼容 provider
- 新增 `isAnthropicCompatibleProvider()` 辅助函数
- 将 `...ANTHROPIC_COMPATIBLE_PROVIDERS` 加入 `isNextGenModelProvider()` 白名单
- 修改 `isNativeToolCallingConfig()`，对 Anthropic 兼容 provider 绕过模型族门控：

```typescript
export function isNativeToolCallingConfig(providerInfo, enableNativeToolCalls) {
  if (!enableNativeToolCalls) return false
  if (!isNextGenModelProvider(providerInfo)) return false
  // Anthropic-compatible endpoints use a fixed protocol dictated by the SDK/endpoint,
  // so provider capability is the meaningful signal -- we don't need the model-family
  // heuristic that OpenAI-compatible providers require.
  if (isAnthropicCompatibleProvider(providerInfo)) return true
  const modelId = providerInfo.model.id.toLowerCase()
  return isNextGenModelFamily(modelId)
}
```

### 2. `src/shared/prompts.ts`

- 添加 `NATIVE_ATHRAPI = "native-athrapi"` 到 `ModelFamily` 枚举

### 3. 变体系统（`variants/native-athrapi/`）

新建 `template.ts` 和 `config.ts`，以 `native-next-gen` 为模板。匹配器：

```typescript
.matcher((context) => {
  if (!context.enableNativeToolCalls) return false
  return isAnthropicCompatibleProvider(context.providerInfo)
})
```

### 4. `variants/index.ts`

在 `VARIANT_CONFIGS` 中注册 `NATIVE_ATHRAPI`，放在 `GLM` **之前**，确保 Anthropic 兼容 provider（如 `zhipu-athrapi` 运行 `glm-5.2`）在启用原生调用时匹配到 native-athrapi 变体，而非回退到基于 XML 的 GLM 变体。

### 5. `ClineToolSet.ts`

在 `getNativeConverter()` 的 switch 中，将 5 个 Anthropic 兼容 provider 添加到 `toolSpecInputSchema` 分支，确保工具以 Anthropic `input_schema` 格式传递。

## 涉及文件

| 文件 | 修改内容 |
|------|---------|
| `src/utils/model-utils.ts` | 新增 `ANTHROPIC_COMPATIBLE_PROVIDERS`、`isAnthropicCompatibleProvider`，更新 `isNextGenModelProvider` 和 `isNativeToolCallingConfig` |
| `src/shared/prompts.ts` | 添加 `NATIVE_ATHRAPI` 枚举值 |
| `variants/native-athrapi/template.ts` | 新建，BASE 模板 + 组件覆盖 |
| `variants/native-athrapi/config.ts` | 新建，变体配置 |
| `variants/index.ts` | 注册 native-athrapi 变体 |
| `ClineToolSet.ts` | `getNativeConverter` 添加 5 个 provider |
| `integration.test.ts` | `isNativeToolsFamily` 添加 `NATIVE_ATHRAPI`，添加测试用例 |
| `model-utils.test.ts` | 新增 `isAnthropicCompatibleProvider` 和 `isNativeToolCallingConfig` 测试 |

## ⚠️ 关键注意事项

1. **变体顺序很重要**：`NATIVE_ATHRAPI` 必须排在 `GLM` 之前，否则 `zhipu-athrapi` 上的 `glm-5.2` 会先匹配到 GLM 变体（XML 工具）
2. **Anthropic 兼容 vs OpenAI 兼容**：Anthropic 兼容 provider 使用固定协议，provider 能力即信号；OpenAI 兼容 provider 仍需模型族启发式判断
3. **`getNativeConverter` 分支**：Anthropic 兼容 provider 必须使用 `toolSpecInputSchema`（Anthropic 格式），不能使用默认的 `toolSpecFunctionDefinition`（OpenAI 格式）
4. **测试**：集成测试需生成快照验证工具以 Anthropic `input_schema` 格式呈现；model-utils 测试需覆盖 provider 白名单和原生调用门控逻辑
