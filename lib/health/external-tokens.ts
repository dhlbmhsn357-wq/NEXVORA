/**
 * Health Check لتوكنات خارجية (GitHub, Telegram). فحص خفيف بيتحقق من
 * أن التوكن موجود وصالح، بدون آثار جانبية. المستخدم في صفحة Settings
 * عشان نتفادى مفاجأة "التوكن انتهى" وقت أول استخدام حقيقي.
 */

export interface TokenHealthResult {
  ok: boolean;
  message: string;
  checkedAt: string;
}

export async function checkGitHubToken(): Promise<TokenHealthResult> {
  const token = process.env.GITHUB_TOKEN;
  const checkedAt = new Date().toISOString();

  if (!token) {
    return { ok: false, message: "GITHUB_TOKEN غير مُعد في متغيرات البيئة.", checkedAt };
  }

  try {
    const res = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "pm-os-health-check",
      },
      signal: AbortSignal.timeout(10_000),
    });

    if (res.status === 200) {
      const body = (await res.json()) as { login?: string };
      return {
        ok: true,
        message: `التوكن صالح — الحساب: ${body.login ?? "غير معروف"}`,
        checkedAt,
      };
    }

    if (res.status === 401) {
      return { ok: false, message: "التوكن غير صالح أو منتهي الصلاحية (401).", checkedAt };
    }

    return { ok: false, message: `استجابة غير متوقعة من GitHub: ${res.status}`, checkedAt };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "خطأ غير معروف عند الاتصال بـ GitHub.",
      checkedAt,
    };
  }
}

export async function checkTelegramToken(): Promise<TokenHealthResult> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const checkedAt = new Date().toISOString();

  if (!token) {
    return { ok: false, message: "TELEGRAM_BOT_TOKEN غير مُعد في متغيرات البيئة.", checkedAt };
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getMe`, {
      signal: AbortSignal.timeout(10_000),
    });

    const body = (await res.json()) as { ok: boolean; result?: { username?: string }; description?: string };

    if (body.ok && body.result) {
      return {
        ok: true,
        message: `التوكن صالح — البوت: @${body.result.username ?? "غير معروف"}`,
        checkedAt,
      };
    }

    return {
      ok: false,
      message: body.description ?? `استجابة غير متوقعة من Telegram: ${res.status}`,
      checkedAt,
    };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "خطأ غير معروف عند الاتصال بـ Telegram.",
      checkedAt,
    };
  }
}

export async function checkTelegramSupportChat(): Promise<TokenHealthResult> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_SUPPORT_CHAT_ID;
  const checkedAt = new Date().toISOString();

  if (!token || !chatId) {
    return { ok: false, message: "TELEGRAM_BOT_TOKEN أو TELEGRAM_SUPPORT_CHAT_ID غير مُعد.", checkedAt };
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getChat?chat_id=${chatId}`, {
      signal: AbortSignal.timeout(10_000),
    });

    const body = (await res.json()) as { ok: boolean; description?: string };

    if (body.ok) {
      return { ok: true, message: `Chat ID صالح، البوت عنده وصول إليه.`, checkedAt };
    }

    return { ok: false, message: body.description ?? "Chat ID غير صالح أو البوت مش موجود فيه.", checkedAt };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "خطأ غير معروف.",
      checkedAt,
    };
  }
}
