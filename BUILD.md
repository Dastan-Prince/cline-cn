# Cline CN 4.x 打包指南

> 本指南已从 3.x 的 npm 流程迁移到 4.x 的 **bun** 流程。切勿在 `apps/vscode` 下运行
> `npm install`——bun 使用 isolated 布局的 `node_modules`（符号链接到全局 store），
> npm 会用实体目录覆盖它，导致 `@types/vscode` 等版本错位且难以恢复。

## 前提条件

- Node.js 22+
- bun（包管理 + 脚本运行器）
- bash（`scripts/proto-lint.sh` 需要；Git Bash / MSYS2 均可）

## 打包步骤

### 1. 安装依赖（仓库根目录）

```powershell
cd cline-cn
bun install --frozen-lockfile
```

如果之前在 `apps/vscode` 或 `apps/vscode/webview-ui` 下跑过 npm，先删除这两个
`node_modules` 目录再重新 `bun install`，否则新旧混装。

### 2. 构建 SDK（如改过 sdk/）

```powershell
bun -F @cline/llms build
# 或全量：
bun run build:sdk
```

### 3. 完整构建 + 打包 .vsix（一步到位）

```powershell
cd apps/vscode
bunx vsce package --no-dependencies --allow-package-secrets sendgrid slack
```

`vsce` 会自动执行 `vscode:prepublish`（即 `bun run package`）：
`check-types → build:webview（protos + tsc -b + vite build）→ lint（biome + proto-lint）→ esbuild --production`。

### 4. 输出文件

```
apps/vscode/claude-dev-4.1.16.vsix
```

## 关键说明

### --no-dependencies 是必须的

bun isolated 布局的 `node_modules` 链接会让 vsce 的依赖收集解析出越界路径
（`invalid relative path: extension/../../vitest.config.ts`）。运行时代码已被
esbuild 打进 `dist/`，无需随包分发 node_modules（上游 CI 同样使用该参数）。

### --allow-package-secrets sendgrid slack

vsce 的 secrets 扫描对仓库内某些测试字符串误报，按提示放行。

### proto 生成（protos）无需手工准备

`scripts/build-proto.mjs` 已能自动解析 Google well-known types
（第二个 `--proto_path` 指向 `node_modules/grpc-tools/bin`）。**不要**再按 3.x
流程把 `google/protobuf/*.proto` 复制进 `proto/`——`buf lint`（proto-lint）会因
Google 官方文件的 package 级选项不一致而报错。Windows 上若 `tmp-protoc/bin/protoc.exe`
存在会优先使用（grpc-tools 自带 protoc.exe 在部分 Windows 环境崩溃，详见下方踩坑记录）。

### webview 类型检查的"假绿"陷阱

`webview-ui/tsconfig.json` 是 project references 结构，`bunx tsc --noEmit`
（不带 `-b`）不会检查任何文件、永远返回 0。真正的类型检查是
`cd webview-ui && bunx tsc -b --noEmit`（`bun run package` 链路里的 vite build
会跑 `tsc -b`）。上游的 `check-types` script 同样存在此假绿，属上游固有行为。

## 踩坑记录（3.x 时代遗留，机制仍在）

### 问题 1: grpc-tools protoc.exe 崩溃 (Windows)

- **错误码**：3221225477 (STATUS_ACCESS_VIOLATION)
- **解决**：放置独立 protoc 到 `tmp-protoc/bin/protoc.exe`
  （来自 npm 包 `protoc` 的 `protoc-win64.exe`），`build-proto.mjs` 会优先检查该路径
- `tmp-protoc/` 已加入 `.vscodeignore`，不会进入 vsix

