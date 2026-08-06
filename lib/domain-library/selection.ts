/**
 * الاختيار الذكي لحزم المجال — **وحدة نقية بلا I/O**.
 *
 * ## الفلسفة (من المواصفة)
 *
 * «لا تجعل الذكاء يستخدم كل الحزم. بل حلّل طبيعة المشروع وحدّد الحزم
 * المناسبة.» مستشفى يستخدم Hospital ERP وInventory وPharmacy، **لا**
 * Hotel Management.
 *
 * الاختيار هنا **حتمي**: مطابقة المجال أساس، وتداخل الكلمات المفتاحية
 * يرفّع الملاءمة. حتمي = رخيص، مضمون، قابل للاختبار — والذكاء الاصطناعي
 * يقدر يهذّبه لاحقًا بلا استبدال الأساس.
 */

export interface CandidatePackage {
  id: string;
  domain: string;
  name: string;
  /** كلمات مفتاحية من اسم الحزمة وبنودها — لقياس التداخل. */
  keywords: string[];
}

export interface SelectionSignals {
  /** مجال المشروع المُعلَن (projects.domain). */
  projectDomain: string;
  /** كلمات من معرفة المشروع (أسماء كيانات، وحدات، متطلبات). */
  projectKeywords: string[];
}

export interface PackageSelection {
  packageId: string;
  relevance: number; // 0–100
  rationale: string;
}

/** يطبّع كلمة للمطابقة: حالة، مسافات. */
function norm(s: string): string {
  return s.toLowerCase().trim();
}

/** أدنى ملاءمة تستحق الاختيار — تحت كده الحزمة غير مناسبة. */
const MIN_RELEVANCE = 30;

/**
 * يرتّب الحزم المرشّحة بالملاءمة للمشروع.
 *
 * - **مطابقة المجال** (٦٠ نقطة): الحزمة من نفس مجال المشروع.
 * - **تداخل الكلمات** (حتى ٤٠ نقطة): كل كلمة مشتركة بين معرفة المشروع
 *   وكلمات الحزمة ترفّع.
 *
 * الحزمة اللي مجالها مختلف تمامًا وبلا تداخل تسقط تحت الحدّ — «المستشفى
 * لا يستورد Hotel Management».
 */
export function selectDomainPackages(
  signals: SelectionSignals,
  candidates: CandidatePackage[]
): PackageSelection[] {
  const projectDomain = norm(signals.projectDomain);
  const projectKw = new Set(signals.projectKeywords.map(norm).filter(Boolean));

  const selections: PackageSelection[] = [];

  for (const pkg of candidates) {
    const domainMatch = norm(pkg.domain) === projectDomain && projectDomain !== "" && projectDomain !== "generic";
    const domainScore = domainMatch ? 60 : 0;

    const pkgKw = new Set(pkg.keywords.map(norm).filter(Boolean));
    let overlap = 0;
    for (const kw of pkgKw) {
      if (projectKw.has(kw)) overlap += 1;
    }
    // كل كلمة مشتركة ٨ نقاط، بسقف ٤٠.
    const keywordScore = Math.min(40, overlap * 8);

    const relevance = domainScore + keywordScore;
    if (relevance < MIN_RELEVANCE) continue;

    const reasons: string[] = [];
    if (domainMatch) reasons.push("مطابقة المجال");
    if (overlap > 0) reasons.push(`${overlap} كلمة مشتركة`);

    selections.push({
      packageId: pkg.id,
      relevance,
      rationale: reasons.join(" · ") || "ملاءمة جزئية",
    });
  }

  return selections.sort((a, b) => b.relevance - a.relevance);
}
