import { ImageResponse } from "next/og";

export const runtime = "edge";

// أيقونة 512 مربّعة — صورة علامة الـ V مقصوصة مركزيًا (cover) على خلفية بيضا.
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
        <img src={`${origin}/velora-mark.png`} width={512} height={512} style={{ width: "100%", height: "100%", objectFit: "cover" }} alt="" />
      </div>
    ),
    { width: 512, height: 512 }
  );
}
