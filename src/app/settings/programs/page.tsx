"use client";

import { useEffect, useState } from "react";
import styles from "./page.module.css";
import BackButton from "@/components/BackButton";
import { useCurrentUserContext } from "@/lib/CurrentUserContext";

type Program = {
  id: number;
  name: string;
  type: string;
  splitIntervalDays: number | null;
  totalDurationDays: number | null;
  isActive: boolean;
};

const CYCLE_OPTIONS = [
  { value: 7, label: "1주" },
  { value: 14, label: "2주" },
  { value: 21, label: "3주" },
  { value: 28, label: "4주(1달)" },
] as const;

function cycleLabel(days: number | null): string {
  if (days === 7) return "1주";
  if (days === 14) return "2주";
  if (days === 21) return "3주";
  if (days === 28) return "4주";
  return days ? `${days}일` : "-";
}

function totalRounds(totalDurationDays: number | null, splitIntervalDays: number | null): string {
  if (!totalDurationDays || !splitIntervalDays) return "-";
  return `${Math.ceil(totalDurationDays / splitIntervalDays)}회`;
}

function durationWeeksLabel(totalDurationDays: number | null): string {
  return totalDurationDays ? `${Math.round(totalDurationDays / 7)}주` : "-";
}

/**
 * 치료처방(Program) 원장 전용 수동 등록 화면 — 검사연동/카테고리 지정은 이번
 * 범위 밖이라 명칭/총기간(주)/해피톡주기(1|2|3|4주) 3가지만 입력받는다. 서버단 재검증은
 * POST /api/programs가 isDirector로 처리하므로, 여기 클라이언트 체크는 UX 안내용일 뿐
 * (patients/[patientId] 페이지의 currentUser?.role==="원장" 조건 분기와 동일한 신뢰 모델).
 */
export default function ProgramSettingsPage() {
  const { currentUser } = useCurrentUserContext();
  const isDirector = currentUser?.role === "원장";

  const [programs, setPrograms] = useState<Program[] | null>(null);

  const [newName, setNewName] = useState("");
  const [newWeeks, setNewWeeks] = useState("");
  const [newCycle, setNewCycle] = useState<7 | 14 | 21 | 28>(14);
  const [addError, setAddError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    refresh();
  }, []);

  function refresh() {
    fetch("/api/programs?includeInactive=1")
      .then((res) => res.json())
      .then(setPrograms);
  }

  const weeksNumber = Number(newWeeks);
  const previewRounds =
    newWeeks.trim() && Number.isFinite(weeksNumber) && weeksNumber > 0
      ? Math.ceil((weeksNumber * 7) / newCycle)
      : null;

  async function submitProgram(confirmed: boolean) {
    if (!currentUser) return;
    const res = await fetch("/api/programs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        staffUserId: currentUser.id,
        name: newName.trim(),
        totalDurationWeeks: weeksNumber,
        splitIntervalDays: newCycle,
        confirmed,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      if (data.warning === "INACTIVE_NAME_CONFLICT" && window.confirm(data.error)) {
        await submitProgram(true);
        return;
      }
      setAddError(data.error ?? "프로그램 등록에 실패했습니다.");
      return;
    }
    setNewName("");
    setNewWeeks("");
    setNewCycle(14);
    refresh();
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setAddError(null);
    if (!newName.trim()) {
      setAddError("프로그램 명칭을 입력하세요.");
      return;
    }
    if (!Number.isFinite(weeksNumber) || weeksNumber <= 0) {
      setAddError("총 기간(주)을 입력하세요.");
      return;
    }
    setAdding(true);
    try {
      await submitProgram(false);
    } catch {
      setAddError("서버에 연결하지 못했습니다. 다시 시도해주세요.");
    } finally {
      setAdding(false);
    }
  }

  async function toggleActive(p: Program) {
    const action = p.isActive ? "비활성화" : "활성화";
    if (!window.confirm(`"${p.name}" 프로그램을 ${action}하시겠습니까?`)) return;
    try {
      const res = await fetch(`/api/programs/${p.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ staffUserId: currentUser?.id, isActive: !p.isActive }),
      });
      if (!res.ok) {
        alert("처리에 실패했습니다. 다시 시도해주세요.");
        return;
      }
      refresh();
    } catch {
      alert("서버에 연결하지 못했습니다. 다시 시도해주세요.");
    }
  }

  return (
    <div className={styles.container}>
      <div className={styles.titleRow}>
        <BackButton />
        <h1 className={styles.pageTitle}>프로그램 관리</h1>
      </div>
      <p className={styles.muted}>
        치료처방 등록(/prescriptions/new)에서 선택하는 프로그램 목록입니다. 검사연동/카테고리
        분류가 필요 없는 단순 프로그램(명칭/총기간/해피톡주기)만 이 화면에서 바로 등록할 수
        있고, 등록 후에는 미분류("기타")로 노출됩니다.
      </p>

      <div className={styles.section}>
        <div className={styles.sectionTitle}>새 프로그램 등록</div>
        {!isDirector && <p className={styles.errorText}>원장만 프로그램을 등록할 수 있습니다.</p>}
        <form className={styles.formGrid} onSubmit={handleAdd}>
          <label className={styles.fieldLabel}>
            프로그램 명칭
            <input
              type="text"
              placeholder="예: 강근단"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              disabled={!isDirector}
            />
          </label>
          <label className={styles.fieldLabel}>
            총 기간(주)
            <input
              type="number"
              min={1}
              placeholder="예: 6"
              value={newWeeks}
              onChange={(e) => setNewWeeks(e.target.value)}
              disabled={!isDirector}
            />
          </label>
          <div className={styles.fieldLabel}>
            해피톡 주기
            <div className={styles.radioRow}>
              {CYCLE_OPTIONS.map((opt) => (
                <label key={opt.value} className={styles.radioOption}>
                  <input
                    type="radio"
                    name="cycle"
                    checked={newCycle === opt.value}
                    onChange={() => setNewCycle(opt.value)}
                    disabled={!isDirector}
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          </div>
          {previewRounds !== null && (
            <p className={styles.previewText}>예상 총회차: {previewRounds}회</p>
          )}
          <button type="submit" disabled={!isDirector || adding}>
            {adding ? "등록 중..." : "등록"}
          </button>
        </form>
        {addError && <p className={styles.errorText}>{addError}</p>}
      </div>

      <div className={styles.section}>
        <div className={styles.sectionTitle}>프로그램 목록 ({programs?.length ?? 0}건)</div>
        {programs === null ? (
          <p className={styles.muted}>불러오는 중...</p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>이름</th>
                <th>총 기간</th>
                <th>해피톡 주기</th>
                <th>총회차</th>
                <th>상태</th>
              </tr>
            </thead>
            <tbody>
              {programs.map((p) => (
                <tr key={p.id} className={p.isActive ? undefined : styles.inactiveRow}>
                  <td>{p.name}</td>
                  <td>{durationWeeksLabel(p.totalDurationDays)}</td>
                  <td>{cycleLabel(p.splitIntervalDays)}</td>
                  <td>{totalRounds(p.totalDurationDays, p.splitIntervalDays)}</td>
                  <td>
                    <button
                      type="button"
                      className={p.isActive ? styles.statusActive : styles.statusInactive}
                      onClick={() => toggleActive(p)}
                      disabled={!isDirector}
                      title={isDirector ? `클릭하여 ${p.isActive ? "비활성화" : "활성화"}` : "원장만 변경할 수 있습니다."}
                    >
                      {p.isActive ? "활성" : "비활성"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
