"use client";

import { useEffect, useState } from "react";
import styles from "./HrvImportModal.module.css";

export type HrvDriveFile = {
  id: string;
  name: string;
  modifiedTime: string | null;
  thumbnailLink: string | null;
  matchedPatient: { id: number; name: string; chartNumber: string } | null;
};

function formatModifiedTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/**
 * HRV 결과지 구글드라이브 가져오기 모달(task2.md) — SurveyResponsePickerModal과 동일한
 * "목록에서 클릭해 선택" UX 패턴 재사용. 폴더 미설정(원장님 공유 절차 전) 상태를 별도
 * 안내 문구로 구분해서 보여준다.
 */
export default function HrvImportModal({
  onSelect,
  onClose,
}: {
  onSelect: (file: HrvDriveFile) => void;
  onClose: () => void;
}) {
  const [files, setFiles] = useState<HrvDriveFile[] | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/hrv/drive-files")
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) {
          setErrorMessage(data.error ?? "구글드라이브 폴더 조회에 실패했습니다.");
          return;
        }
        setFiles(data);
      })
      .catch(() => setErrorMessage("서버에 연결하지 못했습니다."));
  }, []);

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <span className={styles.title}>HRV 결과지 가져오기</span>
          <button type="button" className={styles.closeButton} onClick={onClose}>
            닫기
          </button>
        </div>

        {errorMessage && <p className={styles.errorText}>{errorMessage}</p>}

        {!errorMessage && files === null && <p className={styles.muted}>불러오는 중...</p>}

        {!errorMessage && files !== null && files.length === 0 && (
          <p className={styles.muted}>폴더에 결과지 파일이 없습니다.</p>
        )}

        {!errorMessage && files !== null && files.length > 0 && (
          <ul className={styles.list}>
            {files.map((file) => (
              <li key={file.id} className={styles.item} onClick={() => onSelect(file)}>
                <span className={styles.itemName}>
                  {file.name}
                  {file.matchedPatient ? (
                    <span className={styles.matchedBadge}>
                      {file.matchedPatient.name} ({file.matchedPatient.chartNumber})
                    </span>
                  ) : (
                    <span className={styles.unmatchedBadge}>환자 매칭 안 됨</span>
                  )}
                </span>
                <span className={styles.itemMeta}>{formatModifiedTime(file.modifiedTime)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
