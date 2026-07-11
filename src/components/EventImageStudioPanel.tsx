"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./EventImageStudioPanel.module.css";
import { useCurrentUserContext } from "@/lib/CurrentUserContext";
import { composeEventImage } from "@/lib/event-image-canvas";
import { copyToClipboard } from "@/lib/clipboard";

type EventCopyResult = { title: string; intro: string; copy: string };

type EventImage = {
  id: number;
  rawIdea: string;
  finalTitle: string;
  finalCopy: string;
  backgroundImagePath: string;
  compositeImagePath: string;
  createdAt: string;
  isActive: boolean;
  createdByStaff: { id: number; name: string };
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`;
}

// intro는 저장되지 않는 값이라(task.md 결정), 기존 이벤트를 수정하러 들어갈 때는 본문의
// 첫 문단(카테고리 목록이 시작되기 전 인트로 문장)을 근사치로 되살린다 — 필요하면 직접
// 수정하거나 "재생성"으로 다시 뽑으면 된다.
function deriveIntroFromCopy(copy: string): string {
  const firstParagraph = copy.split(/\n\s*\n/)[0]?.trim();
  return firstParagraph || copy.slice(0, 80);
}

/**
 * 이벤트 이미지 생성기 1차 버전(task.md) — ① AI로 문구 완성/재생성 → ② 배경 업로드 후
 * Canvas로 자동 배치 합성(실시간 미리보기) → ③ 저장, 순서로 진행하되 순서를 강제하지는
 * 않는다(1단계 입력창은 항상 보이고, 배경 업로드 전까지는 2/3단계가 자연스럽게 비활성).
 */
export default function EventImageStudioPanel() {
  const { currentUser } = useCurrentUserContext();

  const [editingId, setEditingId] = useState<number | null>(null);
  const [rawIdea, setRawIdea] = useState("");
  const [title, setTitle] = useState("");
  const [intro, setIntro] = useState("");
  const [copy, setCopy] = useState("");
  const [instruction, setInstruction] = useState("");
  const [generating, setGenerating] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  // "완성된 이미지 그대로 사용"(task.md) — 외부 도구에서 문구까지 포함해 만든 완제품
  // 배너를 텍스트 합성 없이 그대로 저장하는 모드. 체크 시 1단계 문구 입력은 선택사항.
  const [useRawImage, setUseRawImage] = useState(false);

  const [backgroundFile, setBackgroundFile] = useState<File | null>(null);
  const [backgroundUrl, setBackgroundUrl] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [composing, setComposing] = useState(false);

  const [bodyCopied, setBodyCopied] = useState(false);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [items, setItems] = useState<EventImage[] | null>(null);
  const [detailId, setDetailId] = useState<number | null>(null);

  useEffect(() => {
    refresh();
  }, []);

  useEffect(() => {
    return () => {
      if (backgroundUrl?.startsWith("blob:")) URL.revokeObjectURL(backgroundUrl);
    };
  }, [backgroundUrl]);

  // 이미지에는 타이틀+짧은 인트로만 얹는다 — 카테고리별 전체 항목(copy)은 이미지가
  // 아니라 아래 "카카오톡 본문" 텍스트 영역으로만 노출한다(task.md 결정). "완성된
  // 이미지 그대로 사용" 모드에서는 합성 자체를 건너뛴다(배경을 그대로 미리보기).
  useEffect(() => {
    if (useRawImage) return;
    if (!backgroundUrl || !canvasRef.current || !title.trim() || !intro.trim()) return;
    setComposing(true);
    composeEventImage({ canvas: canvasRef.current, backgroundUrl, title, copy: intro })
      .catch(() => setSaveError("이미지 합성 중 문제가 발생했습니다."))
      .finally(() => setComposing(false));
  }, [backgroundUrl, title, intro, useRawImage]);

  function refresh() {
    fetch("/api/event-images")
      .then((res) => res.json())
      .then(setItems);
  }

  async function requestCopy(previous: EventCopyResult | null, instructionText: string | null) {
    setGenerating(true);
    setCopyError(null);
    try {
      const res = await fetch("/api/event-images/generate-copy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawIdea: rawIdea.trim(), previous, instruction: instructionText }),
      });
      const data = await res.json();
      if (!res.ok) {
        setCopyError(data.error ?? "문구 생성에 실패했습니다.");
        return;
      }
      setTitle(data.title);
      setIntro(data.intro);
      setCopy(data.copy);
    } catch {
      setCopyError("서버에 연결하지 못했습니다. 다시 시도해주세요.");
    } finally {
      setGenerating(false);
    }
  }

  function handleGenerate() {
    if (!rawIdea.trim()) return;
    requestCopy(null, null);
  }

  function handleRegenerate() {
    if (!title.trim() || !intro.trim() || !copy.trim()) return;
    requestCopy({ title, intro, copy }, instruction.trim() || null);
    setInstruction("");
  }

  async function handleCopyBody() {
    const success = await copyToClipboard(copy);
    if (!success) {
      alert("복사에 실패했습니다. 텍스트를 직접 선택해서 복사해주세요.");
      return;
    }
    setBodyCopied(true);
    setTimeout(() => setBodyCopied(false), 1500);
  }

  function handleBackgroundChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    if (backgroundUrl?.startsWith("blob:")) URL.revokeObjectURL(backgroundUrl);
    setBackgroundFile(file);
    setBackgroundUrl(file ? URL.createObjectURL(file) : null);
  }

  function resetWizard() {
    setEditingId(null);
    setRawIdea("");
    setTitle("");
    setIntro("");
    setCopy("");
    setInstruction("");
    setConfirmed(false);
    setUseRawImage(false);
    if (backgroundUrl?.startsWith("blob:")) URL.revokeObjectURL(backgroundUrl);
    setBackgroundFile(null);
    setBackgroundUrl(null);
    setSaveError(null);
  }

  // 상세 모달의 "수정" — 기존 값을 그대로 마법사에 채워넣고, 이미 문구가 있으니 바로
  // 2/3단계(배경/저장)까지 노출한다. 배경을 다시 올리지 않으면 기존 이미지를 그대로
  // 캔버스에 불러와 재합성 미리보기를 보여준다(재업로드 시에만 배경 자체가 바뀜).
  // background===composite 경로면 "완성된 이미지 그대로 사용"으로 만들어진 것이므로
  // 수정 진입 시에도 그 모드를 그대로 유지한다(안 그러면 저장 시 문구가 없어 합성이
  // 텅 비거나, 원치 않게 텍스트가 새로 얹힐 수 있음).
  function startEdit(item: EventImage) {
    if (backgroundUrl?.startsWith("blob:")) URL.revokeObjectURL(backgroundUrl);
    setEditingId(item.id);
    setRawIdea(item.rawIdea);
    setTitle(item.finalTitle);
    setIntro(deriveIntroFromCopy(item.finalCopy));
    setCopy(item.finalCopy);
    setInstruction("");
    setConfirmed(true);
    setUseRawImage(item.backgroundImagePath === item.compositeImagePath);
    setBackgroundFile(null);
    setBackgroundUrl(item.backgroundImagePath);
    setDetailId(null);
    setSaveError(null);
  }

  async function handleSave() {
    if (!currentUser || !backgroundUrl) return;
    if (!editingId && !backgroundFile) return; // 신규 생성은 배경 업로드가 필수
    if (!useRawImage && (!title.trim() || !intro.trim() || !copy.trim() || !canvasRef.current)) return;
    setSaving(true);
    setSaveError(null);
    try {
      const formData = new FormData();
      formData.set("rawIdea", rawIdea.trim());
      formData.set("finalTitle", title.trim());
      formData.set("finalCopy", copy.trim());
      if (backgroundFile) formData.set("backgroundImage", backgroundFile);

      if (useRawImage) {
        formData.set("useRawImage", "true");
      } else {
        const blob: Blob | null = await new Promise((resolve) =>
          canvasRef.current!.toBlob((b) => resolve(b), "image/png"),
        );
        if (!blob) {
          setSaveError("합성 이미지를 만들지 못했습니다. 다시 시도해주세요.");
          return;
        }
        formData.set("compositeImage", new File([blob], "composite.png", { type: "image/png" }));
      }

      let res: Response;
      if (editingId) {
        res = await fetch(`/api/event-images/${editingId}`, { method: "PATCH", body: formData });
      } else {
        formData.set("createdByStaffId", String(currentUser.id));
        res = await fetch("/api/event-images", { method: "POST", body: formData });
      }
      const data = await res.json();
      if (!res.ok) {
        setSaveError(data.error ?? "저장에 실패했습니다.");
        return;
      }

      resetWizard();
      refresh();
    } catch {
      setSaveError("서버에 연결하지 못했습니다. 저장되지 않았으니 다시 시도해주세요.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(item: EventImage) {
    const action = item.isActive ? "비활성화" : "재활성화";
    if (!window.confirm(`이 이벤트를 ${action}하시겠습니까?`)) return;
    const formData = new FormData();
    formData.set("isActive", String(!item.isActive));
    const res = await fetch(`/api/event-images/${item.id}`, { method: "PATCH", body: formData });
    if (!res.ok) {
      alert("처리에 실패했습니다. 다시 시도해주세요.");
      return;
    }
    refresh();
  }

  // 완전 삭제(task.md) — 비활성화와 별개의 더 강한 액션. DB 레코드+이미지 파일까지 정리.
  async function handleDelete(item: EventImage) {
    if (!window.confirm("정말 삭제하시겠습니까? 되돌릴 수 없습니다.")) return;
    const res = await fetch(`/api/event-images/${item.id}`, { method: "DELETE" });
    if (!res.ok) {
      alert("삭제에 실패했습니다. 다시 시도해주세요.");
      return;
    }
    setDetailId(null);
    refresh();
  }

  const detail = items?.find((i) => i.id === detailId) ?? null;

  return (
    <div className={styles.wrap}>
      <div className={styles.section}>
        <div className={styles.sectionTitle}>1단계 — 문구 완성</div>
        <textarea
          className={styles.ideaTextarea}
          placeholder="이벤트 아이디어를 자유롭게 입력하세요 (예: 여름맞이 다이어트 상담 20% 할인)"
          value={rawIdea}
          onChange={(e) => setRawIdea(e.target.value)}
          rows={3}
        />
        <button
          type="button"
          className={styles.primaryButton}
          onClick={handleGenerate}
          disabled={!rawIdea.trim() || generating}
        >
          {generating ? "생성 중..." : "AI로 문구 완성"}
        </button>
        {copyError && <p className={styles.errorText}>{copyError}</p>}

        {useRawImage && (
          <p className={styles.muted}>
            "완성된 이미지 그대로 사용"이 켜져 있어 문구 입력은 선택사항입니다 — 목록 구분용
            타이틀만 적거나 아예 비워도 됩니다.
          </p>
        )}
        <div className={styles.draftBox}>
          <label className={styles.fieldLabel}>
            타이틀
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label className={styles.fieldLabel}>
            인트로 (이미지에 타이틀과 함께 얹힐 짧은 문구, 1~2문장)
            <textarea value={intro} onChange={(e) => setIntro(e.target.value)} rows={2} />
          </label>
          <label className={styles.fieldLabel}>
            본문 전체 (카카오톡 발송용 — 카테고리별 항목/가격 전부 포함)
            <textarea value={copy} onChange={(e) => setCopy(e.target.value)} rows={6} />
          </label>

          <div className={styles.reviseRow}>
            <input
              type="text"
              placeholder="이렇게 수정해줘 (예: 더 짧고 강렬하게)"
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
            />
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={handleRegenerate}
              disabled={generating || !title.trim() || !intro.trim() || !copy.trim()}
            >
              {generating ? "재생성 중..." : "재생성"}
            </button>
          </div>

          <button type="button" className={styles.primaryButton} onClick={() => setConfirmed(true)}>
            문구 확정
          </button>
          {confirmed && <span className={styles.confirmedBadge}>문구 확정됨 (계속 수정 가능)</span>}
          {editingId && (
            <div className={styles.editingRow}>
              <span className={styles.confirmedBadge}>이벤트 #{editingId} 수정 중</span>
              <button type="button" className={styles.secondaryButton} onClick={resetWizard}>
                수정 취소
              </button>
            </div>
          )}
        </div>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionTitle}>2단계 — 배경 이미지 업로드 + 합성</div>
        <label className={styles.rawImageToggle}>
          <input
            type="checkbox"
            checked={useRawImage}
            onChange={(e) => setUseRawImage(e.target.checked)}
          />
          완성된 이미지 그대로 사용 (외부에서 문구까지 완성한 배너 — 텍스트 합성 없이 원본
          그대로 저장)
        </label>
        <input type="file" accept="image/*" onChange={handleBackgroundChange} />
        {editingId && (
          <p className={styles.muted}>다시 올리지 않으면 기존 배경 이미지를 그대로 사용합니다.</p>
        )}

        {backgroundUrl && (
          <div className={styles.previewBox}>
            {useRawImage ? (
              <img src={backgroundUrl} alt="" className={styles.previewCanvas} />
            ) : (
              <canvas ref={canvasRef} className={styles.previewCanvas} />
            )}
            {composing && !useRawImage && <p className={styles.muted}>합성 중...</p>}
          </div>
        )}

        {copy.trim() && (
          <div className={styles.copyOutBox}>
            <div className={styles.copyOutHeader}>
              <span>카카오톡 본문 (복사해서 붙여넣기)</span>
              <button type="button" className={styles.secondaryButton} onClick={handleCopyBody}>
                {bodyCopied ? "복사됨" : "복사"}
              </button>
            </div>
            <textarea className={styles.copyOutTextarea} value={copy} readOnly rows={10} />
          </div>
        )}
      </div>

      {backgroundUrl && (
        <div className={styles.section}>
          <div className={styles.sectionTitle}>3단계 — 저장</div>
          {saveError && <p className={styles.errorText}>{saveError}</p>}
          <button
            type="button"
            className={styles.primaryButton}
            onClick={handleSave}
            disabled={
              saving ||
              composing ||
              !currentUser ||
              (!editingId && !backgroundFile) ||
              (!useRawImage && (!title.trim() || !intro.trim() || !copy.trim()))
            }
          >
            {saving ? "저장 중..." : editingId ? "수정 저장" : "이벤트 저장"}
          </button>
          {!currentUser && <p className={styles.muted}>상단에서 현재 사용자를 먼저 선택해주세요.</p>}
        </div>
      )}

      <div className={styles.section}>
        <div className={styles.sectionTitle}>이벤트 목록 ({items?.length ?? 0}건)</div>
        {items === null ? (
          <p className={styles.muted}>불러오는 중...</p>
        ) : items.length === 0 ? (
          <p className={styles.muted}>아직 만든 이벤트가 없습니다.</p>
        ) : (
          <div className={styles.cardGrid}>
            {items.map((item) => (
              <div
                key={item.id}
                className={item.isActive ? styles.card : `${styles.card} ${styles.cardInactive}`}
                onClick={() => setDetailId(item.id)}
              >
                <img src={item.compositeImagePath} alt="" className={styles.cardThumb} />
                <div className={styles.cardTitle}>{item.finalTitle || "(제목 없음)"}</div>
                <div className={styles.cardMeta}>
                  {formatDate(item.createdAt)} · {item.createdByStaff.name}
                  {!item.isActive && " · 비활성"}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {detail && (
        <div className={styles.modalOverlay} onClick={() => setDetailId(null)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <img src={detail.compositeImagePath} alt="" className={styles.modalImage} />
            <div className={styles.modalTitle}>{detail.finalTitle || "(제목 없음)"}</div>
            <div className={styles.copyOutBox}>
              <div className={styles.copyOutHeader}>
                <span>카카오톡 본문 (복사해서 붙여넣기)</span>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={async () => {
                    const success = await copyToClipboard(detail.finalCopy);
                    if (!success) alert("복사에 실패했습니다. 텍스트를 직접 선택해서 복사해주세요.");
                  }}
                >
                  복사
                </button>
              </div>
              <textarea className={styles.copyOutTextarea} value={detail.finalCopy} readOnly rows={8} />
            </div>
            {detail.rawIdea && (
              <p className={styles.modalRawIdea}>원본 아이디어: {detail.rawIdea}</p>
            )}
            <p className={styles.cardMeta}>
              {formatDate(detail.createdAt)} · {detail.createdByStaff.name}
            </p>
            <div className={styles.modalActions}>
              <button type="button" className={styles.secondaryButton} onClick={() => startEdit(detail)}>
                수정
              </button>
              <button
                type="button"
                className={detail.isActive ? styles.deactivateButton : styles.activateButton}
                onClick={() => toggleActive(detail)}
              >
                {detail.isActive ? "비활성화" : "재활성화"}
              </button>
              <button type="button" className={styles.deleteButton} onClick={() => handleDelete(detail)}>
                삭제
              </button>
              <button type="button" className={styles.secondaryButton} onClick={() => setDetailId(null)}>
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
