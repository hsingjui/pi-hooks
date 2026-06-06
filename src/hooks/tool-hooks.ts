import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { getHookGroups, matcherMatches } from "../config";
import { extractErrorFromContent } from "../helpers";
import { type HookModuleContext, safeHandler } from "../hook-context";
import type {
  HookExecutionContext,
  NotifyFn,
  PostToolUseResult,
  PreToolUseResult,
  SettingsFile,
} from "../types";
import {
  appendAdditionalContext,
  executeParsedHook,
  extractToolResultPatch,
  getStringField,
  hookIfMatches,
} from "./shared";

export async function triggerPreToolUseHooks(
  toolName: string,
  context: HookExecutionContext,
  settings: SettingsFile | undefined,
  notify?: NotifyFn,
): Promise<PreToolUseResult> {
  const groups = getHookGroups(settings, "PreToolUse");
  const result: PreToolUseResult = { blocked: false };

  for (const group of groups) {
    if (!matcherMatches(group.matcher, toolName)) continue;

    for (const hook of group.hooks ?? []) {
      if (hook.if && !hookIfMatches(context, hook.if)) continue;

      try {
        const { hookResult, plainStdout, jsonOutput, commonOutput } =
          await executeParsedHook(hook, context, "PreToolUse");

        if (hookResult.exitCode === 2) {
          result.blocked = true;
          result.reason = hookResult.stderr || "Blocked by hook";
          notify?.(`PreToolUse 阻止: ${result.reason}`, "warning");
          return result;
        }

        if (hookResult.exitCode === 0 && jsonOutput) {
          const hookSpecific = commonOutput?.hookSpecificOutput;

          if (commonOutput?.stopProcessing) {
            result.stopProcessing = true;
            result.stopReason = commonOutput.stopReason;
            return result;
          }

          const decision = (hookSpecific?.permissionDecision ??
            jsonOutput.permissionDecision) as
            | "allow"
            | "deny"
            | "ask"
            | undefined;

          if (decision === "deny") {
            result.blocked = true;
            result.reason = (hookSpecific?.permissionDecisionReason ??
              jsonOutput.permissionDecisionReason) as string | undefined;
            result.reason ??= "Blocked by hook";
            notify?.(`PreToolUse 拒绝: ${result.reason}`, "warning");
            return result;
          }

          if (
            (hookSpecific?.updatedInput ?? jsonOutput.updatedInput) &&
            typeof (hookSpecific?.updatedInput ?? jsonOutput.updatedInput) ===
              "object"
          ) {
            result.updatedInput = (hookSpecific?.updatedInput ??
              jsonOutput.updatedInput) as Record<string, unknown>;
          }

          const additionalContext = getStringField(
            hookSpecific?.additionalContext,
            jsonOutput.additionalContext,
          );
          result.additionalContext = appendAdditionalContext(
            result.additionalContext,
            additionalContext,
          );
        } else if (hookResult.exitCode === 0 && plainStdout) {
          notify?.(`PreToolUse 输出 (非JSON): ${plainStdout}`, "info");
        }

        if (hookResult.exitCode !== 0 && hookResult.exitCode !== 2) {
          notify?.(
            `PreToolUse 失败 (exit ${hookResult.exitCode}): ${hookResult.stderr}`,
            "error",
          );
        }
      } catch (err) {
        notify?.(`PreToolUse 执行错误: ${String(err)}`, "error");
      }
    }
  }

  return result;
}

export async function triggerPostToolUseHooks(
  toolName: string,
  context: HookExecutionContext,
  settings: SettingsFile | undefined,
  notify?: NotifyFn,
): Promise<PostToolUseResult> {
  const groups = getHookGroups(settings, "PostToolUse");
  const result: PostToolUseResult = {};

  for (const group of groups) {
    if (!matcherMatches(group.matcher, toolName)) continue;

    for (const hook of group.hooks ?? []) {
      if (hook.if && !hookIfMatches(context, hook.if)) continue;

      try {
        const { hookResult, plainStdout, jsonOutput, commonOutput } =
          await executeParsedHook(hook, context, "PostToolUse");

        if (hookResult.exitCode === 2) {
          notify?.(`PostToolUse 反馈: ${hookResult.stderr}`, "warning");
          continue;
        }

        if (hookResult.exitCode === 0 && jsonOutput) {
          const hookSpecific = commonOutput?.hookSpecificOutput;

          if (commonOutput?.stopProcessing) {
            result.stopProcessing = true;
            result.stopReason = commonOutput.stopReason;
          }

          const additionalContext = getStringField(
            hookSpecific?.additionalContext,
            jsonOutput.additionalContext,
            jsonOutput.decision === "block" ? jsonOutput.reason : undefined,
          );

          result.additionalContext = appendAdditionalContext(
            result.additionalContext,
            additionalContext,
          );

          const patch = extractToolResultPatch("PostToolUse", jsonOutput);
          if (patch.content !== undefined) result.content = patch.content;
          if (patch.details !== undefined) result.details = patch.details;
          if (patch.isError !== undefined) result.isError = patch.isError;
        } else if (hookResult.exitCode === 0 && plainStdout) {
          notify?.(`PostToolUse 输出: ${plainStdout}`, "info");
        }

        if (hookResult.exitCode !== 0 && hookResult.exitCode !== 2) {
          notify?.(
            `PostToolUse 失败 (exit ${hookResult.exitCode}): ${hookResult.stderr}`,
            "error",
          );
        }
      } catch (err) {
        notify?.(`PostToolUse 执行错误: ${String(err)}`, "error");
      }
    }
  }

  return result;
}

export async function triggerPostToolUseFailureHooks(
  toolName: string,
  context: HookExecutionContext,
  settings: SettingsFile | undefined,
  notify?: NotifyFn,
): Promise<PostToolUseResult> {
  const groups = getHookGroups(settings, "PostToolUseFailure");
  const result: PostToolUseResult = {};

  for (const group of groups) {
    if (!matcherMatches(group.matcher, toolName)) continue;

    for (const hook of group.hooks ?? []) {
      if (hook.if && !hookIfMatches(context, hook.if)) continue;

      try {
        const { hookResult, plainStdout, jsonOutput, commonOutput } =
          await executeParsedHook(hook, context, "PostToolUseFailure");

        if (hookResult.exitCode === 2) {
          notify?.(`PostToolUseFailure 反馈: ${hookResult.stderr}`, "warning");
          continue;
        }

        if (hookResult.exitCode === 0 && jsonOutput) {
          const hookSpecific = commonOutput?.hookSpecificOutput;

          if (commonOutput?.stopProcessing) {
            result.stopProcessing = true;
            result.stopReason = commonOutput.stopReason;
          }

          const additionalContext = getStringField(
            hookSpecific?.additionalContext,
            jsonOutput.additionalContext,
            jsonOutput.decision === "block" ? jsonOutput.reason : undefined,
          );

          result.additionalContext = appendAdditionalContext(
            result.additionalContext,
            additionalContext,
          );

          const patch = extractToolResultPatch(
            "PostToolUseFailure",
            jsonOutput,
          );
          if (patch.content !== undefined) result.content = patch.content;
          if (patch.details !== undefined) result.details = patch.details;
          if (patch.isError !== undefined) result.isError = patch.isError;
        } else if (hookResult.exitCode === 0 && plainStdout) {
          notify?.(`PostToolUseFailure 输出: ${plainStdout}`, "info");
        }

        if (hookResult.exitCode !== 0 && hookResult.exitCode !== 2) {
          notify?.(
            `PostToolUseFailure 失败 (exit ${hookResult.exitCode}): ${hookResult.stderr}`,
            "error",
          );
        }
      } catch (err) {
        notify?.(`PostToolUseFailure 执行错误: ${String(err)}`, "error");
      }
    }
  }

  return result;
}

export function registerToolHooks(pi: ExtensionAPI, shared: HookModuleContext) {
  pi.on("tool_call", safeHandler(async (event, ctx) => {
    const result = await triggerPreToolUseHooks(
      event.toolName,
      {
        sessionId: shared.getSessionId(ctx),
        cwd: ctx.cwd,
        hookEventName: "PreToolUse",
        transcriptPath: ctx.sessionManager.getSessionFile(),
        toolName: event.toolName,
        toolInput: event.input as Record<string, unknown>,
        toolUseId: event.toolCallId,
      },
      shared.currentSettings,
      (msg, type) => shared.notify(ctx, msg, type),
    );

    if (result.updatedInput) {
      Object.assign(event.input, result.updatedInput);
    }

    if (result.stopProcessing) {
      const stopReason = result.stopReason ?? "Stopped by hook";
      ctx.abort?.();
      return { block: true, reason: stopReason };
    }

    if (result.blocked) {
      return { block: true, reason: result.reason };
    }

    if (result.additionalContext) {
      shared.injectHiddenContext(result.additionalContext, {
        hookEventName: "PreToolUse",
        toolName: event.toolName,
        toolUseId: event.toolCallId,
      });
    }
  }));

  pi.on("tool_result", safeHandler(async (event, ctx): Promise<any> => {
    if (event.isError) {
      const result = await triggerPostToolUseFailureHooks(
        event.toolName,
        {
          sessionId: shared.getSessionId(ctx),
          cwd: ctx.cwd,
          hookEventName: "PostToolUseFailure",
          transcriptPath: ctx.sessionManager.getSessionFile(),
          toolName: event.toolName,
          toolInput: event.input as Record<string, unknown>,
          toolUseId: event.toolCallId,
          error: extractErrorFromContent(event.content),
          isInterrupt: false,
        },
        shared.currentSettings,
        (msg, type) => shared.notify(ctx, msg, type),
      );

      if (result.additionalContext) {
        shared.injectHiddenContext(result.additionalContext, {
          hookEventName: "PostToolUseFailure",
          toolName: event.toolName,
          toolUseId: event.toolCallId,
        });
      }

      if (result.stopProcessing) {
        ctx.abort?.();
      }

      if (
        result.content !== undefined ||
        result.details !== undefined ||
        result.isError !== undefined
      ) {
        return {
          content: result.content ?? event.content,
          details: result.details ?? event.details,
          isError: result.isError ?? event.isError,
        } as any;
      }

      return;
    }

    const result = await triggerPostToolUseHooks(
      event.toolName,
      {
        sessionId: shared.getSessionId(ctx),
        cwd: ctx.cwd,
        hookEventName: "PostToolUse",
        transcriptPath: ctx.sessionManager.getSessionFile(),
        toolName: event.toolName,
        toolInput: event.input as Record<string, unknown>,
        toolUseId: event.toolCallId,
        toolResponse: shared.buildToolResponse(event),
      },
      shared.currentSettings,
      (msg, type) => shared.notify(ctx, msg, type),
    );

    if (result.additionalContext) {
      shared.injectHiddenContext(result.additionalContext, {
        hookEventName: "PostToolUse",
        toolName: event.toolName,
        toolUseId: event.toolCallId,
      });
    }

    if (result.stopProcessing) {
      ctx.abort?.();
    }

    if (
      result.content !== undefined ||
      result.details !== undefined ||
      result.isError !== undefined
    ) {
      return {
        content: result.content ?? event.content,
        details: result.details ?? event.details,
        isError: result.isError ?? event.isError,
      } as any;
    }
  }));
}
