"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "./ProgramTeachingCreator.module.css";
import { getCurrentUserId } from "@/lib/currentUser";
import { copyToClipboard } from "@/lib/clipboard";

type ProgramTeaching = {
  id: number;
  programName: string;
  targetSymptomKeywords: string | null;
  linkedTestType: "BODY_COMPOSITION" | "STRENGTH_TEST" | null;
};

type CreatedPage = {
  id: number;
  token: string;
  headline: string;
  personalSubtopic: string;
  bodyText: string;
  examSummary: string | null;
  academicHook: string;
  programName: string;
  testValueSummary: string | null;
  supportImagePath: string | null;
};

type ActivePrescription = { program: { name: string } };

// 치료처방(Program)과 티칭지(ProgramTeaching)는 별도 테이블이라 FK로 연결되지 않고 이름도
// 정확히 일치하지 않는 경우가 흔하다(예: 처방명 "S환" ↔ 티칭지명 "규림S환 다이어트").
// 완전 일치만 검사하면 실사용 데이터에서 거의 항상 매칭에 실패해 확인창이 매번 뜨거나(과다
// 경고) 반대로 전혀 안 뜨는(무의미) 문제가 생겨, 한쪽이 다른 쪽 이름을 포함하는지로 느슨하게
// 비교한다.
function isRelatedProgramName(prescriptionProgramName: string, teachingProgramName: string): boolean {
  return (
    teachingProgramName.includes(prescriptionProgramName) ||
    prescriptionProgramName.includes(teachingProgramName)
  );
}

/**
 * 톡 생성 화면(TalkStudioPanel)에서 환자 선택 후 노출되는 "프로그램 티칭지 만들기"
 * 플로우(14-2, 프로그램 중심) — 프로그램 선택 → (검사연결 프로그램이면 검사이력 확인) →
 * AI 개인화 문구 생성 → 링크 발급/복사까지 완결된다. 자동 발송은 하지 않는다.
 *
 * 실사용 중 발견: 환자가 이미 진행 중인 프로그램과 무관한 다른 프로그램을 실수로 선택해
 * 티칭지를 생성한 사례가 있어(김경자님 케이스), 진행 중 프로그램을 목록 상단에 배지로
 * 우선 노출하고, 다른 프로그램을 선택하면 생성 전에 확인 문구를 거치도록 한다.
 */
export default function ProgramTeachingCreator({
  patientId,
  defaultOpen = false,
  onCreated,
}: {
  patientId: number;
  // 공유링크 패널(14-11)의 "새로 만들기" 인라인 슬롯에 끼워 넣을 때, 자체 토글 버튼을 다시
  // 누르게 하지 않고 바로 펼쳐진 상태로 시작하기 위한 옵션 — 기존 TalkStudioPanel 단독
  // 임베드(닫힌 채로 시작)는 그대로 유지된다.
  defaultOpen?: boolean;
  // 생성 완료 시 호출 — 공유링크 패널이 방금 만든 티칭지를 드롭다운에 자동 선택하는 데 쓴다.
  onCreated?: (page: { id: number; token: string; programName: string }) => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [programs, setPrograms] = useState<ProgramTeaching[] | null>(null);
  const [activePrescriptions, setActivePrescriptions] = useState<ActivePrescription[] | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [confirmTargetName, setConfirmTargetName] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [needsExamNotice, setNeedsExamNotice] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedPage | null>(null);
  const [copied, setCopied] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [editing, setEditing] = useState(false);
  const [editHeadline, setEditHeadline] = useState("");
  const [editPersonalSubtopic, setEditPersonalSubtopic] = useState("");
  const [editBodyText, setEditBodyText] = useState("");
  const [editExamSummary, setEditExamSummary] = useState("");
  const [editAcademicHook, setEditAcademicHook] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || programs !== null) return;
    fetch("/api/program-teaching?activeOnly=1")
      .then((res) => res.json())
      .then(setPrograms);
  }, [open, programs]);

  useEffect(() => {
    if (!open || activePrescriptions !== null) return;
    fetch(`/api/prescriptions?patientId=${patientId}&status=ACTIVE`)
      .then((res) => res.json())
      .then(setActivePrescriptions);
  }, [open, activePrescriptions, patientId]);

  const activeProgramNames = useMemo(
    () => (activePrescriptions ?? []).map((p) => p.program.name),
    [activePrescriptions],
  );

  function isProgramActive(teachingProgramName: string): boolean {
    return activeProgramNames.some((name) => isRelatedProgramName(name, teachingProgramName));
  }

  // 진행 중인 프로그램(있으면)을 목록 상단으로 우선 노출.
  const sortedPrograms = useMemo(() => {
    if (!programs) return programs;
    if (activeProgramNames.length === 0) return programs;
    return [...programs].sort((a, b) => {
      const aActive = isProgramActive(a.programName) ? 0 : 1;
      const bActive = isProgramActive(b.programName) ? 0 : 1;
      return aActive - bActive;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [programs, activeProgramNames]);

  const selectedProgram = useMemo(
    () => programs?.find((p) => p.id === selectedId) ?? null,
    [programs, selectedId],
  );

  function reset() {
    setSelectedId(null);
    setConfirmTargetName(null);
    setCreated(null);
    setGenerateError(null);
    setNeedsExamNotice(null);
    setEditing(false);
    setEditError(null);
    setDeleteError(null);
  }

  function toggleOpen() {
    setOpen((prev) => !prev);
    reset();
  }

  function selectProgram(id: number) {
    setSelectedId(id);
    setConfirmTargetName(null);
    setGenerateError(null);
    setNeedsExamNotice(null);
  }

  // 진행 중인 프로그램이 있는데 그와 다른 프로그램을 선택했으면, 바로 생성하지 않고
  // 확인 문구를 먼저 띄운다(task.md 배경의 실수 방지 목적).
  function handleGenerateClick() {
    if (!selectedProgram) return;
    if (activeProgramNames.length > 0 && !isProgramActive(selectedProgram.programName)) {
      setConfirmTargetName(selectedProgram.programName);
      return;
    }
    handleCreate();
  }

  async function handleCreate() {
    if (!selectedId) return;
    const createdByStaffId = getCurrentUserId();
    if (!createdByStaffId) {
      setGenerateError("상단에서 현재 사용자를 먼저 선택하세요.");
      return;
    }
    setConfirmTargetName(null);
    setGenerating(true);
    setGenerateError(null);
    setNeedsExamNotice(null);
    try {
      const res = await fetch("/api/teaching-pages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patientId, programTeachingId: selectedId, createdByStaffId }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.needsExam) {
          setNeedsExamNotice(data.error);
        } else {
          setGenerateError(data.error ?? "티칭지 생성에 실패했습니다.");
        }
        return;
      }
      setCreated(data);
      onCreated?.({ id: data.id, token: data.token, programName: data.programName });
    } catch {
      setGenerateError("서버에 연결하지 못했습니다. 다시 시도해주세요.");
    } finally {
      setGenerating(false);
    }
  }

  async function handleCopyLink() {
    if (!created) return;
    const url = `${window.location.origin}/p/${created.token}`;
    const success = await copyToClipboard(url);
    if (!success) {
      alert("복사에 실패했습니다. 링크를 직접 선택해서 복사해주세요.");
      return;
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  // 소프트삭제(task.md) — 완전삭제가 아니라 isActive만 내린다. 이미 발송된 링크는 이후에도
  // 계속 정상 렌더링되므로("이미 발송된 링크는 계속 유효합니다"), 확인창에서 그 점을 안내한다.
  async function handleDelete() {
    if (!created) return;
    if (!confirm("이 티칭지를 목록에서 삭제하시겠어요? 이미 발송된 링크는 계속 유효합니다.")) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/teaching-pages/${created.token}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        setDeleteError(data.error ?? "삭제에 실패했습니다.");
        return;
      }
      reset();
    } catch {
      setDeleteError("서버에 연결하지 못했습니다. 다시 시도해주세요.");
    } finally {
      setDeleting(false);
    }
  }

  function startEdit() {
    if (!created) return;
    setEditHeadline(created.headline);
    setEditPersonalSubtopic(created.personalSubtopic);
    setEditBodyText(created.bodyText);
    setEditExamSummary(created.examSummary ?? "");
    setEditAcademicHook(created.academicHook);
    setEditError(null);
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
    setEditError(null);
  }

  async function saveEdit() {
    if (!created) return;
    if (!editHeadline.trim() || !editPersonalSubtopic.trim() || !editBodyText.trim() || !editAcademicHook.trim()) {
      setEditError("모든 항목을 입력하세요.");
      return;
    }
    setEditSaving(true);
    setEditError(null);
    try {
      const res = await fetch(`/api/teaching-pages/${created.token}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          headline: editHeadline,
          personalSubtopic: editPersonalSubtopic,
          bodyText: editBodyText,
          ...(created.examSummary !== null ? { examSummary: editExamSummary } : {}),
          academicHook: editAcademicHook,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setEditError(data.error ?? "저장에 실패했습니다.");
        return;
      }
      setCreated({
        ...created,
        headline: data.headline,
        personalSubtopic: data.personalSubtopic,
        bodyText: data.bodyText,
        examSummary: data.examSummary,
        academicHook: data.academicHook,
      });
      setEditing(false);
    } catch {
      setEditError("서버에 연결하지 못했습니다. 저장되지 않았으니 다시 시도해주세요.");
    } finally {
      setEditSaving(false);
    }
  }

  return (
    <div className={styles.wrap}>
      <button type="button" className={styles.toggleButton} onClick={toggleOpen}>
        {open ? "프로그램 티칭지 만들기 닫기" : "프로그램 티칭지 만들기"}
      </button>

      {open && (
        <div className={styles.panel}>
          {!created && (
            <>
              <div className={styles.sectionLabel}>프로그램 선택</div>

              {sortedPrograms === null ? (
                <p className={styles.muted}>불러오는 중...</p>
              ) : sortedPrograms.length === 0 ? (
                <p className={styles.muted}>
                  등록된 프로그램이 없습니다. 설정 &gt; 프로그램 티칭 관리에서 먼저 등록하세요.
                </p>
              ) : (
                <ul className={styles.resultList}>
                  {sortedPrograms.map((p) => (
                    <li
                      key={p.id}
                      className={selectedId === p.id ? styles.resultItemActive : styles.resultItem}
                      onClick={() => selectProgram(p.id)}
                    >
                      {isProgramActive(p.programName) && (
                        <span className={styles.activeBadge}>현재 진행 중</span>
                      )}
                      <span>{p.programName}</span>
                      {p.targetSymptomKeywords && (
                        <span className={styles.resultKeywords}>{p.targetSymptomKeywords}</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              {needsExamNotice && <p className={styles.noticeText}>{needsExamNotice}</p>}
              {generateError && <p className={styles.errorText}>{generateError}</p>}

              {confirmTargetName ? (
                <div className={styles.confirmBox}>
                  <p>
                    이 환자는 현재 [{activeProgramNames.join(", ")}]을 진행 중입니다. [
                    {confirmTargetName}] 티칭지를 만드시겠습니까?
                  </p>
                  <div className={styles.confirmActions}>
                    <button type="button" className={styles.generateButton} onClick={handleCreate}>
                      예, 계속
                    </button>
                    <button
                      type="button"
                      className={styles.resetButton}
                      onClick={() => setConfirmTargetName(null)}
                    >
                      취소
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  className={styles.generateButton}
                  onClick={handleGenerateClick}
                  disabled={!selectedProgram || generating}
                >
                  {generating ? "생성 중..." : "선택 확정 및 티칭지 생성"}
                </button>
              )}
            </>
          )}

          {created && !editing && (
            <div className={styles.previewBox}>
              <div className={styles.sectionLabel}>{created.programName} — 티칭지 생성 완료</div>
              {created.testValueSummary && (
                <p className={styles.testValueText}>검사수치: {created.testValueSummary}</p>
              )}
              <p className={styles.previewText}>
                <strong>{created.headline}</strong>
                <br />
                {created.personalSubtopic}
              </p>
              <p className={styles.previewText}>{created.bodyText}</p>
              {created.examSummary && <p className={styles.previewText}>{created.examSummary}</p>}
              <p className={styles.previewText}>{created.academicHook}</p>
              {created.supportImagePath && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={created.supportImagePath} alt="" className={styles.thumbnail} />
              )}
              {deleteError && <p className={styles.errorText}>{deleteError}</p>}

              <div className={styles.previewActions}>
                <button type="button" className={styles.generateButton} onClick={handleCopyLink}>
                  {copied ? "링크 복사됨" : "링크 복사"}
                </button>
                <button type="button" className={styles.resetButton} onClick={startEdit}>
                  수정
                </button>
                <button type="button" className={styles.resetButton} onClick={reset}>
                  다른 프로그램으로 새로 만들기
                </button>
                <button
                  type="button"
                  className={styles.resetButton}
                  onClick={handleDelete}
                  disabled={deleting}
                >
                  {deleting ? "삭제 중..." : "삭제"}
                </button>
              </div>
            </div>
          )}

          {created && editing && (
            <div className={styles.previewBox}>
              <div className={styles.sectionLabel}>{created.programName} — 티칭지 수정</div>
              <label className={styles.editLabel}>
                headline
                <textarea
                  className={styles.editTextarea}
                  rows={1}
                  value={editHeadline}
                  onChange={(e) => setEditHeadline(e.target.value)}
                />
              </label>
              <label className={styles.editLabel}>
                personalSubtopic
                <textarea
                  className={styles.editTextarea}
                  rows={2}
                  value={editPersonalSubtopic}
                  onChange={(e) => setEditPersonalSubtopic(e.target.value)}
                />
              </label>
              <label className={styles.editLabel}>
                bodyText
                <textarea
                  className={styles.editTextarea}
                  rows={4}
                  value={editBodyText}
                  onChange={(e) => setEditBodyText(e.target.value)}
                />
              </label>
              {created.examSummary !== null && (
                <label className={styles.editLabel}>
                  examSummary
                  <textarea
                    className={styles.editTextarea}
                    rows={2}
                    value={editExamSummary}
                    onChange={(e) => setEditExamSummary(e.target.value)}
                  />
                </label>
              )}
              <label className={styles.editLabel}>
                academicHook
                <textarea
                  className={styles.editTextarea}
                  rows={3}
                  value={editAcademicHook}
                  onChange={(e) => setEditAcademicHook(e.target.value)}
                />
              </label>

              {editError && <p className={styles.errorText}>{editError}</p>}

              <div className={styles.previewActions}>
                <button
                  type="button"
                  className={styles.generateButton}
                  onClick={saveEdit}
                  disabled={editSaving}
                >
                  저장
                </button>
                <button type="button" className={styles.resetButton} onClick={cancelEdit}>
                  취소
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
