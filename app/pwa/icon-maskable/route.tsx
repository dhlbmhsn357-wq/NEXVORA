import { ImageResponse } from "next/og";

export const runtime = "edge";

// أيقونة Maskable — المنصة ممكن تقص أي حاجة برّه دائرة الأمان (~80% من
// المنتصف)، فالخلفية بتملأ الكانفاس بالكامل (أبيض)، والعلامة (صورة الـ V)
// تتقلّص لـ ~66% في المنتصف عشان ما تتقصش على Android.
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
        <img src={`${origin}/velora-mark.png`} width={338} height={338} style={{ width: "66%", height: "66%", objectFit: "cover" }} alt="" />
      </div>
    ),
    { width: 512, height: 512 }
  );
}
