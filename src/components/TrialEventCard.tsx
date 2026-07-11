"use client";

import { useEffect, useState } from "react";
import styles from "@/app/messages/page.module.css";
import cardStyles from "./TrialEventCard.module.css";
import SealStamp from "@/components/SealStamp";
import { getCurrentUserId } from "@/lib/currentUser";
import { copyToClipboard } from "@/lib/clipboard";
import { TRIAL_TASK_TYPE_LABEL } from "@/lib/message-templates";

type TrialTaskType = "TRIAL_WELCOME" | "TRIAL_DAY2" | "TRIAL_DEADLINE";

type ProgramEventDetail = {
  todoTaskId: number;
  taskType: TrialTaskType;
  patient: { id: number; name: string; chartNumber: string };
  program: { name: string };
  surveyDataJson: string | null;
  sentDate: string | null;
  staffUser: { id: number; name: string } | null;
  skippedAt: string | null;
  patientMessage: string | null;
  internalAnalysis: string | null;
};

/**
 * 킬팻캡슐 3일체험 등 프로그램 이벤트(TRIAL_*) 톡 1건 전용 카드.
 * 기존 5종 톡(messages/page.tsx)의 patientId 기반 목록 흐름과는 별개로,
 * /todo의 "톡생성 하기"에서 todoTaskId로 바로 진입한다.
 */
export default function TrialEventCard({ todoTaskId }: { todoTaskId: number }) {
  const [detail, setDetail] = useState<ProgramEventDetail | null>(null);
  const [patientMessage, setPatientMessage] = useState("");
  const [internalAnalysis, setInternalAnalysis] = useState("");
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [stampKey, setStampKey] = useState(0);

  useEffect(() => {
    fetch(`/api/program-events/${todoTaskId}`)
      .then((res) => res.json())
      .then((data: ProgramEventDetail) => {
        setDetail(data);
        setPatientMessage(data.patientMessage ?? "");
        setInternalAnalysis(data.internalAnalysis ?? "");
      });
  }, [todoTaskId]);

  async function handleGenerate() {
    setGenerating(true);
    setGenerateError(null);
    try {
      const res = await fetch("/api/program-events/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ todoTaskId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setGenerateError(data.error ?? "문구 생성에 실패했습니다.");
        return;
      }
      setPatientMessage(data.patientMessage);
      setInternalAnalysis(data.internalAnalysis);
    } catch {
      setGenerateError("서버에 연결하지 못했습니다. 다시 시도해주세요.");
    } finally {
      setGenerating(false);
    }
  }

  async function handleCopy() {
    if (!patientMessage) return;
    const success = await copyToClipboard(patientMessage);
    if (!success) {
      alert("복사에 실패했습니다. 텍스트를 직접 선택해서 복사해주세요.");
      return;
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function handleConfirm() {
    const staffUserId = getCurrentUserId();
    if (!staffUserId) {
      alert("상단에서 현재 사용자를 먼저 선택하세요.");
      return;
    }

    try {
      const res = await fetch(`/api/todo-tasks/${todoTaskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ doneByUserId: staffUserId, action: "DONE", patientMessage, internalAnalysis }),
      });
      if (!res.ok) {
        alert("완료 처리에 실패했습니다. 다시 시도해주세요.");
        return;
      }
      setStampKey((k) => k + 1);
      const detailRes = await fetch(`/api/program-events/${todoTaskId}`);
      setDetail(await detailRes.json());
    } catch {
      alert("서버에 연결하지 못했습니다. 완료 처리되지 않았으니 다시 시도해주세요.");
    }
  }

  if (!detail) return null;

  return (
    <div className={styles.messageCard}>
      <div className={styles.messageHeader}>
        <span className={styles.messageTypeLabel}>
          {TRIAL_TASK_TYPE_LABEL[detail.taskType]} · {detail.patient.name}님 ({detail.program.name})
        </span>
        <span className={detail.sentDate ? styles.sentBadge : styles.unsentBadge}>
          {detail.sentDate ? `발송함 (${detail.staffUser?.name ?? "-"})` : "발송안함"}
        </span>
      </div>

      {generateError && <p className={styles.errorText}>{generateError}</p>}

      <textarea
        className={styles.messageTextarea}
        value={patientMessage}
        onChange={(e) => setPatientMessage(e.target.value)}
        placeholder="문구 생성 버튼을 눌러주세요."
        rows={3}
      />

      {/* 원장용 내부분석 — 복사 버튼 없이 원장만 보는 용도로 구분 표시 */}
      <div className={styles.notesBlock}>
        <div className={cardStyles.internalAnalysisLabel}>원장용 메모 (환자에게 발송되지 않음)</div>
        <textarea
          className={cardStyles.internalAnalysisTextarea}
          value={internalAnalysis}
          onChange={(e) => setInternalAnalysis(e.target.value)}
          placeholder="문구 생성 시 함께 채워집니다."
          rows={2}
        />
      </div>

      <div className={styles.messageActions}>
        <button
          type="button"
          className={styles.actionButton}
          onClick={handleGenerate}
          disabled={generating}
        >
          {generating ? "생성 중..." : "문구 생성"}
        </button>
        <button
          type="button"
          className={styles.actionButton}
          onClick={handleCopy}
          disabled={!patientMessage}
        >
          {copied ? "복사됨" : "복사"}
        </button>
        <span className={styles.submitWrap}>
          <button type="button" className={styles.confirmButton} onClick={handleConfirm}>
            발송확인
          </button>
          {stampKey > 0 && <SealStamp key={stampKey} />}
        </span>
      </div>
    </div>
  );
}
