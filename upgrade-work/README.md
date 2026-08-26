# cline-cn 升级工作区（v3.89.2 → v4.1.16）

本目录存放升级到上游 v4.1.16 过程中的中间产物与说明。

## 当前状态（分支 `upgrade/v4.1.16`）

- 基线：上游 `v3.89.2`（fork 最后同步点，已通过 package.json 中 `@anthropic-ai/sdk@^0.50.4` 校验）
- 目标：上游 `v4.1.16`（2026-08-26 发布）
- 注意：本仓库与上游 **git 历史不相关**（快照导入），无法 merge，只能补丁重放
- fork 补丁集：512 个文件差异（相对 v3.89.2，排除 lockfile 与 prompt 快照）

### 冲突解决结果 ✅

- 全部 363 个冲突块已解决，仅 `proto/cline/models.proto` 有意延后：
  - fork 在字段号 137/238/242-243 上加了 `anthropic_comp_*` 字段，
    与上游同号段的 `cline_pass_*` 冲突 → 迁移时需改用空闲字段号
- 解决策略记录：
  - 90 个非核心文件：取上游侧（4.x 演进）
  - 6 个文件取 fork 侧：`PreferredLanguageSetting.tsx`、`RemoteConfigSection.tsx`、
    `updateTaskSettings.ts`、`hostbridge-grpc-handler.ts`、`builtins.ts`（含 moonshot/wandb/xiaomi 等）、
    `FeatureTip.tsx`
  - `.gitignore`：两侧合并
  - `catalog.generated.ts`：取上游（模型目录由生成器重建）
  - ⚠️ **10 个深度重构文件重置为上游版本**：上游 4.x 把 provider 层从
    `apps/vscode/src/core/api/` 整体迁往 SDK（如 api/index.ts 从 ~500 行减到 19 行）。
    fork 在这些文件的定制必须改为在 `sdk/packages/llms/src/providers/` 下重新实现。

## 下一步

1. 【核心】按 4.x 新架构在 SDK 层移植国产 provider：
   - 参考 `manual-port-bucket.patch` 中的 xiaomi / mimo-token-plan / xiaomi-athrapi /
     mimo-tp-athrapi / zhipu-athrapi / dots-studio-athrapi / anthropic-comp 七个 handler
   - 对照 `sdk/packages/llms/src/providers/builtins.ts` 的 provider 描述结构注册
     （该文件的 moonshot/wandb/xiaomi 等条目已取 fork 侧）
   - webview 设置界面：`manual-port-bucket.patch` 中的 *Provider.tsx 组件 +
     `providerUtils.ts` / `getConfiguredProviders.ts` 接线
   - proto：把 `models.proto` 的 anthropic_comp 字段用**空闲字段号**重新加入后重新生成
2. i18n 汉化：`webview-ui/src/i18n/` 与 `locales/zh-CN/common.json` 为纯新增文件，
   从 manual-port-bucket.patch 落盘即可；组件内硬编码文案需对照迁移
3. 构建验证：BUILD.md 流程（Windows protoc workaround 需按 4.x 脚本核对）
4. 回归测试：中文界面、DeepSeek/MiMo/GLM 连通性、native-athrapi 协议兼容

## 相关文件（仓库外 E:\workspace\Cline\）

- `fork2.patch` —— 完整 fork 差异补丁（26.4MB）
- `gone3.txt` —— 上游 4.x 已不存在的路径清单
- `fB3.patch` —— 未自动应用的人工迁移补丁（与仓内 manual-port-bucket.patch 相同）
