"use client";

import { useState } from "react";
import styles from "./CreditUsageModal.module.css";

function toDateInputValue(iso: string): string {
  return iso.slice(0, 10);
}

/**
 * 적립금 사용내역 "수정" 모달(task.md 수정/취소 기능) — 금액/사용일만 바꿀 수 있다.
 * CreditUsageModal과 같은 CSS(overlay/modal)를 재사용한다.
 */
export default function EditCreditUsageModal({
  usageId,
  patientName,
  initialAmount,
  initialUsedAt,
  staffUserId,
  onClose,
  onSaved,
}: {
  usageId: number;
  patientName: string;
  initialAmount: number;
  initialUsedAt: string;
  staffUserId: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [amount, setAmount] = useState(String(initialAmount));
  const [usedAt, setUsedAt] = useState(toDateInputValue(initialUsedAt));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const amountNumber = Number(amount);
  const isValidAmount = amount.trim() !== "" && Number.isFinite(amountNumber) && amountNumber > 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValidAmount || !usedAt) {
      setError("금액과 사용일을 입력해주세요.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/referral-credits/usage/${usageId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: amountNumber, usedAt, staffUserId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "수정에 실패했습니다.");
        return;
      }
      onSaved();
      onClose();
    } catch {
      setError("서버에 연결하지 못했습니다. 다시 시도해주세요.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <span className={styles.title}>{patientName}님 사용내역 수정</span>
          <button type="button" className={styles.closeButton} onClick={onClose}>
            닫기
          </button>
        </div>

        <form className={styles.form} onSubmit={handleSubmit}>
          <label className={styles.fieldLabel}>
            사용 금액(원)
            <input
              type="number"
              min={1}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              autoFocus
            />
          </label>

          <label className={styles.fieldLabel}>
            사용일
            <input type="date" value={usedAt} onChange={(e) => setUsedAt(e.target.value)} />
          </label>

          {error && <p className={styles.errorText}>{error}</p>}

          <div className={styles.actionsRow}>
            <button type="submit" className={styles.submitButton} disabled={saving}>
              {saving ? "저장 중..." : "저장"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
