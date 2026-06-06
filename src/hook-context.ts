import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { loadSettings } from "./config";
import { extractResponseFromContent } from "./helpers";
import { triggerSessionHooks } from "./hooks/session-hooks";
import type { HookMatcherValue, SettingsFile } from "./types";

export type NotifyType = "info" | "error" | "warning";

export type HookModuleContext = {
  pi: ExtensionAPI;
  currentSettings: SettingsFile | undefined;
  firedSessionStartKeys: Set<string>;
  pendingUserPromptContext?: string;
  stopHookActive: boolean;
  getSessionId: (ctx: any) => string;
  notify: (ctx: any, msg: string, type: NotifyType) => void;
  injectHiddenContext: (
    content: string,
    details: Record<string, unknown>,
  ) => void;
  initSettings: (cwd: string) => SettingsFile | undefined;
  buildToolResponse: (event: {
    content: unknown;
    details?: unknown;
    isError?: boolean;
  }) => Record<string, unknown>;
  triggerSessionStartHook: (
    matcher: HookMatcherValue<"SessionStart">,
    ctx: any,
  ) => Promise<void>;
};

/**
 * Check if an error is a stale-context error from pi session replacement.
 * This happens when `-p` or similar causes a session reload while an
 * extension handler is still running with the old ctx.
 */
export function isStaleContextError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return /stale after session replacement/i.test(err.message);
}

/**
 * Wrap an async event handler so stale-context errors are silently ignored.
 * When a session is replaced mid-handler (e.g. `pi -p`), the captured ctx
 * becomes invalid. There's nothing useful to do at that point — the session
 * the handler was serving no longer exists.
 */
export function safeHandler<A, R>(
  fn: (event: A, ctx: any) => Promise<R>,
): (event: A, ctx: any) => Promise<R | undefined> {
  return async (event: A, ctx: any): Promise<R | undefined> => {
    try {
      return await fn(event, ctx);
    } catch (err) {
      if (isStaleContextError(err)) return undefined;
      throw err;
    }
  };
}

export function createHookContext(pi: ExtensionAPI): HookModuleContext {
  const shared: HookModuleContext = {
    pi,
    currentSettings: undefined,
    firedSessionStartKeys: new Set<string>(),
    pendingUserPromptContext: undefined,
    stopHookActive: false,
    getSessionId: (ctx: any) =>
      ctx.sessionManager.getSessionFile() ?? "ephemeral",
    notify: (ctx: any, msg: string, type: NotifyType) =>
      ctx.ui.notify(msg, type),
    injectHiddenContext: (content, details) => {
      shared.pi.sendMessage({
        customType: "pi-hooks",
        content,
        display: false,
        details,
      });
    },
    initSettings: (cwd: string) => {
      const { settings } = loadSettings(cwd);
      shared.currentSettings = settings;
      return settings;
    },
    buildToolResponse: (event) => {
      const toolResponse: Record<string, unknown> = {
        content: event.content,
        is_error: event.isError ?? false,
      };

      if (event.details !== undefined) {
        toolResponse.details = event.details;
      }

      const extracted = extractResponseFromContent(event.content);
      if (Object.keys(extracted).length > 0) {
        toolResponse.output = extracted.output ?? extracted;
      }

      return toolResponse;
    },
    triggerSessionStartHook: async (matcher, ctx) => {
      const sessionId = shared.getSessionId(ctx);
      const dedupeKey = `${matcher}:${sessionId}`;
      if (shared.firedSessionStartKeys.has(dedupeKey)) {
        return;
      }
      shared.firedSessionStartKeys.add(dedupeKey);

      const result = await triggerSessionHooks(
        "SessionStart",
        matcher,
        {
          sessionId,
          cwd: ctx.cwd,
          hookEventName: "SessionStart",
          source: matcher,
        },
        shared.currentSettings,
        (msg, type) => shared.notify(ctx, msg, type),
      );

      if (result.additionalContext) {
        shared.injectHiddenContext(result.additionalContext, {
          hookEventName: "SessionStart",
          source: matcher,
        });
      }
    },
  };

  return shared;
}
