# Cline VSCode 插件打包指南

## 环境要求

- **Node.js**: v22（项目推荐版本，见 `.nvmrc`）
- **npm**: v10+
- **操作系统**: Windows 10/11、macOS 或 Linux

> ⚠️ **注意**: 当前项目使用的 `grpc-tools` 包自带的 `protoc.exe` 在某些 Windows 环境下可能出现访问冲突崩溃（错误码 `3221225477`）。如果遇到此问题，请参考下方 [故障排除](#故障排除) 章节。

## 快速打包

```bash
# 1. 进入 VSCode 插件目录
cd apps/vscode

# 2. 安装主依赖
npm install

# 3. 安装 webview-ui 依赖
cd webview-ui && npm install && cd ..

# 4. 打包生成 .vsix 文件
npx vsce package --allow-package-secrets sendgrid
```

打包成功后，`.vsix` 文件将生成在 `apps/vscode/` 目录下，文件名格式为 `claude-dev-<版本号>.vsix`。

## 手动分步打包

如果需要对各步骤进行单独控制，可以按以下流程操作：

### Step 1: 安装依赖

```bash
cd apps/vscode
npm install
cd webview-ui && npm install && cd ..
```

### Step 2: 编译 Proto 文件

```bash
npm run protos
```

此命令会：
- 使用 `protoc` + `ts-proto` 插件生成 TypeScript 类型定义（`src/shared/proto/`）
- 生成 gRPC-JS 服务实现（`src/generated/grpc-js/`）
- 生成 nice-grpc 客户端（`src/generated/nice-grpc/`）
- 生成 ProtoBus 和 Host Bridge 相关代码
- 对生成的代码进行格式化

### Step 3: TypeScript 类型检查

```bash
npm run check-types
```

> 注意：`check-types` 内部已包含 `protos` 步骤。

### Step 4: 构建 Webview UI

```bash
npm run build:webview
```

此命令会编译并打包 React 前端应用到 `webview-ui/build/` 目录。

### Step 5: 代码检查（Lint）

```bash
npm run lint
```

### Step 6: 生产构建

```bash
node esbuild.mjs --production
```

### Step 7: 打包 VSIX

```bash
npx vsce package --allow-package-secrets sendgrid
```

## 完整的打包脚本（一键执行）

```bash
# 一键打包：安装依赖 → 编译 → 构建 → 打包
cd apps/vscode && npm install && cd webview-ui && npm install && cd .. && npx vsce package --allow-package-secrets sendgrid
```

> `vsce package` 会自动执行 `vscode:prepublish` 脚本，该脚本等同于 `npm run package`，包含了完整的 check-types → build:webview → lint → esbuild 生产构建流程。

## 安装插件

打包完成后，可通过以下方式安装 `.vsix` 文件：

1. **VSCode 界面安装**: 打开 VSCode → 扩展面板 → 右上角 `...` 菜单 → "从 VSIX 安装..." → 选择生成的 `.vsix` 文件
2. **命令行安装**:
   ```bash
   code --install-extension apps/vscode/claude-dev-3.86.0.vsix
   ```

## 故障排除

### grpc-tools protoc.exe 崩溃（Windows）

**现象**: 运行 `npm run protos` 或打包时出现以下错误：
```
Error: Command failed: ...\grpc-tools\bin\protoc.exe
status: 3221225477
```

**原因**: `grpc-tools` npm 包自带的 Windows `protoc.exe` 二进制文件与当前环境不兼容。

**解决方案**:

```bash
# 1. 全局安装独立的 protoc 包
npm install -g protoc

# 2. 用独立的 protoc 替换 grpc-tools 自带的版本
# Windows PowerShell:
Copy-Item "$env:APPDATA\npm\node_modules\protoc\bin\protoc-win64.exe" "apps/vscode/node_modules/grpc-tools/bin/protoc.exe" -Force

# 3. 验证替换成功
node -e "const {execFileSync}=require('child_process'),p=require('path'),e=p.join(require.resolve('grpc-tools'),'..','bin','protoc.exe');execFileSync(e,['--version'],{stdio:'inherit'})"
# 应输出: libprotoc 25.x

# 4. 重新运行 proto 编译
cd apps/vscode && npm run protos
```

### TypeScript 编译错误

确保 proto 文件已正确生成后再运行类型检查：

```bash
cd apps/vscode && npm run protos && npx tsc --noEmit
```

### Webview 构建失败

```bash
cd apps/vscode/webview-ui && npm install && npm run build
```

### Node.js 版本不兼容

项目推荐使用 Node.js v22（见 `.nvmrc`）。如果使用更高版本（如 v24），部分原生模块可能出现兼容性问题。

## 项目打包相关脚本说明

| 脚本命令 | 说明 |
|---------|------|
| `npm run protos` | 编译所有 Proto 文件并生成 TypeScript 代码 |
| `npm run check-types` | Proto 编译 + TypeScript 类型检查（含 webview-ui） |
| `npm run build:webview` | 构建 React Webview UI（Vite 打包） |
| `npm run lint` | Biome 代码检查 + Proto Lint |
| `npm run compile` | 开发环境编译（check-types + lint + esbuild） |
| `npm run package` | 生产环境完整打包（check-types + build:webview + lint + esbuild --production） |
| `npx vsce package` | 生成 .vsix 安装包（会自动调用 vscode:prepublish → npm run package） |
| `npm run dev` | 开发模式（自动编译 Proto + 监听文件变化） |
