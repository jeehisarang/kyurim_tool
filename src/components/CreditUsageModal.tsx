"use client";

import { useState } from "react";
import styles from "./CreditUsageModal.module.css";

/**
 * 적립금 "사용 처리" 모달(task.md) — /settings/referral-credits 전용. 잔액 초과 입력을
 * 막지는 않되(task.md 지시), 입력 중 실시간으로 경고 문구만 보여준다.
 */
export default function CreditUsageModal({
  patientId,
  patientName,
  currentBalance,
  staffUserId,
  onClose,
  onSaved,
}: {
  patientId: number;
  patientName: string;
  currentBalance: number;
  staffUserId: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const amountNumber = Number(amount);
  const isValidAmount = amount.trim() !== "" && Number.isFinite(amountNumber) && amountNumber > 0;
  const overBalance = isValidAmount && amountNumber > currentBalance;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValidAmount) {
      setError("사용 금액을 입력해주세요.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/referral-credits/usage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientId,
          amount: amountNumber,
          memo: memo.trim() || undefined,
          staffUserId,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "사용 처리에 실패했습니다.");
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
          <span className={styles.title}>{patientName}님 적립금 사용 처리</span>
          <button type="button" className={styles.closeButton} onClick={onClose}>
            닫기
          </button>
        </div>

        <p className={styles.balanceLine}>
          현재 잔액: <strong>{currentBalance.toLocaleString()}원</strong>
        </p>

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
          {overBalance && (
            <p className={styles.warningText}>
              ⚠ 현재 잔액({currentBalance.toLocaleString()}원)을 초과하는 금액입니다.
            </p>
          )}

          <label className={styles.fieldLabel}>
            메모(선택)
            <input
              type="text"
              placeholder="예: 1개월 결제 시 사용"
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
            />
          </label>

          {error && <p className={styles.errorText}>{error}</p>}

          <div className={styles.actionsRow}>
            <button type="submit" className={styles.submitButton} disabled={saving}>
              {saving ? "처리 중..." : "사용 처리"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
