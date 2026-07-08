import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.join(__dirname),
  },
  // 원내 LAN의 다른 기기(IP로 접속)에서 dev 서버를 열면, Next.js가 개발 모드 전용
  // 교차 출처 보호 때문에 HMR 웹소켓뿐 아니라 /_next/* 정적 자산(JS 청크 등) 요청까지
  // 403으로 차단한다 — 페이지 HTML은 뜨지만 클라이언트 JS가 안 실려서 버튼/데이터
  // 로딩이 전부 멈춘 것처럼 보이는 원인이 이것이었다. 운영 빌드(next build/start)에는
  // 이 제한이 아예 없으므로 여기서 허용해도 배포 시 영향 없음.
  allowedDevOrigins: ["192.168.*.*"],
};

export default nextConfig;
