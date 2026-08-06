/**
 * Knowledge Aggregation Layer — نقطة الدخول الرسمية الوحيدة لتحديث
 * Project Brain من أي مصدر معرفة في النظام (Discovery، محاضر
 * الاجتماعات، تحليل الاجتماعات، Meeting Review، ملاحظات PM اليدوية،
 * Prototype Review، ملاحظات/طلبات العملاء، وأي مصدر مستقبلي).
 *
 * القاعدة الصارمة: **ممنوع أي Module يحدّث project_brain_documents
 * مباشرة**. كل مصدر لازم يبني KnowledgeCandidate[] ويستدعي
 * proposeChanges() من هنا فقط — هي اللي بتنفّذ الـ Pipeline كاملة:
 * Collect → Normalize (بناء الـ Candidate) → Deduplicate (isDuplicate
 * في conflict-engine) → Merge Decision (add/modify) → Conflict
 * Detection → Save كـ Pending Change (Version + Activity Log بيحصلوا
 * لاحقًا وقت القبول عبر applyChangeToBrain الداخلية) → انتظار قرار PM
 * (Accept/Reject/Merge) → عند القبول فقط: تطبيق فعلي + AI Context
 * Refresh (notifyBrainChanged يشغّل Resync Engine الموجود بالفعل، اللي
 * بيعيد بناء PRD/Prototype Prompt/Presentation/Developer Handoff).
 *
 * هذا الملف Facade فقط فوق pending-changes-service.ts — صفر منطق
 * مكرر، مجرد تسمية معمارية رسمية ونقطة استيراد موحّدة لكل المصادر
 * (نفس فلسفة AIService كنقطة دخول وحيدة لطبقة الـ AI).
 */
export {
  proposeChanges,
  acceptPendingChange,
  rejectPendingChange,
  mergePendingChange,
  listPendingChanges,
  type KnowledgeCandidate,
  type ProposeChangesResult,
} from "./pending-changes-service";
