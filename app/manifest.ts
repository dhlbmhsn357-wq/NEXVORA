import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "PM Operating System — VELORA",
    short_name: "VELORA PM",
    description: "العقل المركزي لإدارة دورة حياة مشاريع VELORA.",
    start_url: "/dashboard",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#ffffff",
    theme_color: "#0a1628",
    dir: "rtl",
    lang: "ar",
    icons: [
      { src: "/pwa/icon-192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/pwa/icon-512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/pwa/icon-maskable", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "لوحة التحكم", url: "/dashboard" },
      { name: "العملاء المحتملون", url: "/dashboard/leads" },
      { name: "المشاريع", url: "/dashboard/projects" },
    ],
  };
}
