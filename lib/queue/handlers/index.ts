/**
 * نقطة التسجيل الوحيدة لكل معالجات المهام.
 *
 * **إضافة عامل جديد لاحقًا = ملف جديد + سطر استيراد هنا.** لا تعديل
 * على الطابور، ولا على وقت تشغيل العامل، ولا على قاعدة البيانات.
 *
 * الاستيراد لأثره الجانبي عن قصد: كل ملف بينادي `defineJobHandler`
 * وقت التحميل، فمجرد استيراده يسجّله.
 *
 * مثال لما تيجي المرحلة التالية:
 * ```ts
 * import "./ai";          // ai.generate · ai.embed
 * import "./knowledge";   // knowledge.classify · knowledge.enrich
 * import "./browser";     // browser.check · browser.crawl
 * ```
 */

import "./system";
import "./ai";         // ١١ نوع مهمة ذكاء اصطناعي — عامل لكل خدمة
import "./knowledge";  // ٥ مجموعات استيراد معرفة — عامل لكل مجموعة
import "./migration";  // migration.execute — تنفيذ الترحيل الحقيقي (المرحلة ٦)

export { listJobHandlers, handlerTypesForWorker, listWorkerTypes } from "../registry";
