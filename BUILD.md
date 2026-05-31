# Cline CN 3.86.0 打包指南

## 前提条件

- Node.js 22+
- npm
- `@vscode/vsce`（全局或 npx 使用）

## 打包步骤

### 1. 进入 vscode 扩展目录

```bash
cd apps/vscode
```

### 2. 安装依赖

```bash
# 安装 vscode 扩展依赖
npm install

# 安装 webview-ui 依赖
cd webview-ui && npm install && cd ..
```

### 3. 修复 grpc-tools protoc 崩溃问题（Windows 必须）

Windows 上 `grpc-tools` 自带的 `protoc.exe` 会崩溃（exit code 3221225477，即 ACCESS_VIOLATION）。需要使用独立的 protoc 替代：

```bash
# 安装独立 protoc 包（--no-save 避免污染 package.json）
npm install --no-save protoc

# 创建 tmp-protoc 目录，build-proto.mjs 会优先检查此路径
mkdir tmp-protoc\bin
copy node_modules\protoc\bin\protoc-win64.exe tmp-protoc\bin\protoc.exe
```

### 4. 复制 Google Protobuf Well-Known Types

proto 文件引用了 `google/protobuf/timestamp.proto` 等，需要将它们复制到 proto 目录：

```bash
mkdir proto\google\protobuf
copy node_modules\protoc\include\google\protobuf\*.proto proto\google\protobuf\
```

> **原理**：`build-proto.mjs` 使用 `--proto_path=proto` 参数，protoc 会在该目录下查找所有 import 的 .proto 文件。

### 5. 生成 Proto 文件

```bash
node scripts/build-proto.mjs
```

成功输出应包含：
```
Compiling Protocol Buffers...
Processing N proto files from ...
Generated ProtoBus files at: ...
Generated Host Bridge client files at: ...
```

### 6. 构建 Webview

```bash
cd webview-ui && npm run build && cd ..
```

或直接：
```bash
npm run build:webview
```

### 7. 构建扩展后端

```bash
node esbuild.mjs --production
```

### 8. 打包 .vsix

```bash
npx vsce package --allow-package-secrets sendgrid
```

> **注意**：`vsce package` 会自动执行 `vscode:prepublish` 脚本（即 `npm run package`），该脚本会重新运行 proto 编译 + type check + webview 构建 + esbuild。
>
> 如果 proto 编译已经在步骤 5 成功完成，且不想重复构建，可以临时修改 `package.json` 中的 `vscode:prepublish`：
> ```json
> "vscode:prepublish": "node esbuild.mjs --production"
> ```
> 打包完成后记得恢复为：
> ```json
> "vscode:prepublish": "npm run package"
> ```

### 9. 输出文件

```
apps/vscode/claude-dev-3.86.0.vsix
```

## 踩坑记录

### 问题 1: grpc-tools protoc.exe 崩溃 (Windows)

- **错误码**：3221225477 (STATUS_ACCESS_VIOLATION)
- **原因**：`grpc-tools` npm 包自带的 Windows protoc.exe 二进制有兼容性问题
- **解决**：使用独立的 `protoc` npm 包中的 `protoc-win64.exe`，放到 `tmp-protoc/bin/protoc.exe`
- **原理**：`scripts/build-proto.mjs` 中有 Windows 兼容逻辑，会检查 `tmp-protoc/bin/protoc.exe` 是否存在，优先使用

### 问题 2: google/protobuf/timestamp.proto not found

- **错误**：`google/protobuf/timestamp.proto: File not found.`
- **原因**：protoc 的 `--proto_path` 只设置了 `proto/` 目录，但 Google well-known types 不在其中
- **解决**：将 `node_modules/protoc/include/google/protobuf/*.proto` 复制到 `proto/google/protobuf/`

### 问题 3: vsce package 重新触发 proto 编译导致崩溃

- **原因**：`vsce package` 执行 `vscode:prepublish` → `npm run package` → `npm run check-types` → `npm run protos`，再次调用 grpc-tools 的 protoc
- **解决**：要么保持 tmp-protoc 目录存在，要么临时跳过 prepublish 脚本

## 快速完整打包命令（从零开始）

```powershell
# 在项目根目录 cline-cn-3.86.0 下执行

# 1. 安装依赖
cd apps/vscode
npm install
cd webview-ui && npm install && cd ..

# 2. 准备 protoc 环境
npm install --no-save protoc
mkdir tmp-protoc\bin 2>$null
Copy-Item node_modules\protoc\bin\protoc-win64.exe tmp-protoc\bin\protoc.exe
mkdir proto\google\protobuf 2>$null
Copy-Item node_modules\protoc\include\google\protobuf\*.proto proto\google\protobuf\

# 3. 生成 proto + 构建 + 打包
node scripts/build-proto.mjs
npm run build:webview
node esbuild.mjs --production
npx vsce package --allow-package-secrets sendgrid

# 输出: claude-dev-3.86.0.vsix
