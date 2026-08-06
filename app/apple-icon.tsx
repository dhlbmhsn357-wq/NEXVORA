import { ImageResponse } from "next/og";

export const runtime = "edge";
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #0a1a3d 0%, #152a63 45%, #3d5cff 100%)",
        }}
      >
        <svg viewBox="0 0 100 100" width="110" height="110" xmlns="http://www.w3.org/2000/svg">
          <path d="M8 10 L38 10 L50 55 L62 10 L92 10 L58 90 L42 90 Z" fill="#ffffff" />
        </svg>
      </div>
    ),
    { ...size }
  );
}
