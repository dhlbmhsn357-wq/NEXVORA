/**
 * شهادة الإطلاق (Go Live Certificate) — **وحدة نقية بلا I/O**.
 *
 * لا تُصدَر إلا إذا نجحت **كل** خطوات قائمة الإطلاق الحاجزة واعتمدت كل
 * الجهات المطلوبة. تتضمّن: المشروع، إصدار الترحيل، درجات التحقّق والقبول،
 * حالة الإطلاق، والمعتمِدين.
 */

import type { GoLiveChecklist, FinalScore, GoLiveCertificateData } from "./verification-types";

export interface CertificateInput {
  projectName: string;
  migrationVersion: string;
  checklist: GoLiveChecklist;
  score: FinalScore;
  approvers: Array<{ role: string; scope: string }>;
}

export type CertificateResult =
  | { ok: true; data: GoLiveCertificateData }
  | { ok: false; blockers: string[] };

export function buildCertificate(input: CertificateInput): CertificateResult {
  if (!input.checklist.ready) {
    return { ok: false, blockers: input.checklist.blockers };
  }
  if (input.score.goLiveStatus === "not_ready") {
    return { ok: false, blockers: ["الدرجة النهائية أقل من الحدّ الآمن للإطلاق."] };
  }
  return {
    ok: true,
    data: {
      projectName: input.projectName,
      migrationVersion: input.migrationVersion,
      verificationScore: input.score.verificationScore,
      businessAcceptanceScore: input.score.businessAcceptanceScore,
      finalMigrationScore: input.score.finalMigrationScore,
      goLiveStatus: input.score.goLiveStatus,
      approvers: input.approvers,
      issuedAtNote: "الطابع الزمني يُثبَّت عند الإصدار الفعلي في الخدمة.",
    },
  };
}
