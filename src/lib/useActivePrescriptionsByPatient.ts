"use client";

import { useEffect, useState } from "react";

export type ActivePrescriptionBadge = { prescriptionId: number; id: number; name: string };

type ActivePrescriptionGroup = {
  patient: { id: number };
  prescriptions: { prescriptionId: number; program: { id: number; name: string } }[];
};

/**
 * 환자별 진행중 치료처방 배지 표시용 공용 훅 — /home, /visit-check가 동일한
 * /api/prescriptions/list 데이터를 함께 재사용한다. 배지 클릭 시
 * /prescriptions/[prescriptionId] 상세페이지로 이동하려면 프로그램 정보뿐 아니라
 * prescriptionId도 함께 필요해서(task2.md) program 필드만 쓰던 예전 구현에서
 * prescriptionId를 포함하도록 확장했다.
 */
export function useActivePrescriptionsByPatient(): Map<number, ActivePrescriptionBadge[]> {
  const [map, setMap] = useState<Map<number, ActivePrescriptionBadge[]>>(new Map());

  useEffect(() => {
    fetch("/api/prescriptions/list")
      .then((res) => res.json())
      .then((groups: ActivePrescriptionGroup[]) => {
        const next = new Map<number, ActivePrescriptionBadge[]>();
        for (const g of groups) {
          next.set(
            g.patient.id,
            g.prescriptions.map((p) => ({ prescriptionId: p.prescriptionId, ...p.program })),
          );
        }
        setMap(next);
      });
  }, []);

  return map;
}
