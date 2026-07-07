// 근력검사(SMI/악력) 판정 기준 상수 모듈. 순수 함수만 포함 — 클라이언트(미리보기)와
// 서버(저장 시 재계산) 양쪽에서 그대로 import해서 같은 공식을 공유한다.
// 이 기준표는 임상적으로 고정된 참고값이라 DB가 아닌 코드 상수로 관리한다(설계안 2번 참고).
// 기준이 바뀌면 이 파일만 수정하면 됨 — 단, 과거 기록의 판정은 저장 시점 값 그대로 유지된다.

export type Gender = "MALE" | "FEMALE";
export type SmiJudgement = "NORMAL" | "SARCOPENIA";
export type GripJudgement = "WEAK" | "NORMAL" | "STRONG" | "UNKNOWN";

export const SMI_THRESHOLD: Record<Gender, number> = {
  MALE: 7.0,
  FEMALE: 5.7,
};

export function calcSmi(input: {
  armMuscleMassLeftKg: number;
  armMuscleMassRightKg: number;
  legMuscleMassLeftKg: number;
  legMuscleMassRightKg: number;
  heightCm: number;
}): number {
  const heightM = input.heightCm / 100;
  const totalMuscleKg =
    input.armMuscleMassLeftKg +
    input.armMuscleMassRightKg +
    input.legMuscleMassLeftKg +
    input.legMuscleMassRightKg;
  return totalMuscleKg / (heightM * heightM);
}

export function judgeSmi(gender: Gender, smi: number): SmiJudgement {
  return smi < SMI_THRESHOLD[gender] ? "SARCOPENIA" : "NORMAL";
}

export function calcGripAvg(gripLeftKg: number, gripRightKg: number): number {
  return (gripLeftKg + gripRightKg) / 2;
}

// 연령대별 악력 기준표(kg). low 미만 WEAK, low~high NORMAL(양끝 포함), high 초과 STRONG.
type GripBand = {
  minAge: number;
  maxAge: number;
  male: { low: number; high: number };
  female: { low: number; high: number };
};

export const GRIP_STRENGTH_TABLE: GripBand[] = [
  { minAge: 20, maxAge: 24, male: { low: 36.8, high: 56.6 }, female: { low: 21.5, high: 35.3 } },
  { minAge: 25, maxAge: 29, male: { low: 37.7, high: 57.5 }, female: { low: 25.6, high: 41.4 } },
  { minAge: 30, maxAge: 34, male: { low: 36.0, high: 55.8 }, female: { low: 21.5, high: 35.3 } },
  { minAge: 35, maxAge: 39, male: { low: 35.8, high: 55.6 }, female: { low: 20.3, high: 34.1 } },
  { minAge: 40, maxAge: 44, male: { low: 35.5, high: 55.3 }, female: { low: 18.9, high: 32.7 } },
  { minAge: 45, maxAge: 49, male: { low: 34.7, high: 54.5 }, female: { low: 18.6, high: 32.4 } },
  { minAge: 50, maxAge: 54, male: { low: 32.9, high: 50.7 }, female: { low: 18.1, high: 31.9 } },
  { minAge: 55, maxAge: 59, male: { low: 30.7, high: 48.5 }, female: { low: 17.7, high: 31.5 } },
  { minAge: 60, maxAge: 64, male: { low: 30.2, high: 48.0 }, female: { low: 17.2, high: 31.0 } },
  { minAge: 65, maxAge: 69, male: { low: 28.2, high: 44.0 }, female: { low: 15.4, high: 27.5 } },
  { minAge: 70, maxAge: 99, male: { low: 21.3, high: 35.1 }, female: { low: 14.7, high: 24.5 } },
];

export function judgeGrip(gender: Gender, age: number, gripAvgKg: number): GripJudgement {
  const band = GRIP_STRENGTH_TABLE.find((b) => age >= b.minAge && age <= b.maxAge);
  if (!band) return "UNKNOWN";
  const { low, high } = gender === "MALE" ? band.male : band.female;
  if (gripAvgKg < low) return "WEAK";
  if (gripAvgKg > high) return "STRONG";
  return "NORMAL";
}
