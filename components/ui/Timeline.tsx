import type { ReactNode } from "react";

export interface TimelineNode {
  key: string;
  /** محتوى نقطة/أيقونة العقدة نفسها — الاستدعاء بيتحكم في شكلها بالكامل. */
  node: ReactNode;
  /** المحتوى المعروض جنب العقدة. */
  content: ReactNode;
}

/**
 * خط زمني رأسي موحّد — عقدة + خط وصل، بديل لنفس النمط اللي كان مكرر
 * بشكلين مختلفين (دليل الاستخدام بأيقونات دائرية، قرارات Project Brain
 * بنقاط صغيرة) بدل ما كل استخدام يعيد كتابة نفس الـ flex/connector.
 * الاستدعاء مسؤول عن شكل العقدة والمحتوى، الخط الواصل هو المشترك.
 */
export default function Timeline({ items, connectorColor = "border-strong" }: { items: TimelineNode[]; connectorColor?: "border" | "border-strong" }) {
  return (
    <div>
      {items.map((item, i) => (
        <div key={item.key} className="flex gap-4">
          <div className="flex flex-col items-center">
            {item.node}
            {i < items.length - 1 && (
              <div className={`my-1 w-px flex-1 bg-[var(--v-${connectorColor})]`} />
            )}
          </div>
          <div className="min-w-0 flex-1 pb-4">{item.content}</div>
        </div>
      ))}
    </div>
  );
}
