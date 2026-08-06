/**
 * عارض Markdown آمن (subset) — وحدة نقية. الأمان أولًا: بنهرّب كل HTML
 * الأول، وبعدين نطبّق تنسيق محدود على النص المُهرَّب فقط، فمستحيل يمرّ
 * أي وسم/سكربت من المستخدم (حماية XSS). مفيش أي dependency خارجية.
 *
 * المدعوم: كتل كود ```...```، كود سطري `..`، **عريض**، *مائل*، روابط
 * http(s) تلقائية، منشنز @، وأسطر جديدة.
 */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** يطبّق التنسيق السطري على نص *مُهرَّب مسبقًا*. */
function renderInline(escaped: string): string {
  let out = escaped;

  // كود سطري `code` (قبل باقي التنسيق عشان مايتفسّرش جواه)
  out = out.replace(/`([^`\n]+)`/g, '<code class="v-md-code">$1</code>');

  // روابط http(s) تلقائية — الـ URL هنا مُهرَّب بالفعل فآمن كـ href/نص
  out = out.replace(
    /(https?:\/\/[^\s<]+)/g,
    '<a href="$1" target="_blank" rel="noopener noreferrer nofollow" class="v-md-link">$1</a>'
  );

  // عريض ثم مائل
  out = out.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");

  // منشنز @user / @admins ...
  out = out.replace(/(^|\s)(@[a-zA-Z0-9._-]+)/g, '$1<span class="v-md-mention">$2</span>');

  return out;
}

/** يحوّل نص Markdown آمن إلى HTML جاهز للعرض (dangerouslySetInnerHTML). */
export function renderSafeMarkdown(body: string): string {
  if (!body) return "";
  // نقسّم على كتل الكود ```...``` — الفهارس الفردية = محتوى كود.
  const parts = body.split(/```/);
  const rendered = parts.map((part, i) => {
    const escaped = escapeHtml(part);
    if (i % 2 === 1) {
      return `<pre class="v-md-pre"><code>${escaped.replace(/^\n/, "")}</code></pre>`;
    }
    return renderInline(escaped).replace(/\n/g, "<br/>");
  });
  return rendered.join("");
}

/** نص عادي مختصر (للمعاينات/الإشعارات) — بدون أي HTML. */
export function toPlainPreview(body: string, maxLen = 120): string {
  const stripped = body
    .replace(/```[\s\S]*?```/g, "[كود]")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
  return stripped.length > maxLen ? stripped.slice(0, maxLen - 1) + "…" : stripped;
}
