import type { Row } from "./rule-types";

/**
 * محرّك المعادلات — **وحدة نقية بلا I/O، وبلا eval**.
 *
 * يقيّم معادلات حسابية للحقول المحسوبة (Total, Tax, Balance, Age...) عبر
 * محلّل تعبيرات صغير آمن: أرقام، مراجع حقول `[field]`، `+ - * / ( )`، ودوال
 * بسيطة `round/min/max/abs`. لا يستخدم eval إطلاقًا (أمان).
 */

type Token = { type: "num" | "op" | "lparen" | "rparen" | "func" | "comma"; value: string };

const FUNCS = new Set(["round", "min", "max", "abs", "floor", "ceil"]);

function tokenize(expr: string, row: Row): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const s = expr.trim();
  while (i < s.length) {
    const ch = s[i];
    if (ch === " ") { i++; continue; }
    if ("+-*/".includes(ch)) { tokens.push({ type: "op", value: ch }); i++; continue; }
    if (ch === "(") { tokens.push({ type: "lparen", value: ch }); i++; continue; }
    if (ch === ")") { tokens.push({ type: "rparen", value: ch }); i++; continue; }
    if (ch === ",") { tokens.push({ type: "comma", value: ch }); i++; continue; }
    if (ch === "[") {
      const end = s.indexOf("]", i);
      if (end < 0) throw new Error("مرجع حقل غير مغلق");
      const field = s.slice(i + 1, end);
      const raw = (row[field] ?? "").replace(/[^\d.-]/g, "");
      const num = parseFloat(raw);
      tokens.push({ type: "num", value: String(Number.isFinite(num) ? num : 0) });
      i = end + 1;
      continue;
    }
    if (/[0-9.]/.test(ch)) {
      let j = i;
      while (j < s.length && /[0-9.]/.test(s[j])) j++;
      tokens.push({ type: "num", value: s.slice(i, j) });
      i = j;
      continue;
    }
    if (/[a-z]/i.test(ch)) {
      let j = i;
      while (j < s.length && /[a-z]/i.test(s[j])) j++;
      const name = s.slice(i, j).toLowerCase();
      if (!FUNCS.has(name)) throw new Error(`دالة غير مدعومة: ${name}`);
      tokens.push({ type: "func", value: name });
      i = j;
      continue;
    }
    throw new Error(`رمز غير متوقّع: ${ch}`);
  }
  return tokens;
}

/** Pratt-lite parser + evaluator (يحترم أولوية العمليات). */
function evaluate(tokens: Token[]): number {
  let pos = 0;
  const peek = () => tokens[pos];
  const next = () => tokens[pos++];

  function parseExpr(): number {
    let left = parseTerm();
    while (peek() && peek().type === "op" && (peek().value === "+" || peek().value === "-")) {
      const op = next().value;
      const right = parseTerm();
      left = op === "+" ? left + right : left - right;
    }
    return left;
  }
  function parseTerm(): number {
    let left = parseFactor();
    while (peek() && peek().type === "op" && (peek().value === "*" || peek().value === "/")) {
      const op = next().value;
      const right = parseFactor();
      left = op === "*" ? left * right : right === 0 ? 0 : left / right;
    }
    return left;
  }
  function parseFactor(): number {
    const t = peek();
    if (!t) throw new Error("نهاية غير متوقّعة");
    if (t.type === "op" && t.value === "-") { next(); return -parseFactor(); }
    if (t.type === "num") { next(); return parseFloat(t.value); }
    if (t.type === "lparen") { next(); const v = parseExpr(); if (peek()?.type !== "rparen") throw new Error("قوس غير مغلق"); next(); return v; }
    if (t.type === "func") {
      next();
      if (peek()?.type !== "lparen") throw new Error("دالة بلا أقواس");
      next();
      const args: number[] = [parseExpr()];
      while (peek()?.type === "comma") { next(); args.push(parseExpr()); }
      if (peek()?.type !== "rparen") throw new Error("قوس دالة غير مغلق");
      next();
      return applyFunc(t.value, args);
    }
    throw new Error("تعبير غير صالح");
  }
  const result = parseExpr();
  if (pos !== tokens.length) throw new Error("رموز زائدة");
  return result;
}

function applyFunc(name: string, args: number[]): number {
  switch (name) {
    case "round": return Math.round((args[0] ?? 0) * (args[1] ? 10 ** args[1] : 1)) / (args[1] ? 10 ** args[1] : 1);
    case "min": return Math.min(...args);
    case "max": return Math.max(...args);
    case "abs": return Math.abs(args[0] ?? 0);
    case "floor": return Math.floor(args[0] ?? 0);
    case "ceil": return Math.ceil(args[0] ?? 0);
    default: return 0;
  }
}

/** يقيّم معادلة على صفّ. يرجّع نصًّا (أو رسالة خطأ عند فشل التحليل). */
export function evaluateFormula(expr: string, row: Row): { ok: boolean; value: string; error?: string } {
  try {
    const tokens = tokenize(expr, row);
    if (tokens.length === 0) return { ok: false, value: "", error: "معادلة فارغة" };
    const result = evaluate(tokens);
    if (!Number.isFinite(result)) return { ok: false, value: "", error: "نتيجة غير صالحة" };
    return { ok: true, value: String(Math.round(result * 1e6) / 1e6) };
  } catch (e) {
    return { ok: false, value: "", error: e instanceof Error ? e.message : "خطأ في المعادلة" };
  }
}
