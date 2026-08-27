---
name: dots-studio-openai-compatible-provider
overview: 新增一个 OpenAI 兼容的 "Dots Studio" 供应商（provider id `dots-studio`），复用现有 anthropic 版 `dots-studio-athrapi` 并存。参考 DeepSeek 的 openai-compatible 实现，base URL 为 https://note3-prev-api.askdiandian.com/v1，采用手输模型（allowsCustomIds）。
todos:
  - id: reg-sdk-provider
    content: 在 ids.ts 与 builtins.ts 新增 openai-compatible 的 dots-studio 供应商条目
    status: completed
  - id: reg-webview
    content: 在 providerSettingsRegistry.ts 与 validate.ts 注册 dots-studio 的名称、allowsCustomIds 与 key 校验
    status: completed
    dependencies:
      - reg-sdk-provider
  - id: reg-extension-meta
    content: 在 api.ts、provider-id.ts、state-keys.ts 补充 dots-studio 与 dotsStudioApiKey 注册
    status: completed
    dependencies:
      - reg-sdk-provider
  - id: reg-proto
    content: 用 [subagent:code-explorer] 核对并在 state.ts/models.ts/conversion.ts 新增 dotsStudioApiKey proto 字段与转换，必要时改 .proto 重生成
    status: completed
    dependencies:
      - reg-extension-meta
  - id: build-verify
    content: 运行 bun run build:sdk 与 check-types 验证无类型错误，确认两 provider 并存
    status: completed
    dependencies:
      - reg-proto
---

## 用户需求
采用 OpenAI 兼容 API 方式新增一个 "Dots Studio" 供应商接口，参考 DeepSeek 实现。

## 产品概述
在现有 Cline 供应商体系中新增 `dots-studio` 供应商。它走 OpenAI Chat Completions 协议（与 DeepSeek 同族），与原先的 `dots-studio-athrapi`（Anthropic 兼容）并存，互不影响。用户需自行填写 API Key 与模型 ID，接口地址固定为 `https://note3-prev-api.askdiandian.com/v1`。

## 核心特性
- 新增内置 provider id `dots-studio`，family 为 `openai-compatible`，默认协议 openai-chat。
- 固定 Base URL：`https://note3-prev-api.askdiandian.com/v1`（参考 DeepSeek 的 `/v1` 写法）。
- 支持 API Key 配置（secret 管理，同 `dotsStudioAthrapiKey` 模式，新字段 `dotsStudioApiKey`）。
- 模型列表走手输模式（`allowsCustomIds: true`），不内置静态模型目录，用户自行填写模型 id。
- 设置 UI 中显示为 "Dots Studio"，与原 anthropic 版 "Dots Studio (Anthropic)" 区分。
- 配置经 gRPC proto 层持久化（toProto/fromProto）后读取，与原 anthropic 版完全独立。
- 原 `dots-studio-athrapi`（Anthropic 兼容）保留不变。


## 技术栈
- 复用现有 monorepo 技术栈：Bun 1.3.13 任务运行器，TypeScript，SDK 包（`@cline/llms`）通过编译后 `dist/` 互相引用。
- 供应商定义仍集中在 `sdk/packages/llms/src/providers/builtins.ts` 的 `BuiltinSpecOverride` 数组（OpenAI 兼容族 `_SPEC_OVERRIDES`）。
- Webview 设置 UI 沿用 `providerSettingsRegistry.ts` 的 generic provider 注册（`FALLBACK_GENERIC_PROVIDER_NAMES` + `GENERIC_PROVIDER_PRESENTATION_OVERRIDES`）。
- 持久化链路：proto message（`state.ts`/`models.ts`）→ `api-configuration-conversion.ts` 双向转换 → `state-keys.ts` 的 `SecretKeys`。

## 实现方案
### 总体策略
完全参照 DeepSeek 的 openai-compatible 写法新增一个 `dots-studio` 条目，并补齐它在扩展侧和 webview 侧的全部注册点。原 `dots-studio-athrapi` 及 `buildDotsStudioAthrapiModels()` 保持不动。

### 关键技术决策
1. **family 选 `openai-compatible`**：与 DeepSeek 一致，协议默认推断为 `openai-chat`（Chat Completions），无需显式写 `protocol`，减少出错面。
2. **新增独立 id 而非改造**：用户确认两套并存，避免破坏已有 Anthropic 版用户配置。
3. **手输模型（`allowsCustomIds: true`）**：用户确认不内置静态列表，仿 `dots-studio-athrapi` 与 `anthropic-comp` 的 registry 写法，不设置 `modelsFactory` / `modelsProviderId`，由 gateway 走 OpenAI 兼容模型的默认兜底。
4. **apiKeyEnv 与 secret 字段命名对齐**：使用 `DOTS_STUDIO_API_KEY` 与 `dotsStudioApiKey`，与现有 `dotsStudioAthrapiKey` 模式保持一致，避免混淆。
5. **proto 字段新增**：在 `state.ts`/`models.ts` 中仿照 `dotsStudioAthrapiKey` 全套（interface 字段、默认值、writer/reader、fromPartial、toJSON），分配新 field number；优先尝试在 `.proto` 源补充后重新生成（`bun run protos`），若源中无对应字段（分叉注入）则直接编辑生成的 ts，保持三处（proto 生成 ts、conversion、state-keys）一致。

### 性能与可靠性
- 新增 provider 为纯配置注册，无运行时热路径开销；`build:sdk` 需重新构建使 dist 生效。
- proto field number 必须全局唯一，避免与其他字段冲突导致 gRPC 解析错位（重点核对 `state.ts` L1115 附近 `dotsStudioAthrapiKey` 用的是 442，新字段取下一个空闲号）。
- 改完需 `bun run build:sdk` 并重启进程；webview 侧通过 `check-types` 验证类型。

## 实现注意事项
- **不要触碰** `dots-studio-athrapi`、`buildDotsStudioAthrapiModels`、`xiaomi-athrapi` 等已有条目，控制爆炸半径。
- proto 三处（生成 ts 两文件 + conversion）字段名必须完全一致为 `dotsStudioApiKey`，否则配置读写静默丢失。
- `provider-id.ts` 的 `KNOWN_API_PROVIDERS` 因 `satisfies Record<ApiProvider, true>`，加入 `"dots-studio": true` 时会强制 `api.ts` 的 union 也已包含该 id（类型联动校验）。
- `validate.ts` 的 case 分支需与 `apiConfiguration.dotsStudioApiKey` 字段名一致。

## 架构设计
### 数据流
用户设置页填写 Key + 自定义模型 → `providerSettingsRegistry` 展示 → `GenericProviderSettings` 持久化到 SDK `ProviderSettingsManager` → `api-configuration-conversion.ts`（toProto/fromProto）→ proto `state.ts`/`models.ts` → `sdk createHandler` 依据 `builtins.ts` 的 `dots-studio` spec 路由到 OpenAI 兼容 client，请求 `https://note3-prev-api.askdiandian.com/v1/chat/completions`。

```mermaid
flowchart LR
  A[Settings UI] --> B[providerSettingsRegistry]
  B --> C[GenericProviderSettings]
  C --> D[api-configuration-conversion]
  D --> E[proto state/models.ts]
  E --> F[sdk createHandler]
  F --> G[builtins.ts dots-studio spec]
  G --> H[OpenAI Chat Completions v1]
```

## 目录结构与文件改动
```
sdk/packages/llms/src/providers/
├── ids.ts                    # [MODIFY] BUILT_IN_PROVIDER 新增 DOTS_STUDIO = "dots-studio"
└── builtins.ts              # [MODIFY] OPENAI_COMPATIBLE_SPEC_OVERRIDES 新增 openai-compatible 条目 dots-studio

apps/vscode/webview-ui/src/
├── components/settings/providers/providerSettingsRegistry.ts  # [MODIFY] 注册 dots-studio 的 allowsCustomIds 与名称 "Dots Studio"
└── utils/validate.ts                                      # [MODIFY] 新增 case "dots-studio" 校验 apiKey

apps/vscode/src/shared/
├── api.ts                   # [MODIFY] ApiProvider union 新增 "dots-studio"
├── storage/state-keys.ts    # [MODIFY] SecretKeys 数组新增 "dotsStudioApiKey"
├── proto/cline/state.ts     # [MODIFY] LlmConfig/相关 message 新增 dotsStudioApiKey 全套（含新 field number）
├── proto/cline/models.ts    # [MODIFY] 相关 message 新增 dotsStudioApiKey 全套
└── proto-conversions/models/api-configuration-conversion.ts  # [MODIFY] toProto/fromProto 各新增 dotsStudioApiKey 转换

apps/vscode/src/sdk/model-catalog/provider-id.ts  # [MODIFY] KNOWN_API_PROVIDERS 新增 "dots-studio": true
apps/vscode/proto/cline/state.proto               # [MODIFY/可选] 若存在源定义则补字段并 bun run protos 重新生成
apps/vscode/proto/cline/models.proto              # [MODIFY/可选] 同上
```

## 关键代码结构（新增 BuiltinSpec 条目参考）
```ts
// sdk/packages/llms/src/providers/builtins.ts — OPENAI_COMPATIBLE_SPEC_OVERRIDES
{
  id: "dots-studio",
  name: "Dots Studio",
  description: "Dots Studio models via OpenAI-compatible endpoint",
  family: "openai-compatible",
  capabilities: ["tools", "reasoning"],
  defaultModelId: "dots3-note",          // 手输模式下作为占位默认
  apiKeyEnv: ["DOTS_STUDIO_API_KEY"],
  defaults: { baseUrl: "https://note3-prev-api.askdiandian.com/v1" },
}
```


## Agent Extensions
### SubAgent
- **code-explorer**
  - Purpose: 在生成详细实现前，跨文件精确核对 proto 生成 ts（state.ts/models.ts）中 `dotsStudioAthrapiKey` 的完整写法、field number 与 `api-configuration-conversion.ts` 两处转换，确保新 `dotsStudioApiKey` 字段三处一致且不与现有 field number 冲突。
  - Expected outcome: 输出 `dotsStudioApiKey` 在所有 proto/conversion/state-keys 节点应插入的确切位置、空闲 field number 及完整代码模板，避免 gRPC 配置读写错位。
