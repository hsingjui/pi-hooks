import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { getHookGroups } from "../config";
import { type HookModuleContext, safeHandler } from "../hook-context";
import type {
  HookExecutionContext,
  NotifyFn,
  SettingsFile,
  UserPromptSubmitResult,
} from "../types";
import {
  appendAdditionalContext,
  executeParsedHook,
  getStringField,
  hookIfMatches,
} from "./shared";

export async function triggerUserPromptSubmitHooks(
  context: HookExecutionContext,
  settings: SettingsFile | undefined,
  notify?: NotifyFn,
): Promise<UserPromptSubmitResult> {
  const groups = getHookGroups(settings, "UserPromptSubmit");
  const result: UserPromptSubmitResult = { blocked: false };

  for (const group of groups) {
    for (const hook of group.hooks ?? []) {
      if (hook.if && !hookIfMatches(context, hook.if)) continue;

      try {
        const { hookResult, plainStdout, jsonOutput, commonOutput } =
          await executeParsedHook(hook, context, "UserPromptSubmit");

        if (hookResult.exitCode === 0 && jsonOutput) {
          const additionalContext = getStringField(
            commonOutput?.hookSpecificOutput?.additionalContext,
            jsonOutput.additionalContext,
          );

          result.additionalContext = appendAdditionalContext(
            result.additionalContext,
            additionalContext,
          );

          if (commonOutput?.systemMessage) {
            notify?.(commonOutput.systemMessage, "warning");
          }

          if (
            jsonOutput.decision !== undefined &&
            jsonOutput.decision !== "block"
          ) {
            notify?.(
              `UserPromptSubmit 忽略无效 decision: ${String(jsonOutput.decision)}`,
              "warning",
            );
          }

          if (jsonOutput.decision === "block") {
            result.blocked = true;
            result.reason =
              getStringField(jsonOutput.reason) ?? "Blocked by hook";
            return result;
          }
        } else if (hookResult.exitCode === 0 && plainStdout) {
          notify?.(`UserPromptSubmit 输出 (非JSON): ${plainStdout}`, "info");
        }

        if (hookResult.exitCode !== 0) {
          notify?.(
            `UserPromptSubmit 失败 (exit ${hookResult.exitCode}): ${hookResult.stderr}`,
            "error",
          );
        }
      } catch (err) {
        notify?.(`UserPromptSubmit 执行错误: ${String(err)}`, "error");
      }
    }
  }

  return result;
}

export function registerPromptHooks(
  pi: ExtensionAPI,
  shared: HookModuleContext,
) {
  pi.on("input", safeHandler(async (event, ctx) => {
    shared.pendingUserPromptContext = undefined;
    shared.stopHookActive = false;

    const result = await triggerUserPromptSubmitHooks(
      {
        sessionId: shared.getSessionId(ctx),
        cwd: ctx.cwd,
        hookEventName: "UserPromptSubmit",
        transcriptPath: ctx.sessionManager.getSessionFile(),
        prompt: event.text,
      },
      shared.currentSettings,
      (msg, type) => shared.notify(ctx, msg, type),
    );

    if (result.blocked) {
      shared.notify(
        ctx,
        `UserPromptSubmit 阻止: ${result.reason ?? "Blocked by hook"}`,
        "warning",
      );
      return { action: "handled" } as const;
    }

    if (result.additionalContext) {
      shared.pendingUserPromptContext = result.additionalContext;
    }

    return { action: "continue" } as const;
  }));

  pi.on("before_agent_start", safeHandler(async (_event, _ctx) => {
    if (!shared.pendingUserPromptContext) {
      return;
    }

    const additionalContext = shared.pendingUserPromptContext;
    shared.pendingUserPromptContext = undefined;

    return {
      message: {
        customType: "pi-hooks",
        content: additionalContext,
        display: false,
        details: {
          hookEventName: "UserPromptSubmit",
        },
      },
    };
  }));
}
