/**
 * عقد Claude Provider Layer — مستقل تمامًا عن lib/ai/* (AI Provider
 * Layer الحالي المُخصَّص لـ Gemini). ممنوع أي جزء من AI Provider Layer
 * القديم يستدعي الملفات دي، والعكس — Gemini يفكّر ويحلّل، Claude ينفّذ
 * كود بس. لو احتجنا نستبدل Claude بموديل تنفيذ تاني مستقبلًا (Codex،
 * Cursor Agent، ...)، التغيير يبقى محصور هنا فقط.
 */

export interface ClaudeTokenUsage {
  input_tokens: number;
  output_tokens: number;
}

export interface ClaudeRequest {
  /** تعليمات النظام (الدور + القيود) — منفصلة عن رسالة المستخدم زي Anthropic Messages API. */
  system: string;
  /** المهمة الفعلية المطلوب تنفيذها. */
  prompt: string;
  /** أقصى Tokens للرد — الرد متوقع يكون JSON بمحتوى ملفات معدّلة، فمحتاج مساحة كافية. */
  maxTokens?: number;
}

export interface ClaudeResponse {
  success: boolean;
  output: string | null;
  model_used: string;
  latency_ms: number;
  token_usage: ClaudeTokenUsage | null;
  /** تقدير التكلفة بالدولار — محسوبة من أسعار الموديل المعروفة وقت الاستدعاء. */
  cost_usd: number | null;
  error: { code: string; message: string } | null;
  request_id: string;
}

/** كل Provider تنفيذ كود (Claude، أو بديل مستقبلي) لازم يطبّق العقد ده بس. */
export interface CodeExecutionProvider {
  readonly name: string;
  execute(request: ClaudeRequest): Promise<ClaudeResponse>;
}
