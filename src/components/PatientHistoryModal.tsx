"use client";

import { useEffect, useState } from "react";
import styles from "./PatientHistoryModal.module.css";
import { TALK_MESSAGE_TYPE_LABEL } from "@/lib/message-templates";

type StaffUser = { id: number; name: string; role: string };
type MessageStatus = {
  messageType: "WELCOME" | "MEETING" | "DAY2" | "DAY7" | "THIRD_VISIT";
  sentDate: string | null;
  staffUser: StaffUser | null;
  skippedAt: string | null;
  skippedByUser: StaffUser | null;
};

const MESSAGE_TYPE_LABEL: Record<MessageStatus["messageType"], string> = {
  WELCOME: "웰컴 메시지",
  MEETING: "상담예정 안내",
  ...TALK_MESSAGE_TYPE_LABEL,
};

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()} ${d
    .getHours()
    .toString()
    .padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
}

export default function PatientHistoryModal({
  patientId,
  patientName,
  onClose,
}: {
  patientId: number;
  patientName: string;
  onClose: () => void;
}) {
  const [statuses, setStatuses] = useState<MessageStatus[] | null>(null);

  useEffect(() => {
    fetch(`/api/messages?patientId=${patientId}`)
      .then((res) => res.json())
      .then(setStatuses);
  }, [patientId]);

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <span className={styles.title}>{patientName}님 발송 이력</span>
          <button type="button" className={styles.closeButton} onClick={onClose}>
            닫기
          </button>
        </div>

        {statuses === null ? (
          <p className={styles.muted}>불러오는 중...</p>
        ) : (
          <ul className={styles.list}>
            {statuses.map((status) => (
              <li key={status.messageType} className={styles.item}>
                <span className={styles.itemType}>{MESSAGE_TYPE_LABEL[status.messageType]}</span>
                {status.sentDate ? (
                  <span className={styles.sentBadge}>
                    발송함 · {formatDateTime(status.sentDate)} ({status.staffUser?.name ?? "-"})
                  </span>
                ) : status.skippedAt ? (
                  <span className={styles.skippedBadge}>
                    보류됨 · {formatDateTime(status.skippedAt)} ({status.skippedByUser?.name ?? "-"})
                  </span>
                ) : (
                  <span className={styles.unsentBadge}>발송안함</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
