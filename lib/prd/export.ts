import type { PRD } from "@/lib/types/database";

/**
 * طبقة Export — تنسيق بيانات PRD لأشكال قابلة للمشاركة (Markdown،
 * ومستند HTML مُعدّ للطباعة/PDF). منطق تنسيق خالص، بدون أي استدعاء AI
 * أو قراءة/كتابة قاعدة بيانات.
 */
export function formatPRDAsMarkdown(projectName: string, prd: PRD): string {
  const lines: string[] = [];

  lines.push(`# PRD — ${projectName}`);
  lines.push(`_نسخة ${prd.version} · آخر تحديث: ${new Date(prd.updated_at).toLocaleString("ar-EG")}_`);
  lines.push("");

  lines.push("## نظرة عامة");
  lines.push(prd.overview || "—");
  lines.push("");

  lines.push("## بيان المشكلة");
  lines.push(prd.problem_statement || "—");
  lines.push("");

  lines.push("## الأهداف");
  lines.push(...bulletList(prd.goals));
  lines.push("");

  lines.push("## خارج النطاق");
  lines.push(...bulletList(prd.out_of_scope));
  lines.push("");

  lines.push("## المستخدمون المستهدفون");
  lines.push(...bulletList(prd.target_users));
  lines.push("");

  lines.push("## قصص المستخدم");
  if (prd.user_stories.length === 0) lines.push("—");
  for (const s of prd.user_stories) {
    lines.push(`- ${s.role}، ${s.want}، ${s.benefit}`);
  }
  lines.push("");

  lines.push("## معايير القبول");
  if (prd.acceptance_criteria.length === 0) lines.push("—");
  for (const c of prd.acceptance_criteria) {
    lines.push(`- **Given** ${c.given} **When** ${c.when} **Then** ${c.then}`);
  }
  lines.push("");

  lines.push("## المتطلبات الوظيفية");
  lines.push(...bulletList(prd.functional_requirements));
  lines.push("");

  lines.push("## المتطلبات غير الوظيفية");
  lines.push(...bulletList(prd.non_functional_requirements));
  lines.push("");

  lines.push("## المخاطر والافتراضات");
  lines.push(...bulletList(prd.risks_assumptions));
  lines.push("");

  lines.push("## مؤشرات النجاح");
  lines.push(...bulletList(prd.success_metrics));
  lines.push("");

  lines.push("## قواعد العمل والحالات الخاصة");
  if (prd.business_rules_detail.length === 0) {
    lines.push("—");
  } else {
    lines.push("| القاعدة | الشرط المُفعِّل | القيمة الحدّية | عند التجاوز | مين بيطبّقها |");
    lines.push("|---|---|---|---|---|");
    for (const b of prd.business_rules_detail) {
      lines.push(
        `| ${escapeCell(b.title)} | ${escapeCell(b.trigger_condition)} | ${escapeCell(b.threshold_value)} | ${escapeCell(b.on_violation)} | ${escapeCell(b.enforcement_point)} |`
      );
    }
  }
  lines.push("");

  lines.push("## رسائل النظام");
  if (prd.system_messages_detail.length === 0) {
    lines.push("—");
  } else {
    lines.push("| الحدث | النوع | نص الرسالة |");
    lines.push("|---|---|---|");
    for (const m of prd.system_messages_detail) {
      lines.push(`| ${escapeCell(m.event_name)} | ${escapeCell(m.message_type)} | ${escapeCell(m.message_text)} |`);
    }
  }
  lines.push("");

  lines.push("## مواصفات التدفقات التفصيلية");
  if (prd.flow_specifications.length === 0) {
    lines.push("—");
  } else {
    for (const f of prd.flow_specifications) {
      lines.push(`### ${f.flow_name}`);
      lines.push(`**الخطوة:** ${f.step_action}`);
      if (f.ui_elements.length > 0) {
        lines.push("");
        lines.push("| الحقل | النوع | التحقق |");
        lines.push("|---|---|---|");
        for (const el of f.ui_elements) {
          lines.push(`| ${escapeCell(el.field_name)} | ${escapeCell(el.field_type)} | ${escapeCell(el.validation_rule)} |`);
        }
      }
      if (f.success_message) lines.push(`- **رسالة نجاح:** ${f.success_message}`);
      for (const err of f.error_messages) {
        lines.push(`- **رسالة خطأ:** ${err}`);
      }
      lines.push("");
    }
  }

  lines.push("## تقسيم حسب الشخصيات/الموديلات");
  if (prd.persona_modules.length === 0) {
    lines.push("—");
  } else {
    for (const m of prd.persona_modules) {
      const roleSuffix = m.persona_role ? ` — ${m.persona_role}` : "";
      lines.push(`### موديول: ${m.persona_name}${roleSuffix}`);

      if (m.user_stories.length > 0) {
        lines.push("**قصص المستخدم:**");
        for (const s of m.user_stories) {
          const code = s.code ? `[${s.code}] ` : "";
          lines.push(`- ${code}${s.title}`);
        }
      }
      if (m.requirements.length > 0) {
        lines.push("**المتطلبات:**");
        for (const r of m.requirements) {
          const code = r.code ? `[${r.code}] ` : "";
          lines.push(`- ${code}${r.title}`);
        }
      }
      if (m.business_rules.length > 0) {
        lines.push("**قواعد العمل:**");
        for (const b of m.business_rules) {
          lines.push(`- ${escapeCell(b.title)}`);
        }
      }
      if (m.system_messages.length > 0) {
        lines.push("**رسائل النظام:**");
        for (const msg of m.system_messages) {
          lines.push(`- [${msg.message_type}] ${escapeCell(msg.event_name)}`);
        }
      }
      if (m.flow_specifications.length > 0) {
        lines.push("**التدفّقات:**");
        for (const f of m.flow_specifications) {
          lines.push(`- ${escapeCell(f.flow_name)}`);
        }
      }
      lines.push("");
    }
  }

  lines.push("## آلات الحالة (State Machines)");
  if (prd.state_machines_detail.length === 0) {
    lines.push("—");
  } else {
    for (const sm of prd.state_machines_detail) {
      lines.push(`### ${sm.name}`);
      if (sm.description) lines.push(sm.description);
      if (sm.states.length > 0) lines.push(`**الحالات:** ${sm.states.join(" → ")}`);
      for (const t of sm.transitions) {
        lines.push(`- **انتقال:** ${t.from} → ${t.to}${t.trigger ? ` (${t.trigger})` : ""}`);
      }
      lines.push("");
    }
  }

  return lines.join("\n");
}

function escapeCell(value: string): string {
  return (value || "—").replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function bulletList(items: string[]): string[] {
  return items.length > 0 ? items.map((i) => `- ${i}`) : ["—"];
}

export function downloadMarkdown(filename: string, content: string): void {
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
