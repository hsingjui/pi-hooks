// ============================================================================
// 类型定义
// ============================================================================

export type HookType = "command";

export type SessionStartMatcher = "startup" | "resume" | "compact";
export type SessionEndReason = "other";
export type CompactTrigger = "manual" | "auto";

export type Hook = {
  type: "command";
  command: string;
  if?: string;
  timeout?: number;
  async?: boolean;
};

export type HookGroup = {
  matcher?: string;
  hooks?: Hook[];
};

export type HooksConfig = {
  SessionStart?: HookGroup[];
  SessionEnd?: HookGroup[];
  PreCompact?: HookGroup[];
  PostCompact?: HookGroup[];
  PreToolUse?: HookGroup[];
  PostToolUse?: HookGroup[];
  PostToolUseFailure?: HookGroup[];
  UserPromptSubmit?: HookGroup[];
  Stop?: HookGroup[];
  // 支持小写别名
  session_start?: HookGroup[];
  session_end?: HookGroup[];
  pre_compact?: HookGroup[];
  post_compact?: HookGroup[];
  pre_tool_use?: HookGroup[];
  post_tool_use?: HookGroup[];
  post_tool_use_failure?: HookGroup[];
  user_prompt_submit?: HookGroup[];
  stop?: HookGroup[];
};

export type SettingsFile = {
  hooks?: HooksConfig;
  shellPath?: string;
};

export type HookEventName =
  | "SessionStart"
  | "SessionEnd"
  | "PreCompact"
  | "PostCompact"
  | "PreToolUse"
  | "PostToolUse"
  | "PostToolUseFailure"
  | "UserPromptSubmit"
  | "Stop";

export type HookMatcherValue<T extends HookEventName> =
  T extends "SessionStart" ? SessionStartMatcher
    : T extends "SessionEnd" ? SessionEndReason
      : T extends "PreCompact" | "PostCompact" ? CompactTrigger
        : string;

export interface HookExecutionContext {
  sessionId: string;
  cwd: string;
  hookEventName: HookEventName;
  source?: SessionStartMatcher;
  model?: string;
  reason?: SessionEndReason;
  // PreCompact/PostCompact fields
  trigger?: CompactTrigger;
  customInstructions?: string;
  compactSummary?: string;
  transcriptPath?: string;
  // UserPromptSubmit fields
  prompt?: string;
  // Stop fields
  stopHookActive?: boolean;
  lastAssistantMessage?: string;
  // PreToolUse/PostToolUse/PostToolUseFailure fields
  toolName?: string;
  toolInput?: Record<string, unknown>;
  toolUseId?: string;
  toolResponse?: Record<string, unknown>;
  error?: string;
  isInterrupt?: boolean;
}

// ============================================================================
// Hook 结果类型
// ============================================================================

export type NotifyFn = (
  message: string,
  type: "info" | "error" | "warning",
) => void;

export type HookRunResult = {
  additionalContext?: string;
};

export type UserPromptSubmitResult = {
  blocked: boolean;
  reason?: string;
  additionalContext?: string;
};

export type StopResult = {
  blocked: boolean;
  reason?: string;
  additionalContext?: string;
};

export type PreToolUseResult = {
  blocked: boolean;
  reason?: string;
  updatedInput?: Record<string, unknown>;
  additionalContext?: string;
  stopProcessing?: boolean;
  stopReason?: string;
};

export type ToolResultPatch = {
  content?: unknown;
  details?: unknown;
  isError?: boolean;
};

export type PostToolUseResult = ToolResultPatch & {
  additionalContext?: string;
  stopProcessing?: boolean;
  stopReason?: string;
};
