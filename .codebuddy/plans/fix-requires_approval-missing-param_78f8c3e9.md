---
name: fix-requires_approval-missing-param
overview: 修复 dots-3-note-preview 等弱模型在 native 工具调用时漏传 execute_command 必填参数 requires_approval 导致的中文报错死循环问题。根因是 LLM 输出缺参数（主因）+ Cline 校验侧对 requires_approval 缺失直接致命报错、无容错（次因）。
todos:
  - id: confirm-default-safety
    content: 用 [subagent:code-explorer] 核对 requires_approval 默认 true 与 shouldAutoApprove/ask 流程的交互
    status: completed
  - id: fix-handler-fallback
    content: 修改 ExecuteCommandToolHandler，将 requires_approval 缺失改为默认需审批兜底，移除重试报错
    status: completed
    dependencies:
      - confirm-default-safety
  - id: add-unit-test
    content: 补充 ExecuteCommandToolHandler 单测覆盖参数缺失兜底分支
    status: completed
    dependencies:
      - fix-handler-fallback
  - id: run-checks
    content: 运行相关单测与 lint 验证无回归
    status: completed
    dependencies:
      - add-unit-test
---

## 用户需求概述
dots-3-note-preview 模型在调用 execute_command 工具时触发错误提示："Cline 尝试使用 execute_command 但缺少必需参数 'requires_approval' 的值。正在重试..."，并伴随"对能力较弱的模型可能具有挑战性"的提示。用户要求判断该问题属于 LLM 输出错误还是 Cline 解析/校验错误。

## 核心结论
两者皆有，主次明确：
- 主因是 LLM 输出错误：dots-3-note-preview 经 dots-studio-athrapi provider 走 NATIVE_ATHRAPI 原生工具调用路径，execute_command 的 JSON schema 将 requires_approval 声明为 required，弱模型在原生 tool_use 中漏传该参数。
- 次因是 Cline 校验侧无容错：ExecuteCommandToolHandler 对 requires_approval 缺失直接判为致命错误并重试，而其他布尔参数（如 timeout、run_in_background）缺失均有默认值兜底，处理不一致。

## 核心修复特性
- 在 ExecuteCommandToolHandler 中，当 requires_approval 缺失时不再触发致命报错与重试死循环，改为赋予安全默认值（默认需要用户审批，走正常询问流程，避免静默绕过审批）。
- 保持与现有 shouldAutoApprove / ask 流程一致，确保命令在弱模型漏传参数时仍能正常执行且不绕过安全审批。
- 修复仅影响参数缺失的容错分支，不改变正常传参时的行为，避免回归。

## 技术栈
- 项目：Cline VSCode 扩展（TypeScript）。
- 受影响模块：工具执行层（ToolExecutor）、原生工具调用解析、系统提示词工具 spec。
- 遵循现有分层：API Provider → Task → ToolExecutorCoordinator → 具体 Handler（ExecuteCommandToolHandler）。

## 实现方案
### 总体策略
诊断已确认：报错文案来自 `sayAndCreateMissingParamError`（`apps/vscode/src/core/task/index.ts:974-980`），触发点在 `ExecuteCommandToolHandler.ts:109-112`。修复方向是将"requires_approval 缺失即致命"改为"缺失时取安全默认值"，消除重试死循环，同时不绕过用户审批。

### 关键技术决策
1. **默认值选择（安全优先）**：requires_approval 语义为"模型是否要求用户审批"。缺失时默认取 `true`（需要审批），走正常 ask 流程，而非默认 `false`（会静默自动执行、绕过审批、带来安全隐患）。这与"最小权限/默认安全"原则一致，也符合现有 autoApprove 判定逻辑——即便 requires_approval 为 true，若用户开启了 yolo/自动审批，仍会被 shouldAutoApprove 放行，不会卡死。
2. **保留 consecutiveMistakeCount 语义**：仅在解析层面兜底，不增加 consecutiveMistakeCount；不调用 sayAndCreateMissingParamError，避免触发重试提示与用户可见错误。
3. **复用现有解析模式**：与同文件对 timeout、run_in_background 的处理保持一致（缺失即取默认），避免引入新范式。

### 数据流（修复后）
原生 tool_use（可能缺 requires_approval）→ parse/映射为 ToolUse.params → ExecuteCommandToolHandler.execute → requiresApprovalRaw 为空时默认 true → 正常进入 shouldAutoApprove / ask 分支 → 命令执行。

### 性能与可靠性
- 仅改变缺失分支的默认取值，热路径（正常传参）零开销。
- 不引入额外 I/O 或日志；沿用现有 Logger 级别，避免日志刷屏。
- 向后兼容：正常传参行为完全不变；仅宽松化缺失处理。

## 实现注意事项
- 需确认 `requiresApprovalPerLLM` 仅用于下游 ask 文案/判断；缺失默认 true 后，仍需与 `shouldAutoApprove`（基于用户设置）协同，不破坏现有审批链。
- 不要修改 execute_command.ts 的 spec（保持 required: true 以约束强模型），仅在 Handler 侧兜底，符合"解析侧容错"的最小改动原则。
- 若需更彻底方案，后续可考虑为原生工具调用增加"缺失必填参数时由客户端补默认"的通用机制，但本次按 YAGNI 仅修复 execute_command。

## 架构设计
改动局限于单 Handler，不涉及架构调整：
- 输入：ToolUse（block.params.requires_approval 可能为空）
- 处理：ExecuteCommandToolHandler.execute 内兜底默认
- 输出：正常 ToolResponse，进入既有审批/执行链

## 目录结构
```
apps/vscode/src/core/task/tools/handlers/
└── ExecuteCommandToolHandler.ts   # [MODIFY] 在 execute() 中，将 requires_approval 缺失逻辑由"致命报错+重试"改为"默认 true（需审批）兜底"，消除重试死循环；保持与 shouldAutoApprove/ask 流程一致。
apps/vscode/src/core/task/tools/handlers/__tests__/
└── ExecuteCommandToolHandler.test.ts  # [NEW/MODIFY] 补充单测：requires_approval 缺失时应默认视为需审批并正常执行（不调用 sayAndCreateMissingParamError，consecutiveMistakeCount 不增）。
```

## Agent Extensions
### SubAgent
- **code-explorer**
  - Purpose: 在实现前深入核对 ExecuteCommandToolHandler 下游 requiresApprovalPerLLM 与 shouldAutoApprove/ask 流程的交互，确认默认 true 不会引入卡死或绕过审批。
  - Expected outcome: 明确默认取值对审批链的影响，输出需修改的确切行与交互验证结论。
