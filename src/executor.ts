import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { GLOBAL_SETTINGS_PATH, readSettingsFile } from "./config";
import type { Hook, HookExecutionContext } from "./types";

// ============================================================================
// Hook 执行器
// ============================================================================

/**
 * 构建 Claude Code 风格的 JSON 输入
 */
export function buildHookInput(ctx: HookExecutionContext): object {
  const base: Record<string, unknown> = {
    session_id: ctx.sessionId,
    cwd: ctx.cwd,
    hook_event_name: ctx.hookEventName,
    transcript_path: ctx.transcriptPath,
  };

  if (ctx.hookEventName === "PreCompact") {
    return {
      ...base,
      trigger: ctx.trigger,
      custom_instructions: ctx.customInstructions ?? "",
    };
  }

  if (ctx.hookEventName === "PostCompact") {
    return {
      ...base,
      trigger: ctx.trigger,
      compact_summary: ctx.compactSummary,
    };
  }

  if (ctx.hookEventName === "UserPromptSubmit") {
    return {
      ...base,
      prompt: ctx.prompt,
    };
  }

  if (ctx.hookEventName === "Stop") {
    return {
      ...base,
      stop_hook_active: ctx.stopHookActive ?? false,
      last_assistant_message: ctx.lastAssistantMessage ?? "",
    };
  }

  if (
    ctx.hookEventName === "PreToolUse" ||
    ctx.hookEventName === "PostToolUse" ||
    ctx.hookEventName === "PostToolUseFailure"
  ) {
    const toolInput: Record<string, unknown> = {
      ...base,
      tool_name: ctx.toolName,
      tool_input: ctx.toolInput,
      tool_use_id: ctx.toolUseId,
    };

    if (ctx.hookEventName === "PostToolUse") {
      toolInput.tool_response = ctx.toolResponse;
    }

    if (ctx.hookEventName === "PostToolUseFailure") {
      toolInput.error = ctx.error;
      if (ctx.isInterrupt !== undefined) {
        toolInput.is_interrupt = ctx.isInterrupt;
      }
    }

    return toolInput;
  }

  if (ctx.hookEventName === "SessionEnd") {
    return {
      ...base,
      reason: ctx.reason,
      model: ctx.model,
    };
  }

  return {
    ...base,
    source: ctx.source,
    model: ctx.model,
  };
}

export async function executeHook(
  hook: Hook,
  input: object,
  cwd: string,
  timeoutMs: number = 60000,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const inputJson = JSON.stringify(input);
  return executeCommandHook(hook.command, inputJson, cwd, timeoutMs);
}

/**
 * Resolve the bash executable, mirroring Pi's own shell resolution
 * (utils/shell.js getShellConfig): settings shellPath first, then known
 * Git Bash locations, then PATH as a last resort.
 */
function resolveBash(): string {
  const settings = readSettingsFile(GLOBAL_SETTINGS_PATH);
  if (settings?.shellPath && existsSync(settings.shellPath)) {
    return settings.shellPath;
  }
  const candidates: Array<string | undefined> = [
    process.env.ProgramFiles
      ? `${process.env.ProgramFiles}/Git/bin/bash.exe`
      : undefined,
    process.env["ProgramFiles(x86)"]
      ? `${process.env["ProgramFiles(x86)"]}/Git/bin/bash.exe`
      : undefined,
    "C:/msys64/usr/bin/bash.exe",
  ];
  for (const candidate of candidates) {
    if (candidate && existsSync(candidate)) {
      return candidate;
    }
  }
  return "bash";
}

function executeCommandHook(
  command: string,
  inputJson: string,
  cwd: string,
  timeoutMs: number,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    const child = spawn(resolveBash(), ["-c", command], {
      cwd,
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let settled = false;

    const finish = (result: { stdout: string; stderr: string; exitCode: number }) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    child.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    child.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    child.stdin.write(inputJson);
    child.stdin.end();

    const timeout = setTimeout(() => {
      child.kill();
      finish({
        stdout,
        stderr: `${stderr}\n[pi-hooks] Hook timed out`.trim(),
        exitCode: 1,
      });
    }, timeoutMs);

    child.on("close", (code) => {
      clearTimeout(timeout);
      finish({
        stdout,
        stderr,
        exitCode: code ?? 1,
      });
    });

    child.on("error", (err) => {
      clearTimeout(timeout);
      finish({
        stdout,
        stderr: err.message,
        exitCode: 1,
      });
    });
  });
}
