import type { DeveloperHandoffBugReportingFormat } from "@/lib/types/database";

/**
 * قالب ثابت وإلزامي لتنسيق الإبلاغ عن الأخطاء — مش AI-generated، بيتكرر
 * بنفس الشكل بالظبط في كل حزمة Handoff يتم توليدها.
 */
export const BUG_REPORTING_FORMAT_TEMPLATE = `When reporting an issue found during this review, use exactly this format:

- **Description**: A short, clear statement of the issue.
- **Steps to Reproduce**: Numbered steps to trigger the issue.
- **Expected**: What the system should do according to the Expected Behavior section above.
- **Actual**: What the system actually does.
- **Severity**: Critical / High / Medium / Low.
- **Suggested Fix** (optional): A brief technical suggestion, if one is apparent — this is not required and reviewers are not expected to implement fixes.`;

export function buildBugReportingFormat(): DeveloperHandoffBugReportingFormat {
  return { template: BUG_REPORTING_FORMAT_TEMPLATE };
}
