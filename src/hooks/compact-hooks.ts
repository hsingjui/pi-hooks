import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { type HookModuleContext, safeHandler } from "../hook-context";
import type {
  HookExecutionContext,
  HookRunResult,
  NotifyFn,
  SettingsFile,
} from "../types";
import { triggerSimpleHooks } from "./shared";

async function triggerCompactHooks(
  eventName: "PreCompact" | "PostCompact",
  context: HookExecutionContext,
  settings: SettingsFile | undefined,
  notify?: NotifyFn,
): Promise<HookRunResult> {
  return triggerSimpleHooks(eventName, context.trigger ?? "manual", context, settings, notify);
}

export function registerCompactHooks(pi: ExtensionAPI, shared: HookModuleContext) {
  pi.on("session_before_compact", safeHandler(async (event, ctx) => {
    const trigger: "manual" | "auto" = "manual";
    await triggerCompactHooks(
      "PreCompact",
      {
        sessionId: shared.getSessionId(ctx),
        cwd: ctx.cwd,
        hookEventName: "PreCompact",
        trigger,
        customInstructions: event.customInstructions ?? "",
        transcriptPath: ctx.sessionManager.getSessionFile(),
      },
      shared.currentSettings,
      (msg, type) => shared.notify(ctx, msg, type),
    );
  }));

  pi.on("session_compact", safeHandler(async (event, ctx) => {
    const trigger: "manual" | "auto" = "manual";

    await triggerCompactHooks(
      "PostCompact",
      {
        sessionId: shared.getSessionId(ctx),
        cwd: ctx.cwd,
        hookEventName: "PostCompact",
        trigger,
        compactSummary: event.compactionEntry.summary,
        transcriptPath: ctx.sessionManager.getSessionFile(),
      },
      shared.currentSettings,
      (msg, type) => shared.notify(ctx, msg, type),
    );

    await shared.triggerSessionStartHook("compact", ctx);
  }));
}
