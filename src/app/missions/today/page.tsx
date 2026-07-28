"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import styles from "./page.module.css";
import BackButton from "@/components/BackButton";
import { copyToClipboard } from "@/lib/clipboard";
import { useCurrentUserContext } from "@/lib/CurrentUserContext";

type MissionTemplate = {
  id: number;
  type: string;
  category: string;
  title: string;
  body: string;
  rewardAmount: number;
};

type Submission = {
  id: number;
  patientId: number;
  token: string;
  status: string;
  patient: { id: number; name: string; chartNumber: string };
};

type Assignment = {
  id: number;
  date: string;
  missionTemplate: MissionTemplate;
  introPhrase: { id: number; text: string } | null;
  submissions: Submission[];
};

type KillCapPatient = { patientId: number; patientName: string; chartNumber: string; programName: string };

type GeneratedMessage = { patientId: number; patientName: string; message: string; token: string };

const TYPE_LABEL: Record<string, string> = { QUIZ: "퀴즈", PHOTO: "사진", TEXT: "텍스트" };

function todayParam(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * 오늘의 미션 발송(/missions/today, task.md 3-3 + task2.md 문구 생성) — 상단: 오늘 지정된
 * 미션 미리보기(없으면 뱅크에서 선택). 하단: 킬팻캡슐 진행중 환자 리스트 + 환자별 "문구
 * 생성"(서두문구+미션요약+제출링크 조합, 생성 자체가 발송 준비 완료 처리를 겸함).
 */
export default function MissionsTodayPage() {
  const { currentUser } = useCurrentUserContext();
  const [assignment, setAssignment] = useState<Assignment | null | undefined>(undefined);
  const [killCapPatients, setKillCapPatients] = useState<KillCapPatient[]>([]);
  const [activeTemplates, setActiveTemplates] = useState<MissionTemplate[]>([]);
  const [pickerTemplateId, setPickerTemplateId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatingPatientId, setGeneratingPatientId] = useState<number | null>(null);
  const [generatedMessage, setGeneratedMessage] = useState<GeneratedMessage | null>(null);
  const [copied, setCopied] = useState(false);

  function load() {
    fetch(`/api/missions/today?date=${todayParam()}`)
      .then((res) => res.json())
      .then((data) => {
        setAssignment(data.assignment);
        setKillCapPatients(data.killCapPatients);
        setActiveTemplates(data.activeTemplates);
      });
  }

  useEffect(() => {
    load();
  }, []);

  async function handlePickMission(e: React.FormEvent) {
    e.preventDefault();
    if (!currentUser || !pickerTemplateId) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/missions/today", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          staffUserId: currentUser.id,
          date: todayParam(),
          missionTemplateId: Number(pickerTemplateId),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "미션 지정에 실패했습니다.");
        return;
      }
      load();
    } catch {
      setError("서버에 연결하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  async function handleGenerateMessage(patientId: number, patientName: string) {
    setGeneratingPatientId(patientId);
    setCopied(false);
    try {
      const res = await fetch(`/api/missions/today/message/${patientId}`);
      const data = await res.json();
      if (!res.ok) {
        alert(data.error ?? "문구 생성에 실패했습니다.");
        return;
      }
      setGeneratedMessage({ patientId, patientName, message: data.message, token: data.token });
      load();
    } catch {
      alert("서버에 연결하지 못했습니다.");
    } finally {
      setGeneratingPatientId(null);
    }
  }

  async function handleCopyMessage() {
    if (!generatedMessage) return;
    const success = await copyToClipboard(generatedMessage.message);
    if (!success) {
      alert("복사에 실패했습니다. 직접 선택해서 복사해주세요.");
      return;
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const submissionByPatientId = new Map((assignment?.submissions ?? []).map((s) => [s.patientId, s]));

  return (
    <div className={styles.container}>
      <div className={styles.titleRow}>
        <BackButton />
        <h1 className={styles.pageTitle}>오늘의 미션 발송</h1>
      </div>
      <p className={styles.muted}>킬팻캡슐 진행중 환자 대상 — 카톡 발송은 직접, 문구는 여기서 생성.</p>

      <div className={styles.section}>
        <Link href="/missions/approvals" className={styles.smallButton}>
          승인 대기 큐 →
        </Link>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionTitle}>오늘의 미션</div>
        {assignment === undefined ? (
          <p className={styles.muted}>불러오는 중...</p>
        ) : assignment ? (
          <>
            {assignment.introPhrase && (
              <div className={styles.introPhraseBox}>💬 {assignment.introPhrase.text}</div>
            )}
            <div className={styles.missionPreview}>
              <div className={styles.missionPreviewTitle}>
                [{TYPE_LABEL[assignment.missionTemplate.type] ?? assignment.missionTemplate.type}]{" "}
                {assignment.missionTemplate.title}
              </div>
              <div className={styles.missionPreviewBody}>{assignment.missionTemplate.body}</div>
            </div>
            <button
              type="button"
              className={styles.smallButton}
              onClick={() => setAssignment(null)}
            >
              다른 미션으로 변경
            </button>
          </>
        ) : (
          <form onSubmit={handlePickMission}>
            <select
              className={styles.select}
              value={pickerTemplateId}
              onChange={(e) => setPickerTemplateId(e.target.value)}
            >
              <option value="">미션을 선택하세요</option>
              {activeTemplates.map((t) => (
                <option key={t.id} value={t.id}>
                  [{TYPE_LABEL[t.type] ?? t.type}] {t.title}
                </option>
              ))}
            </select>
            {error && <p className={styles.errorText}>{error}</p>}
            <button type="submit" className={styles.primaryButton} disabled={!pickerTemplateId || saving}>
              {saving ? "지정 중..." : "오늘의 미션으로 지정"}
            </button>
          </form>
        )}
      </div>

      {generatedMessage && (
        <div className={styles.section}>
          <div className={styles.sectionTitle}>{generatedMessage.patientName}님 발송문구</div>
          <div className={styles.missionPreview}>
            <div className={styles.missionPreviewBody} style={{ whiteSpace: "pre-wrap" }}>
              {generatedMessage.message}
            </div>
          </div>
          <button type="button" className={styles.primaryButton} onClick={handleCopyMessage}>
            {copied ? "복사됨!" : "복사"}
          </button>
        </div>
      )}

      <div className={styles.section}>
        <div className={styles.sectionTitle}>킬팻캡슐 진행중 환자 ({killCapPatients.length}명)</div>
        {killCapPatients.length === 0 ? (
          <p className={styles.muted}>진행중인 킬팻캡슐 환자가 없습니다.</p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>환자</th>
                <th>프로그램</th>
                <th>발송상태</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {killCapPatients.map((p) => {
                const submission = submissionByPatientId.get(p.patientId);
                return (
                  <tr key={p.patientId}>
                    <td>
                      {p.patientName} (<span className={styles.mono}>{p.chartNumber}</span>)
                    </td>
                    <td>{p.programName}</td>
                    <td>{submission ? "발송됨" : "미발송"}</td>
                    <td>
                      {!assignment ? null : (
                        <button
                          type="button"
                          className={styles.smallButton}
                          disabled={generatingPatientId === p.patientId}
                          onClick={() => handleGenerateMessage(p.patientId, p.patientName)}
                        >
                          {generatingPatientId === p.patientId
                            ? "생성 중..."
                            : submission
                              ? "문구 다시 보기"
                              : "문구 생성"}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
