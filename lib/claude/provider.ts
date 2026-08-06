import type { ClaudeRequest, ClaudeResponse, CodeExecutionProvider } from "./types";

const CLAUDE_API_BASE = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const DEFAULT_MAX_TOKENS = 8192;

/**
 * أسعار تقريبية بالدولار لكل مليون Token — لتقدير التكلفة فقط (مش
 * فاتورة رسمية). لازم تُراجَع دوريًا في Anthropic Console لو الأسعار
 * اتغيّرت؛ القيم دي Fallback معقول مش مصدر حقيقة نهائي.
 */
const PRICING_PER_MILLION_TOKENS: Record<string, { input: number; output: number }> = {
  opus: { input: 15, output: 75 },
  sonnet: { input: 3, output: 15 },
  haiku: { input: 0.8, output: 4 },
};

function estimateCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  const key = (Object.keys(PRICING_PER_MILLION_TOKENS) as Array<keyof typeof PRICING_PER_MILLION_TOKENS>).find((k) =>
    model.toLowerCase().includes(k)
  );
  const pricing = key ? PRICING_PER_MILLION_TOKENS[key] : PRICING_PER_MILLION_TOKENS.sonnet;
  return (inputTokens / 1_000_000) * pricing.input + (outputTokens / 1_000_000) * pricing.output;
}

interface AnthropicSuccessBody {
  content?: Array<{ type: string; text?: string }>;
  model?: string;
  usage?: { input_tokens?: number; output_tokens?: number };
  stop_reason?: string;
}

interface AnthropicErrorBody {
  error?: { type?: string; message?: string };
}

/**
 * Provider مستقل لـ Claude API — بيطبّق CodeExecutionProvider بس. مفتاح
 * الـ API من متغيّرات البيئة حصريًا (ANTHROPIC_API_KEY) وما بيتبعتش
 * للـ Frontend أبدًا — كل استدعاء بيحصل من كود سيرفر فقط (Background
 * Job)، زي باقي مزوّدي AI في المشروع.
 */
export class ClaudeProvider implements CodeExecutionProvider {
  readonly name = "claude";

  private getApiKey(): string {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) throw new Error("ANTHROPIC_API_KEY غير موجود في متغيرات البيئة — لازم يُضبط قبل تشغيل محرك التنفيذ.");
    return key;
  }

  /** الموديل قابل للتغيير بدون تعديل كود — راجع CLAUDE_MODEL في متغيرات البيئة. */
  private getModel(): string {
    return process.env.CLAUDE_MODEL?.trim() || "claude-sonnet-5";
  }

  async execute(request: ClaudeRequest): Promise<ClaudeResponse> {
    const requestId = crypto.randomUUID();
    const model = this.getModel();
    const start = Date.now();

    let res: Response;
    try {
      res = await fetch(CLAUDE_API_BASE, {
        method: "POST",
        headers: {
          "x-api-key": this.getApiKey(),
          "anthropic-version": ANTHROPIC_VERSION,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model,
          max_tokens: request.maxTokens ?? DEFAULT_MAX_TOKENS,
          system: request.system,
          messages: [{ role: "user", content: request.prompt }],
        }),
      });
    } catch (err) {
      return {
        success: false,
        output: null,
        model_used: model,
        latency_ms: Date.now() - start,
        token_usage: null,
        cost_usd: null,
        error: { code: "PROVIDER_ERROR", message: `فشل الاتصال بـ Claude: ${err instanceof Error ? err.message : "unknown"}` },
        request_id: requestId,
      };
    }

    const latency_ms = Date.now() - start;

    if (res.ok) {
      const body = (await res.json()) as AnthropicSuccessBody;
      const output = body.content?.find((c) => c.type === "text")?.text ?? null;
      const usage = body.usage
        ? { input_tokens: body.usage.input_tokens ?? 0, output_tokens: body.usage.output_tokens ?? 0 }
        : null;
      return {
        success: true,
        output,
        model_used: body.model ?? model,
        latency_ms,
        token_usage: usage,
        cost_usd: usage ? estimateCostUsd(body.model ?? model, usage.input_tokens, usage.output_tokens) : null,
        error: null,
        request_id: requestId,
      };
    }

    const errBody = (await res.json().catch(() => null)) as AnthropicErrorBody | null;
    const message = errBody?.error?.message ?? `Claude رجّع HTTP ${res.status}`;
    const code = res.status === 429 ? "RATE_LIMIT" : res.status === 401 || res.status === 403 ? "AUTHENTICATION" : "PROVIDER_ERROR";

    return {
      success: false,
      output: null,
      model_used: model,
      latency_ms,
      token_usage: null,
      cost_usd: null,
      error: { code, message },
      request_id: requestId,
    };
  }
}
