"use client";

import { useEffect, useState } from "react";
import styles from "./page.module.css";
import { useCurrentUserContext } from "@/lib/CurrentUserContext";
import CurrentUserSelector from "@/components/CurrentUserSelector";
import { copyToClipboard } from "@/lib/clipboard";

type Patient = { id: number; chartNumber: string; name: string };
type ConsultationType = { id: number; name: string };
type ConsultationNote = {
  id: number;
  visitDate: string;
  rawText: string;
  convertedChartText: string | null;
  consultationType: { id: number; name: string };
  createdByStaff: { id: number; name: string };
  updatedAt: string;
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`;
}

function toDateInputValue(iso: string): string {
  return iso.slice(0, 10);
}

/**
 * 원장 상담모드(14-5) — 독립창(사이드바 없음, 새 탭으로 열림). 환자를 바꿔가며 이력 참고 +
 * 새 상담 기입 + (필요시) AI 차팅변환까지 한 화면에서 처리한다. 원장 전용이지만 이 앱에는
 * 로그인 시스템이 없어(localStorage "현재 사용자" 선택뿐) 서버단 403은 API에서, 여기서는
 * "가벼운 실수 방지" 수준의 역할 가드만 건다(Sidebar 설정 메뉴와 동일 원칙).
 */
export default function ConsultModePage() {
  const { currentUser, loaded } = useCurrentUserContext();
  const isDirector = currentUser?.role === "원장";

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Patient[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);

  const [types, setTypes] = useState<ConsultationType[] | null>(null);
  const [notes, setNotes] = useState<ConsultationNote[] | null>(null);

  const [selectedTypeId, setSelectedTypeId] = useState("");
  const [rawText, setRawText] = useState("");
  const [convertedText, setConvertedText] = useState("");
  const [converting, setConverting] = useState(false);
  const [convertError, setConvertError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [editingNoteId, setEditingNoteId] = useState<number | null>(null);
  const [editVisitDate, setEditVisitDate] = useState("");
  const [editRawText, setEditRawText] = useState("");
  const [editConvertedText, setEditConvertedText] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [deletingNoteId, setDeletingNoteId] = useState<number | null>(null);

  useEffect(() => {
    if (!isDirector) return;
    fetch("/api/consultation-types?activeOnly=1")
      .then((res) => res.json())
      .then((rows: ConsultationType[]) => {
        setTypes(rows);
        setSelectedTypeId((prev) => prev || (rows.length > 0 ? String(rows[0].id) : ""));
      });
  }, [isDirector]);

  useEffect(() => {
    if (!selectedPatient) {
      setNotes(null);
      return;
    }
    refreshNotes(selectedPatient.id);
  }, [selectedPatient]);

  function refreshNotes(patientId: number) {
    fetch(`/api/consultation-notes?patientId=${patientId}`)
      .then((res) => res.json())
      .then(setNotes);
  }

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    try {
      const res = await fetch(`/api/patients?q=${encodeURIComponent(query.trim())}`);
      const data: Patient[] = await res.json();
      setResults(data);
    } finally {
      setSearching(false);
    }
  }

  function resetForm() {
    setRawText("");
    setConvertedText("");
    setConvertError(null);
    setSaveError(null);
  }

  // 원문/AI변환결과는 "작성 중이던 콘텐츠"라 환자 선택 상태와 완전히 독립적으로 유지되어야
  // 한다(task.md 버그 수정) — 여기서는 이제 막 해소된 안내 메시지(에러)만 지운다.
  function clearTransientErrors() {
    setConvertError(null);
    setSaveError(null);
  }

  // 환자를 바꿔도 창(검색 상태 포함)은 그대로 유지된다 — 선택된 환자만 교체. 작성 중이던
  // 원문/변환결과는 절대 초기화하지 않는다(resetForm 호출 금지, task.md).
  function selectPatient(patient: Patient) {
    setSelectedPatient(patient);
    setResults(null);
    setQuery("");
    clearTransientErrors();
  }

  // "다른 환자 선택" — 케이스4(task.md): 작성 중이던 내용은 일단 유지하는 방향으로
  // 구현. 완전히 새 상담을 시작하려면 저장 후(자동 초기화) 또는 직접 지우면 된다.
  function clearSelectedPatient() {
    setSelectedPatient(null);
    setNotes(null);
    clearTransientErrors();
  }

  async function handleConvert() {
    if (!rawText.trim() || !currentUser) return;
    setConverting(true);
    setConvertError(null);
    try {
      const res = await fetch("/api/consultation-notes/convert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawText: rawText.trim(), staffUserId: currentUser.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        setConvertError(data.error ?? "차팅 변환에 실패했습니다.");
        return;
      }
      setConvertedText(data.convertedChartText);
    } catch {
      setConvertError("서버에 연결하지 못했습니다. 다시 시도해주세요.");
    } finally {
      setConverting(false);
    }
  }

  async function handleCopyConverted() {
    if (!convertedText) return;
    const success = await copyToClipboard(convertedText);
    if (!success) {
      alert("복사에 실패했습니다. 텍스트를 직접 선택해서 복사해주세요.");
      return;
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function handleSave() {
    if (!currentUser) return;
    if (!selectedPatient) {
      setSaveError("저장하려면 환자를 먼저 선택해주세요.");
      return;
    }
    if (!selectedTypeId || !rawText.trim()) {
      setSaveError("상담유형과 상담 내용을 모두 입력하세요.");
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch("/api/consultation-notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientId: selectedPatient.id,
          consultationTypeId: Number(selectedTypeId),
          rawText: rawText.trim(),
          convertedChartText: convertedText.trim() || undefined,
          createdByStaffId: currentUser.id,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSaveError(data.error ?? "저장에 실패했습니다.");
        return;
      }
      resetForm();
      refreshNotes(selectedPatient.id);
    } catch {
      setSaveError("서버에 연결하지 못했습니다. 저장되지 않았으니 다시 시도해주세요.");
    } finally {
      setSaving(false);
    }
  }

  function startEditNote(n: ConsultationNote) {
    setEditingNoteId(n.id);
    setEditVisitDate(toDateInputValue(n.visitDate));
    setEditRawText(n.rawText);
    setEditConvertedText(n.convertedChartText ?? "");
    setEditError(null);
  }

  function cancelEditNote() {
    setEditingNoteId(null);
    setEditError(null);
  }

  async function saveEditNote(id: number) {
    if (!currentUser) return;
    if (!editRawText.trim()) {
      setEditError("상담 내용을 입력하세요.");
      return;
    }
    setEditSaving(true);
    setEditError(null);
    try {
      const res = await fetch(`/api/consultation-notes/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          staffUserId: currentUser.id,
          visitDate: editVisitDate,
          rawText: editRawText.trim(),
          convertedChartText: editConvertedText.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setEditError(data.error ?? "수정에 실패했습니다.");
        return;
      }
      setEditingNoteId(null);
      if (selectedPatient) refreshNotes(selectedPatient.id);
    } catch {
      setEditError("서버에 연결하지 못했습니다. 수정되지 않았으니 다시 시도해주세요.");
    } finally {
      setEditSaving(false);
    }
  }

  async function handleDeleteNote(n: ConsultationNote) {
    if (!currentUser) return;
    if (!window.confirm("정말 삭제하시겠습니까? 되돌릴 수 없습니다.")) return;

    setDeletingNoteId(n.id);
    try {
      const res = await fetch(`/api/consultation-notes/${n.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ staffUserId: currentUser.id }),
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error ?? "삭제에 실패했습니다.");
        return;
      }
      if (selectedPatient) refreshNotes(selectedPatient.id);
    } catch {
      alert("서버에 연결하지 못했습니다. 삭제되지 않았으니 다시 시도해주세요.");
    } finally {
      setDeletingNoteId(null);
    }
  }

  if (!loaded) {
    return (
      <div className={styles.page}>
        <p className={styles.muted}>불러오는 중...</p>
      </div>
    );
  }

  if (!isDirector) {
    return (
      <div className={styles.page}>
        <div className={styles.blockedCard}>
          <h1 className={styles.pageTitle}>상담모드</h1>
          <p className={styles.blockedText}>
            상담모드는 원장 전용 화면입니다. 상단에서 원장 계정을 선택했는지 확인해주세요.
          </p>
          <CurrentUserSelector />
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.topBar}>
        <h1 className={styles.pageTitle}>상담모드</h1>
        <CurrentUserSelector />
      </div>

      <div className={styles.section}>
        <div className={styles.sectionTitle}>환자 검색</div>
        <form className={styles.searchRow} onSubmit={handleSearch}>
          <input
            type="text"
            placeholder="차트번호 또는 이름"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button type="submit" disabled={searching}>
            검색
          </button>
        </form>

        {results !== null && results.length > 0 && (
          <ul className={styles.resultList}>
            {results.map((p) => (
              <li key={p.id} onClick={() => selectPatient(p)}>
                {p.name} (<span className={styles.mono}>{p.chartNumber}</span>)
              </li>
            ))}
          </ul>
        )}
        {results !== null && results.length === 0 && (
          <p className={styles.muted}>검색 결과가 없습니다.</p>
        )}

        {selectedPatient && (
          <div className={styles.selectedPatient}>
            <span>
              선택된 환자: <strong>{selectedPatient.name}</strong> (
              <span className={styles.mono}>{selectedPatient.chartNumber}</span>)
            </span>
            <button type="button" onClick={clearSelectedPatient}>
              다른 환자 선택
            </button>
          </div>
        )}
      </div>

      {selectedPatient && (
        <div className={styles.section}>
          <div className={styles.sectionTitle}>상담 이력</div>
          {notes === null ? (
            <p className={styles.muted}>불러오는 중...</p>
          ) : notes.length === 0 ? (
            <p className={styles.muted}>등록된 상담 기록이 없습니다.</p>
          ) : (
              <div className={styles.historyStack}>
                {notes.map((n) =>
                  editingNoteId === n.id ? (
                    <div key={n.id} className={styles.historyCard}>
                      <div className={styles.historyHeader}>
                        <span className={styles.typeBadge}>{n.consultationType.name}</span>
                        <span className={styles.historyMeta}>
                          {formatDate(n.visitDate)} · {n.createdByStaff.name}
                        </span>
                      </div>
                      <p className={styles.editHint}>
                        오타 정정용입니다. 새로운 정보는 새 상담으로 추가해주세요.
                      </p>
                      <label className={styles.editDateLabel}>
                        날짜
                        <input
                          type="date"
                          value={editVisitDate}
                          onChange={(e) => setEditVisitDate(e.target.value)}
                        />
                      </label>
                      <textarea
                        className={styles.editTextarea}
                        value={editRawText}
                        onChange={(e) => setEditRawText(e.target.value)}
                        rows={5}
                      />
                      <div className={styles.historyConvertedLabel}>AI 차팅변환 (선택)</div>
                      <textarea
                        className={styles.editTextarea}
                        value={editConvertedText}
                        onChange={(e) => setEditConvertedText(e.target.value)}
                        rows={5}
                      />
                      {editError && <p className={styles.errorText}>{editError}</p>}
                      <div className={styles.editActions}>
                        <button
                          type="button"
                          className={styles.saveButton}
                          onClick={() => saveEditNote(n.id)}
                          disabled={editSaving}
                        >
                          {editSaving ? "저장 중..." : "저장"}
                        </button>
                        <button type="button" className={styles.cancelButton} onClick={cancelEditNote}>
                          취소
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div key={n.id} className={styles.historyCard}>
                      <div className={styles.historyHeader}>
                        <span className={styles.typeBadge}>{n.consultationType.name}</span>
                        <span className={styles.historyMeta}>
                          {formatDate(n.visitDate)} · {n.createdByStaff.name}
                        </span>
                      </div>
                      <p className={styles.historyRaw}>{n.rawText}</p>
                      {n.convertedChartText && (
                        <div className={styles.historyConverted}>
                          <div className={styles.historyConvertedLabel}>AI 차팅변환</div>
                          <p>{n.convertedChartText}</p>
                        </div>
                      )}
                      <div className={styles.cardActions}>
                        <button
                          type="button"
                          className={styles.editNoteButton}
                          onClick={() => startEditNote(n)}
                        >
                          수정
                        </button>
                        <button
                          type="button"
                          className={styles.deleteNoteButton}
                          onClick={() => handleDeleteNote(n)}
                          disabled={deletingNoteId === n.id}
                        >
                          {deletingNoteId === n.id ? "삭제 중..." : "삭제"}
                        </button>
                      </div>
                    </div>
                  ),
                )}
              </div>
            )}
          </div>
      )}

      <div className={styles.section}>
        <div className={styles.sectionTitle}>새 상담 작성</div>
        {!selectedPatient && (
          <p className={styles.convertHint}>
            환자를 선택하지 않아도 기입/AI 차팅변환은 가능합니다. 저장하려면 환자를 먼저
            선택해주세요.
          </p>
        )}
        <label className={styles.typeLabel}>
          상담유형
          <select value={selectedTypeId} onChange={(e) => setSelectedTypeId(e.target.value)}>
            {(types ?? []).map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>

        <textarea
          className={styles.rawTextarea}
          placeholder="상담 내용을 자유롭게 입력하세요"
          value={rawText}
          onChange={(e) => setRawText(e.target.value)}
          rows={6}
        />

        <div className={styles.convertRow}>
          <button
            type="button"
            className={styles.convertButton}
            onClick={handleConvert}
            disabled={!rawText.trim() || converting}
          >
            {converting ? "변환 중..." : "AI 차팅변환"}
          </button>
          <span className={styles.convertHint}>주로 초진상담에 사용 (선택사항)</span>
        </div>
        {convertError && <p className={styles.errorText}>{convertError}</p>}

        {convertedText && (
          <div className={styles.convertedBox}>
            <textarea
              className={styles.convertedTextarea}
              value={convertedText}
              onChange={(e) => setConvertedText(e.target.value)}
              rows={6}
            />
            <button type="button" className={styles.copyButton} onClick={handleCopyConverted}>
              {copied ? "복사됨" : "복사"}
            </button>
          </div>
        )}

        {saveError && <p className={styles.errorText}>{saveError}</p>}
        <button
          type="button"
          className={styles.saveButton}
          onClick={handleSave}
          disabled={saving || !rawText.trim()}
        >
          {saving ? "저장 중..." : "저장"}
        </button>
      </div>
    </div>
  );
}
