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

## 待完成

1.【中】proto 层接线：models.proto 的 ProtoApiProvider 枚举加 6 个值 +
   anthropic_comp 的 plan/act model id/info 字段（改用空闲字段号——fork 原占
   137/238/242-243 已被上游 cline_pass 占用），然后 `npm run protos` 重新生成
2.【中】webview 接线：providerUtils.ts 加 label/description 映射、
   ApiOptions.tsx 渲染新 Provider 组件（组件文件已就位但未接入）、
   确认上游动态 provider 列表机制与自定义入口的兼容性
3.【低】shared/storage/provider-keys.ts 的 key 映射
   （fork 改动见 E:\workspace\Cline\wiring-diffs.txt）
4.【验证】安装依赖后构建：bun install（SDK）+ apps/vscode npm install →
   按 BUILD.md 打包 vsix → 回归测试中文界面/MiMo/GLM/AthrAPI 各入口
5.【清理】确认 SDK 层路由稳定后删除 apps/vscode/src/core/api/providers/ 下旧 handler

## 相关工具脚本（E:\workspace\Cline\）

- `fork2.patch` 完整 fork 差异；`fB3.patch` 人工迁移桶；`gone3.txt` 上游缺失路径清单
- `repair-nl.ps1` / `scan2.ps1` 字面量污染扫描与修复
- `wiring-diffs.txt` 五个关键文件的 fork 改动摘录（移植参考）