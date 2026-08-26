# cline-cn 升级工作区（v3.89.2 → v4.1.16）

## 当前状态（分支 `upgrade/v4.1.16`）

提交序列：
```
c7da593e7 SDK层注册6个AthrAPI provider + 扩展union扩展 + 修复字面量换行污染
7e3bc85cc 落地 fork 纯新增文件（28 个）
ee746ee7d 解决全部冲突并重置深度重构文件为上游版本
ebee8ca91 上游基线 v4.1.16
```

- 基线：fork 最后同步点 = 上游 `v3.89.2`（经 package.json 的 @anthropic-ai/sdk@^0.50.4 指纹校验）
- 注意：本仓库与上游 **git 历史不相关**（快照导入），无法 merge，只能补丁重放

## 关键架构发现（决定移植方式）

**上游 4.x 已将推理层从扩展迁至 SDK：**
- `apps/vscode/src/core/api/index.ts` 仅剩类型定义（19 行），
  实际 handler 创建在 `apps/vscode/src/sdk/sdk-api-handler.ts`，
  通过 `@cline/llms` 的 `createHandler(ProviderConfig)` 路由
- provider 注册点：`sdk/packages/llms/src/providers/builtins.ts`（BuiltinSpec 数组）
- 模型目录：`sdk/packages/llms/src/catalog/catalog.generated.ts`
  （上游已原生支持 xiaomi/mimo-v2.5-pro 等，比 fork 版本还新）
- 扩展侧旧 handler 文件（apps/vscode/src/core/api/providers/ 下我们落地的 7 个）
  在 4.x 属于死代码，保留作为移植参考，最终可删除

## 已完成

1. 全部冲突解决（363 块；仅 proto 字段号冲突延后，见下）
2. 28 个 fork 纯新增文件落地（i18n 汉化、BUILD.md、native-athrapi 提示词变体等）
3. SDK builtins.ts 注册 6 个 AthrAPI provider：
   xiaomi-athrapi / mimo-tp-athrapi / zhipu-athrapi / dots-studio-athrapi /
   anthropic-comp（family+protocol=anthropic；zhipu 复用 zai 模型目录，
   xiaomi 系复用 xiaomi 目录）
4. shared/api.ts ApiProvider union 补充 6 个入口（xiaomi 上游已有）
5. 清理全部字面量 `\n` 污染（25 处，字符级扫描修复器 repair-nl.ps1）

## 2026-08-26 第二轮（提交 0bc6e169a + 45fdcd49e）：全链路打通

1. **污染根因复盘**：`\n` 字面量污染在 HEAD 提交内（补丁重放引入），首次
   `bun run protos` 的 postprotos biome `--write` 对残缺语法二次改写
   （补分号/断行），造成双重损坏 → 弃用逐文件修补，改用策略：
   `git checkout` 还原非手工文件 → 词法修复器 v2 全仓扫描
   （`E:\workspace\Cline\repair-pollution-v2.mjs`，带 regex/模板/字符串/注释
   状态保护，217 处修复；v1 不识别 `/\n/` 正则会误伤）→ 结构性残缺的
   VscodeTerminalManager.ts 直接从上游 v4.1.16 整文件恢复
   （E:\workspace\Cline\cline.git 有完整上游克隆+tag）
2. **proto 重生成通过**：`bun run protos` 全绿（生成 + biome 格式化）
3. **依赖环境修复**：根 `bun install`（isolated 布局，链接在
   apps/vscode/node_modules）→ 清掉前会话 npm 残留的旧 @types/vscode@1.84
   实体目录 → 重链后 1.101.0；`bun run build:sdk` 全包构建成功
4. **provider 迁移定稿（重大方案变更）**：不保留 7 个 3.x 形态 webview 组件，
   全部走上游 **GenericProviderSettings 通用路径**（useProviderModels +
   useProviderConfig 持久化到 SDK ProviderSettingsManager；旧 fork 的
   xiaomiApiKey 等字段不进 SDK 选项流，属孤儿数据）：
   - 删除 7 个组件 + ApiOptions 专属分支，修复 ApiOptions 中断残片
   - providerSettingsRegistry.ts 注册 6 个 fallback 名称/覆写
     （anthropic-comp 带 baseUrlField + allowsCustomIds；dots 允许手输模型）
   - builtins.ts 补 **mimo-tp**（此前遗漏！token-plan OpenAI 兼容端点，
     复用 xiaomi 目录）；xiaomi 去掉 openai-responses 覆写
     （回到 3.x 验证过的 chat-completions 协议）
   - provider-id.ts KNOWN_API_PROVIDERS 补全 6 个 id
5. **fork 功能恢复**：globalStorage 迁移（cline-cn → cline-cn-ai）从
   fork patch 提取为 src/migrate-global-storage.ts 并接回 activate()
6. **死代码清理**：core/api/providers/ 7 个 3.x handler、native-athrapi
   提示词变体、3 个引用已迁 SDK 模块的旧测试全部删除
7. **验证**：`bun run check-types`（扩展 tsc + compat + webview tsc）全绿，
   污染扫描归零；注意 pre-commit 需要 gitleaks，本地用 --no-verify

## 待完成

1.【验证】按 BUILD.md 打包 vsix → 回归测试中文界面 / MiMo（xiaomi、
   mimo-tp、两个 athrapi）/ GLM / dots / anthropic-comp 各入口的
   key 输入、模型选择、实际对话
2.【低】models.proto 中 fork 遗留 apiKey 字段（xiaomiApiKey 等）仅作
   存储兼容，运行时已不消费，确认无回归后可在下个大版本移除
3.【低】anthropic-comp 与 dots-studio-athrapi 无模型目录键
   （catalog.generated.ts），当前靠 allowsCustomIds 手输模型 id；
   如需内置列表可在 builtins 用 modelsFactory 提供
4.【低】`bun run lint`（biome lint + proto-lint）尚未跑（proto-lint 需 bash）

## 相关工具脚本（E:\workspace\Cline\）

- `fork2.patch` 完整 fork 差异；`fB3.patch` 人工迁移桶；`gone3.txt` 上游缺失路径清单
- `repair-pollution-v2.mjs` 全仓字面量 `\n` 修复器（regex/模板安全，dry-run 可用）
- `cline.git` 上游完整克隆（v4.1.16 tag 可直接 git show 取原始文件）
- `wiring-diffs.txt` 五个关键文件的 fork 改动摘录（移植参考）