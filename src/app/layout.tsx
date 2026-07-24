import type { Metadata } from "next";
import { Noto_Serif_KR, Noto_Sans_KR, IBM_Plex_Mono } from "next/font/google";
import AppShell from "@/components/AppShell";
import { buildOgMetadata } from "@/lib/og-image";
import "./globals.css";

const notoSerifKR = Noto_Serif_KR({
  variable: "--font-display",
  weight: "700",
  subsets: ["latin"],
});

const notoSansKR = Noto_Sans_KR({
  variable: "--font-body",
  weight: ["400", "500"],
  subsets: ["latin"],
});

const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-mono",
  weight: ["400", "500"],
  subsets: ["latin"],
});

// 공통 기본 공유 이미지(로고) 반영 + OG 이미지 우선순위(task.md) — 이 값이 모든 공개
// 페이지의 최종 폴백이다. 자체 히어로 이미지가 있는 페이지(/refer/trial 등)는 각자
// generateMetadata에서 이 값을 덮어쓰고, 그 외 나머지는 여기 값을 그대로 상속한다.
export const metadata: Metadata = buildOgMetadata({
  title: "규림한의원",
  description: "건강한 아름다움, 규림한의원 (since 1998)",
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${notoSerifKR.variable} ${notoSansKR.variable} ${ibmPlexMono.variable}`}
    >
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
