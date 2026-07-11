"use client";

import { useEffect, useState } from "react";
import styles from "./page.module.css";
import BackButton from "@/components/BackButton";
import { EXAM_TYPE_LABEL } from "@/lib/examination-format";

type LinkedTestType = "BODY_COMPOSITION" | "STRENGTH_TEST";

// src/lib/teaching-pages.ts DEFAULT_CTA_LABEL과 동일한 값 — 그쪽은 prisma를 물고 있는
// 서버 전용 모듈이라 클라이언트 컴포넌트에서 직접 import할 수 없어 안내문구용으로만 복제.
const DEFAULT_CTA_LABEL_PLACEHOLDER = "본상담 예약하기";

// 직원 셀링포인트 3개(환자/한의원/기타 관점) + 원장 학술 3개 — src/lib/program-teaching.ts와
// 동일한 키/라벨 (서버 lib는 prisma를 물고 있어 클라이언트 컴포넌트에서 직접 import할 수
// 없어 여기 복제).
const SELLING_FIELDS = [
  { key: "patientSellingPoints", label: "환자 셀링포인트" },
  { key: "clinicSellingPoints", label: "한의원 셀링포인트" },
  { key: "etcSellingPoints", label: "기타" },
] as const;

const ACADEMIC_FIELDS = [
  { key: "academicDefinition", label: "질환 정의" },
  { key: "academicMechanism", label: "처방 기전" },
  { key: "academicEvidence", label: "임상 근거" },
] as const;

type FieldKey = (typeof SELLING_FIELDS)[number]["key"] | (typeof ACADEMIC_FIELDS)[number]["key"];
type ContentFields = Record<FieldKey, string>;

const EMPTY_CONTENT_FIELDS: ContentFields = {
  patientSellingPoints: "",
  clinicSellingPoints: "",
  etcSellingPoints: "",
  academicDefinition: "",
  academicMechanism: "",
  academicEvidence: "",
};

type ProgramTeaching = {
  id: number;
  programName: string;
  targetSymptomKeywords: string | null;
  linkedTestType: LinkedTestType | null;
  supportImagePath: string | null;
  ctaButtonLabel: string | null;
  isActive: boolean;
} & Record<FieldKey, string | null>;

function linkedTestTypeLabel(value: LinkedTestType | null): string {
  return value ? EXAM_TYPE_LABEL[value] : "없음";
}

function countFilled(item: ProgramTeaching, fields: readonly { key: FieldKey }[]): number {
  return fields.filter((f) => item[f.key]).length;
}

function FieldGroup({
  fields,
  values,
  onChange,
}: {
  fields: readonly { key: FieldKey; label: string }[];
  values: ContentFields;
  onChange: (key: FieldKey, value: string) => void;
}) {
  return (
    <>
      {fields.map((f) => (
        <label key={f.key} className={styles.contentFieldLabel}>
          {f.label}
          <textarea value={values[f.key]} onChange={(e) => onChange(f.key, e.target.value)} />
        </label>
      ))}
    </>
  );
}

export default function ProgramTeachingSettingsPage() {
  const [items, setItems] = useState<ProgramTeaching[] | null>(null);

  const [newProgramName, setNewProgramName] = useState("");
  const [newTargetSymptomKeywords, setNewTargetSymptomKeywords] = useState("");
  const [newLinkedTestType, setNewLinkedTestType] = useState<LinkedTestType | "">("");
  const [newCtaButtonLabel, setNewCtaButtonLabel] = useState("");
  const [newFields, setNewFields] = useState<ContentFields>(EMPTY_CONTENT_FIELDS);
  const [newSupportImage, setNewSupportImage] = useState<File | null>(null);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editProgramName, setEditProgramName] = useState("");
  const [editTargetSymptomKeywords, setEditTargetSymptomKeywords] = useState("");
  const [editLinkedTestType, setEditLinkedTestType] = useState<LinkedTestType | "">("");
  const [editCtaButtonLabel, setEditCtaButtonLabel] = useState("");
  const [editFields, setEditFields] = useState<ContentFields>(EMPTY_CONTENT_FIELDS);
  const [editNewImage, setEditNewImage] = useState<File | null>(null);
  const [editRemoveImage, setEditRemoveImage] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  useEffect(() => {
    refresh();
  }, []);

  function refresh() {
    fetch("/api/program-teaching")
      .then((res) => res.json())
      .then(setItems);
  }

  function resetAddForm() {
    setNewProgramName("");
    setNewTargetSymptomKeywords("");
    setNewLinkedTestType("");
    setNewCtaButtonLabel("");
    setNewFields(EMPTY_CONTENT_FIELDS);
    setNewSupportImage(null);
  }

  function appendContentFields(formData: FormData, fields: ContentFields) {
    for (const key of Object.keys(fields) as FieldKey[]) {
      formData.set(key, fields[key].trim());
    }
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setAddError(null);
    if (!newProgramName.trim()) {
      setAddError("프로그램명을 입력하세요.");
      return;
    }
    setAdding(true);
    try {
      const formData = new FormData();
      formData.set("programName", newProgramName.trim());
      formData.set("targetSymptomKeywords", newTargetSymptomKeywords.trim());
      formData.set("linkedTestType", newLinkedTestType);
      formData.set("ctaButtonLabel", newCtaButtonLabel.trim());
      appendContentFields(formData, newFields);
      if (newSupportImage) formData.set("supportImage", newSupportImage);

      const res = await fetch("/api/program-teaching", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) {
        setAddError(data.error ?? "등록에 실패했습니다.");
        return;
      }
      resetAddForm();
      refresh();
    } catch {
      // 서버 재시작/네트워크 단절 등으로 요청 자체가 실패한 경우 — 이전에는 여기서 잡히지
      // 않아 조용히 유실되며 사용자에게 아무 표시도 되지 않았다(실사용 중 데이터 유실 발견).
      setAddError("서버에 연결하지 못했습니다. 잠시 후 다시 시도하고, 목록에 반영됐는지 꼭 확인해주세요.");
    } finally {
      setAdding(false);
    }
  }

  function startEdit(item: ProgramTeaching) {
    setEditingId(item.id);
    setEditProgramName(item.programName);
    setEditTargetSymptomKeywords(item.targetSymptomKeywords ?? "");
    setEditLinkedTestType(item.linkedTestType ?? "");
    setEditCtaButtonLabel(item.ctaButtonLabel ?? "");
    setEditFields({
      patientSellingPoints: item.patientSellingPoints ?? "",
      clinicSellingPoints: item.clinicSellingPoints ?? "",
      etcSellingPoints: item.etcSellingPoints ?? "",
      academicDefinition: item.academicDefinition ?? "",
      academicMechanism: item.academicMechanism ?? "",
      academicEvidence: item.academicEvidence ?? "",
    });
    setEditNewImage(null);
    setEditRemoveImage(false);
    setEditError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditError(null);
  }

  async function saveEdit(id: number) {
    setEditError(null);
    if (!editProgramName.trim()) {
      setEditError("프로그램명을 입력하세요.");
      return;
    }
    setEditSaving(true);
    try {
      const formData = new FormData();
      formData.set("programName", editProgramName.trim());
      formData.set("targetSymptomKeywords", editTargetSymptomKeywords.trim());
      formData.set("linkedTestType", editLinkedTestType);
      formData.set("ctaButtonLabel", editCtaButtonLabel.trim());
      appendContentFields(formData, editFields);
      if (editNewImage) formData.set("supportImage", editNewImage);
      if (editRemoveImage) formData.set("removeImage", "true");

      const res = await fetch(`/api/program-teaching/${id}`, { method: "PATCH", body: formData });
      const data = await res.json();
      if (!res.ok) {
        setEditError(data.error ?? "수정에 실패했습니다.");
        return;
      }
      setEditingId(null);
      refresh();
    } catch {
      setEditError("서버에 연결하지 못했습니다. 잠시 후 다시 시도하고, 목록에 반영됐는지 꼭 확인해주세요.");
    } finally {
      setEditSaving(false);
    }
  }

  async function toggleActive(item: ProgramTeaching) {
    const action = item.isActive ? "비활성화" : "재활성화";
    if (!window.confirm(`"${item.programName}" 프로그램을 ${action}하시겠습니까?`)) return;
    try {
      const formData = new FormData();
      formData.set("isActive", String(!item.isActive));
      const res = await fetch(`/api/program-teaching/${item.id}`, { method: "PATCH", body: formData });
      if (!res.ok) {
        alert("처리에 실패했습니다. 다시 시도해주세요.");
        return;
      }
      refresh();
    } catch {
      alert("서버에 연결하지 못했습니다. 잠시 후 다시 시도해주세요.");
    }
  }

  return (
    <div className={styles.container}>
      <div className={styles.titleRow}>
        <BackButton />
        <h1 className={styles.pageTitle}>프로그램 티칭 관리</h1>
      </div>
      <p className={styles.muted}>
        핵심 프로그램별로 직원이 채우는 "셀링포인트" 3개(환자/한의원/기타)와 원장이 채우는 "학술" 3개를
        등록해두면, 톡 생성 화면에서 환자를 선택해 개인화된 티칭지 링크를 바로 만들 수
        있습니다. 항목은 일부만 채워도 되고, 여러 사람이 나눠서 채워도 됩니다.
      </p>

      <div className={styles.section}>
        <div className={styles.sectionTitle}>신규 프로그램 등록</div>
        <form className={styles.form} onSubmit={handleAdd}>
          <input
            type="text"
            placeholder="프로그램명 (예: 체중관리 다이어트)"
            value={newProgramName}
            onChange={(e) => setNewProgramName(e.target.value)}
          />
          <div className={styles.fieldRow}>
            <input
              type="text"
              placeholder="증상 키워드 힌트 (선택, 예: 허리, 무릎)"
              value={newTargetSymptomKeywords}
              onChange={(e) => setNewTargetSymptomKeywords(e.target.value)}
            />
            <select
              value={newLinkedTestType}
              onChange={(e) => setNewLinkedTestType(e.target.value as LinkedTestType | "")}
            >
              <option value="">연결검사 없음</option>
              <option value="BODY_COMPOSITION">인바디</option>
              <option value="STRENGTH_TEST">근력검사</option>
            </select>
          </div>
          <input
            type="text"
            placeholder={`공개 티칭지 전환버튼 문구 (선택, 기본값: "${DEFAULT_CTA_LABEL_PLACEHOLDER}")`}
            value={newCtaButtonLabel}
            onChange={(e) => setNewCtaButtonLabel(e.target.value)}
          />

          <div className={styles.contentSectionLabel}>셀링포인트 (직원 작성, 3개)</div>
          <FieldGroup
            fields={SELLING_FIELDS}
            values={newFields}
            onChange={(key, value) => setNewFields((prev) => ({ ...prev, [key]: value }))}
          />

          <div className={styles.contentSectionLabel}>학술 (원장 작성, 3개)</div>
          <FieldGroup
            fields={ACADEMIC_FIELDS}
            values={newFields}
            onChange={(key, value) => setNewFields((prev) => ({ ...prev, [key]: value }))}
          />

          <input
            type="file"
            accept="image/*"
            onChange={(e) => setNewSupportImage(e.target.files?.[0] ?? null)}
          />
          <span className={styles.fileHint}>참고이미지는 선택사항입니다.</span>

          <button type="submit" className={styles.submitButton} disabled={adding}>
            {adding ? "등록 중..." : "등록"}
          </button>
          {addError && <p className={styles.errorText}>{addError}</p>}
        </form>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionTitle}>프로그램 목록 ({items?.length ?? 0}건)</div>
        {items === null ? (
          <p className={styles.muted}>불러오는 중...</p>
        ) : items.length === 0 ? (
          <p className={styles.muted}>등록된 프로그램이 없습니다.</p>
        ) : (
          <div className={styles.list}>
            {items.map((item) =>
              editingId === item.id ? (
                <div key={item.id} className={styles.card}>
                  <input
                    className={styles.cardInput}
                    type="text"
                    value={editProgramName}
                    onChange={(e) => setEditProgramName(e.target.value)}
                  />
                  <div className={styles.fieldRow}>
                    <input
                      type="text"
                      placeholder="증상 키워드 힌트"
                      value={editTargetSymptomKeywords}
                      onChange={(e) => setEditTargetSymptomKeywords(e.target.value)}
                    />
                    <select
                      value={editLinkedTestType}
                      onChange={(e) => setEditLinkedTestType(e.target.value as LinkedTestType | "")}
                    >
                      <option value="">연결검사 없음</option>
                      <option value="BODY_COMPOSITION">인바디</option>
                      <option value="STRENGTH_TEST">근력검사</option>
                    </select>
                  </div>
                  <input
                    type="text"
                    placeholder={`공개 티칭지 전환버튼 문구 (선택, 기본값: "${DEFAULT_CTA_LABEL_PLACEHOLDER}")`}
                    value={editCtaButtonLabel}
                    onChange={(e) => setEditCtaButtonLabel(e.target.value)}
                  />

                  <div className={styles.contentSectionLabel}>셀링포인트 (직원 작성, 3개)</div>
                  <FieldGroup
                    fields={SELLING_FIELDS}
                    values={editFields}
                    onChange={(key, value) => setEditFields((prev) => ({ ...prev, [key]: value }))}
                  />

                  <div className={styles.contentSectionLabel}>학술 (원장 작성, 3개)</div>
                  <FieldGroup
                    fields={ACADEMIC_FIELDS}
                    values={editFields}
                    onChange={(key, value) => setEditFields((prev) => ({ ...prev, [key]: value }))}
                  />

                  {item.supportImagePath && !editRemoveImage && (
                    <div className={styles.imageActionRow}>
                      <img src={item.supportImagePath} alt="" className={styles.thumbnail} />
                      <button
                        type="button"
                        className={styles.deactivateButton}
                        onClick={() => setEditRemoveImage(true)}
                      >
                        이미지 제거
                      </button>
                    </div>
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => setEditNewImage(e.target.files?.[0] ?? null)}
                  />

                  {editError && <p className={styles.errorText}>{editError}</p>}
                  <div className={styles.rowActions}>
                    <button
                      type="button"
                      className={styles.editButton}
                      onClick={() => saveEdit(item.id)}
                      disabled={editSaving}
                    >
                      저장
                    </button>
                    <button type="button" className={styles.editButton} onClick={cancelEdit}>
                      취소
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  key={item.id}
                  className={item.isActive ? styles.card : `${styles.card} ${styles.cardInactive}`}
                >
                  <div className={styles.cardHeader}>
                    <span className={styles.cardTitle}>{item.programName}</span>
                    <span className={item.isActive ? styles.statusActive : styles.statusInactive}>
                      {item.isActive ? "활성" : "비활성"}
                    </span>
                  </div>
                  <div className={styles.cardMeta}>
                    연결검사: {linkedTestTypeLabel(item.linkedTestType)}
                    {item.targetSymptomKeywords ? ` · 증상 키워드: ${item.targetSymptomKeywords}` : ""}
                    {` · 전환버튼: ${item.ctaButtonLabel ?? DEFAULT_CTA_LABEL_PLACEHOLDER}`}
                  </div>
                  <div className={styles.completionBadge}>
                    셀링 {countFilled(item, SELLING_FIELDS)}/{SELLING_FIELDS.length}, 학술{" "}
                    {countFilled(item, ACADEMIC_FIELDS)}/{ACADEMIC_FIELDS.length} 작성됨
                  </div>
                  {item.supportImagePath && (
                    <img src={item.supportImagePath} alt="" className={styles.thumbnail} />
                  )}
                  <div className={styles.rowActions}>
                    <button type="button" className={styles.editButton} onClick={() => startEdit(item)}>
                      수정
                    </button>
                    <button
                      type="button"
                      className={item.isActive ? styles.deactivateButton : styles.activateButton}
                      onClick={() => toggleActive(item)}
                    >
                      {item.isActive ? "비활성화" : "재활성화"}
                    </button>
                  </div>
                </div>
              ),
            )}
          </div>
        )}
      </div>
    </div>
  );
}
