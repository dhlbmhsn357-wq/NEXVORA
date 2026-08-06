"use server";

import {
  checkGitHubToken,
  checkTelegramToken,
  checkTelegramSupportChat,
  type TokenHealthResult,
} from "@/lib/health/external-tokens";
import { requireAdmin } from "@/lib/auth/rbac";

export type ExternalTokenKey = "github" | "telegram_bot" | "telegram_support_chat";

export async function checkExternalToken(key: ExternalTokenKey): Promise<TokenHealthResult> {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return { ok: false, message: auth.message ?? "غير مسموح.", checkedAt: new Date().toISOString() };
  }

  switch (key) {
    case "github":
      return checkGitHubToken();
    case "telegram_bot":
      return checkTelegramToken();
    case "telegram_support_chat":
      return checkTelegramSupportChat();
  }
}
