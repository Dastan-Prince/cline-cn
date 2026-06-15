# Cline-CN (Cline中国版) 🌏

## 项目概述
Cline CN 是一个 VSCode AI 编程助手扩展，基于 Cline 项目进行本地化和优化，支持多种 AI 模型提供商。

## 最近的开发历史 (基于 Git 日志)

在原版Cline基础上添加了我常用的最新国产大模型

### DeepSeek
- deepseek-v4-pro 
- deepseek-v4-flash 


### Xiaomi
| | |
| ----- | ----- |
|Xiaomi MiMo  | API Key接口（OpenAI兼容）|
MiMo Token Plan  |Token Plan接口（OpenAI兼容）|
Xiaomi Mimo AthrAPI  | API Key接口（Anthropic兼容）|
Mimo TP AthrAPI  |Token Plan接口（Anthropic兼容）|
|  |  |

- mimo-v2.5-pro
- mimo-v2.5
- mimo-v2-flash


### Zhipu
| | |
| ----- | ----- |
|Z AI | 增加coding plan专用入口地址（OpenAI接口）  
|Zhipu AthrAPI | GLM Coding Plan 的 Anthropic兼容接口
|  |  |

- glm-5.2
- glm-5.1



## 项目特性

### AI 模型支持
- **Anthropic**: Claude 系列模型
- **OpenRouter**: 多模型提供商
- **AWS Bedrock**: Amazon AI 服务
- **Google Gemini**: Google AI 模型
- **小米 Mimo**: 小米自研模型
- **GLM**: 智谱 AI 模型
- **其他**: Cerebras、Ollama、LM Studio 等

### 核心功能
- ✅ 自主编程助手
- ✅ 代码解释和改进
- ✅ Git 提交信息生成
- ✅ MCP 服务器集成
- ✅ 终端命令执行
- ✅ 浏览器自动化
- ✅ 多语言支持 (中英文)

### 技术架构
- **前端**: React + TypeScript + Vite
- **后端**: VSCode 扩展 + Node.js
- **通信**: Protobuf + gRPC
- **状态管理**: VSCode Global State
- **存储**: SQLite + 文件系统

## 项目结构

```
cline-cn/
├── assets/icons/          # 图标文件
├── src/                   # 扩展源代码
├── webview-ui/           # Webview 前端
├── cli/                  # 命令行工具
├── docs/                 # 文档
├── proto/                # Protobuf 定义
└── scripts/              # 构建脚本
```

## 最新更新

### 图标系统更新 (2026-05-13)
- 创建了现代化的机器人图标系统
- 采用紫色科技主题 (#6C5CE7, #A29BFE)
- 支持亮色/暗色主题自动切换
- 提供完整的文档说明

## 使用方式

### 安装
```bash
npm install
cd webview-ui && npm install
```

### 开发
```bash
npm run dev
```

### 构建
```bash
npm run package
npx vsce package
```

## 项目配置

### 主要配置文件
- `package.json` - 扩展配置
- `tsconfig.json` - TypeScript 配置
- `webview-ui/tsconfig.json` - 前端配置
- `biome.jsonc` - 代码格式化

### 环境要求
- Node.js 20.x
- VSCode 1.84.0+
- npm 或 yarn

## 项目状态

### ✅ 已完成
- AI 模型多提供商支持
- MCP 服务器集成
- 终端命令执行
- 浏览器自动化
- 多语言支持
- 现代化图标系统

### 🔄 进行中
- 持续优化用户体验
- 新模型提供商集成
- 性能优化

## 贡献指南

1. Fork 项目
2. 创建功能分支
3. 提交更改
4. 推送到分支
5. 创建 Pull Request

## 许可证
Apache-2.0 License

---

*基于 Cline 项目开发，专为中文用户优化*


