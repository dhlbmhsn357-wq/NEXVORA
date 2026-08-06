import { ImageResponse } from "next/og";

export const runtime = "edge";

// أيقونة 192 مربّعة — صورة علامة الـ V مقصوصة مركزيًا (cover) على خلفية
// بيضا، فتطلع مربّعة متناسقة بدل letterbox الصورة المستطيلة الأصلية.
export async function GET(request: Request) {
  const { origin } = new URL(request.url);
  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#ffffff",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`${origin}/velora-mark.png`} width={192} height={192} style={{ width: "100%", height: "100%", objectFit: "cover" }} alt="" />
      </div>
    ),
    { width: 192, height: 192 }
  );
}
