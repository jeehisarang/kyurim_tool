"use client";

import { useEffect, useState } from "react";
import styles from "./SurveyResponsePickerModal.module.css";
import { getSurveySubmittedAtLabel } from "@/lib/survey-response-format";

export type SurveyResponseCache = {
  id: number;
  respondentName: string;
  respondentPhone: string;
  rawDataJson: string;
  fetchedAt: string;
  linkedPrescriptionId: string | null;
};

export default function SurveyResponsePickerModal({
  onSelect,
  onClose,
}: {
  onSelect: (response: SurveyResponseCache) => void;
  onClose: () => void;
}) {
  const [responses, setResponses] = useState<SurveyResponseCache[] | null>(null);

  useEffect(() => {
    fetch("/api/survey-responses")
      .then((res) => res.json())
      .then(setResponses);
  }, []);

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <span className={styles.title}>구글폼 설문 응답에서 가져오기</span>
          <button type="button" className={styles.closeButton} onClick={onClose}>
            닫기
          </button>
        </div>

        {responses === null ? (
          <p className={styles.muted}>불러오는 중...</p>
        ) : responses.length === 0 ? (
          <p className={styles.muted}>캐시된 설문 응답이 없습니다.</p>
        ) : (
          <ul className={styles.list}>
            {responses.map((response) => (
              <li key={response.id} className={styles.item} onClick={() => onSelect(response)}>
                <span className={styles.itemName}>
                  {response.respondentName}
                  {response.linkedPrescriptionId && (
                    <span className={styles.linkedBadge}>연결됨</span>
                  )}
                </span>
                <span className={styles.itemMeta}>
                  {response.respondentPhone} · {getSurveySubmittedAtLabel(response.rawDataJson)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
