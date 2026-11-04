import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Parable · 家族传承访谈",
  description: "记录创始人的经历与判断，为家族宪章讨论提供依据。",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}
