import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { type HookModuleContext, safeHandler } from "../hook-context";
import type {
  HookExecutionContext,
  HookMatcherValue,
  HookRunResult,
  NotifyFn,
  SettingsFile,
} from "../types";
import { triggerSimpleHooks } from "./shared";

export async function triggerSessionHooks(
  eventName: "SessionStart" | "SessionEnd",
  matcherValue: HookMatcherValue<"SessionStart"> | HookMatcherValue<"SessionEnd">,
  context: HookExecutionContext,
  settings: SettingsFile | undefined,
  notify?: NotifyFn,
): Promise<HookRunResult> {
  return triggerSimpleHooks(eventName, matcherValue, context, settings, notify);
}

export function registerSessionHooks(
  pi: ExtensionAPI,
  shared: HookModuleContext,
) {
  // SessionStart 映射：
  // startup -> session_start(reason="startup")
  // startup -> session_start(reason="new")
  // resume -> session_start(reason="resume")
  // compact -> session_compact
  //
  // SessionEnd 映射：
  // other -> session_shutdown
  pi.on("session_start", safeHandler(async (event, ctx) => {
    shared.initSettings(ctx.cwd);

    if (event.reason === "startup" || event.reason === "new") {
      await shared.triggerSessionStartHook("startup", ctx);
      return;
    }

    if (event.reason === "resume") {
      await shared.triggerSessionStartHook("resume", ctx);
    }
  }));

  pi.on("session_shutdown", safeHandler(async (_event, ctx) => {
    const reason = "other";

    // SessionEnd 固定由 session_shutdown 触发，matcher 仅使用 other。
    await triggerSessionHooks(
      "SessionEnd",
      reason,
      {
        sessionId: shared.getSessionId(ctx),
        cwd: ctx.cwd,
        hookEventName: "SessionEnd",
        reason,
      },
      shared.currentSettings,
      (msg, type) => shared.notify(ctx, msg, type),
    );
  }));
}
