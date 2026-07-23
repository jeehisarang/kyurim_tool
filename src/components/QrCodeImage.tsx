"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import styles from "./QrCodeImage.module.css";

/**
 * 원내 포스터/환자 전달용 QR 코드(task.md 보완 3항) — 클라이언트에서 데이터URL로 생성해
 * 바로 표시 + PNG 다운로드한다. /settings/trial-campaign(캠페인 기본 QR)과
 * /prescriptions/[prescriptionId](환자별 추천링크 QR) 둘 다 재사용한다.
 */
export default function QrCodeImage({ value, filename }: { value: string; filename: string }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setDataUrl(null);
    setError(false);
    QRCode.toDataURL(value, { width: 240, margin: 2 })
      .then((url) => {
        if (!cancelled) setDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [value]);

  if (error) return <p className={styles.muted}>QR 생성에 실패했습니다.</p>;
  if (!dataUrl) return <p className={styles.muted}>QR 생성 중...</p>;

  return (
    <div className={styles.wrap}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={dataUrl} alt="QR 코드" width={160} height={160} className={styles.image} />
      <a href={dataUrl} download={filename} className={styles.downloadLink}>
        PNG 다운로드
      </a>
    </div>
  );
}
