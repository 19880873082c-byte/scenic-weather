import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "景候 · 中国景区最佳观景天气",
  description: "查询中国景区未来天气，以透明评分寻找最适合游玩与拍照的一天。",
  applicationName: "景候",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "景候" },
  icons: { icon: "/app-icon.svg", apple: "/app-icon.svg" },
};

export const viewport: Viewport = { themeColor: "#f4f7f4", colorScheme: "light", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
