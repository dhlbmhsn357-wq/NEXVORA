/** ملصقات عربية مشتركة للتوصيات الذكية (Phase 4) — يستخدمها smart-recommendations-panel.tsx و brain-review-panel.tsx. */
export const RECOMMENDATION_CATEGORY_LABELS: Record<string, string> = {
  business_logic: "منطق عمل", functional: "وظيفي", non_functional: "غير وظيفي", architecture: "معمارية", database: "قاعدة بيانات",
  performance: "أداء", security: "أمان", scalability: "قابلية توسّع", integration: "تكامل", automation: "أتمتة",
  workflow: "سير عمل", reporting: "تقارير", analytics: "تحليلات", notifications: "إشعارات", validation: "تحقّق",
  permissions: "صلاحيات", compliance: "امتثال", accessibility: "إتاحة", ux: "تجربة مستخدم", ui: "واجهة",
  ai_enhancement: "تحسين ذكاء اصطناعي", future_expansion: "توسّع مستقبلي", organizational_improvement: "تحسين تنظيمي",
  features: "مزايا", integrations: "تكاملات", user_roles: "أدوار مستخدمين", business_rules: "قواعد عمل", roadmap: "خارطة طريق",
  kpis: "مؤشرات أداء", user_stories: "قصص مستخدم", meeting_questions: "أسئلة اجتماع", discovery_improvements: "تحسينات اكتشاف", risk_mitigation: "تخفيف مخاطر",
};

export const RECOMMENDATION_LEVEL_LABELS: Record<string, string> = {
  critical: "حرجة", high: "عالية", medium: "متوسطة", low: "منخفضة",
};

export const RECOMMENDATION_STATUS_LABELS: Record<string, string> = {
  suggested: "مقترحة", accepted: "مقبولة", dismissed: "مرفوضة", postponed: "مؤجّلة", needs_discussion: "بحاجة لنقاش",
};
