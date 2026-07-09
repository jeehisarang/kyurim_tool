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

// 사지골격근량 합산(limbMuscleMassKg)과 SMI를 함께 계산하는 공용 함수.
// BodyCompositionRecord(인바디)와 StrengthTestRecord(근력검사) 양쪽에서 재사용한다 —
// 같은 공식을 두 곳에 따로 두면 기준 변경 시 한쪽만 고치는 실수가 날 수 있어서 분리.
export function computeSmi(
  heightCm: number,
  rightArmKg: number,
  leftArmKg: number,
  rightLegKg: number,
  leftLegKg: number,
): { limbMuscleMassKg: number; smi: number } {
  const heightM = heightCm / 100;
  const limbMuscleMassKg = rightArmKg + leftArmKg + rightLegKg + leftLegKg;
  return { limbMuscleMassKg, smi: limbMuscleMassKg / (heightM * heightM) };
}

// 체중/키로 BMI를 실시간 계산(저장하지 않음 — 화면 표시 전용).
export function computeBmi(weightKg: number, heightCm: number): number {
  const heightM = heightCm / 100;
  return weightKg / (heightM * heightM);
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

// 근력나이(Grip Age): 평균악력을 또래 평균과 비교해 "환산 나이"로 보여주는 참고 지표.
// SMI는 나이별 기준표가 없어 동일 방식을 적용하지 않는다(기존 정상/근감소증 판정만 유지).
export type GripAgeOutOfRange = "young" | "old";

// 대표나이 순서와 각 성별 NORMAL구간 중앙값 — 악력이 클수록(젊을수록) 값이 크다.
// 두 배열은 인덱스로 1:1 대응한다.
const GRIP_AGE_REPRESENTATIVE_AGES = [22, 27, 32, 37, 42, 47, 52, 57, 62, 67, 72];
const GRIP_AGE_MEDIAN: Record<Gender, number[]> = {
  MALE: [46.7, 47.6, 45.9, 45.7, 45.4, 44.6, 41.8, 39.6, 39.1, 36.1, 28.2],
  FEMALE: [28.4, 33.5, 28.4, 27.2, 25.8, 25.5, 25.0, 24.6, 24.1, 21.45, 19.6],
};

export function computeGripAge(
  gender: Gender,
  avgGripKg: number,
): { estimatedAge: number | null; outOfRange: GripAgeOutOfRange | null } {
  const values = GRIP_AGE_MEDIAN[gender];
  const youngestValue = values[0];
  const oldestValue = values[values.length - 1];

  if (avgGripKg >= youngestValue) return { estimatedAge: null, outOfRange: "young" };
  if (avgGripKg <= oldestValue) return { estimatedAge: null, outOfRange: "old" };

  // 표가 22→27세 구간에서 잠깐 오르다 이후 감소하는 등 단조롭지 않으므로, 어린 나이부터
  // 순서대로 avgGripKg가 걸리는 첫 구간을 찾아 그 두 대표나이 사이에서 선형보간한다.
  for (let i = 0; i < values.length - 1; i++) {
    const v0 = values[i];
    const v1 = values[i + 1];
    const lo = Math.min(v0, v1);
    const hi = Math.max(v0, v1);
    if (avgGripKg >= lo && avgGripKg <= hi) {
      const a0 = GRIP_AGE_REPRESENTATIVE_AGES[i];
      const a1 = GRIP_AGE_REPRESENTATIVE_AGES[i + 1];
      const t = (avgGripKg - v0) / (v1 - v0);
      return { estimatedAge: Math.round(a0 + t * (a1 - a0)), outOfRange: null };
    }
  }

  return { estimatedAge: null, outOfRange: null };
}

export const GRIP_AGE_OUT_OF_RANGE_LABEL: Record<GripAgeOutOfRange, string> = {
  young: "20세 미만",
  old: "80세 이상",
};

// 환자용 노출 문구(향후 대비 — 이번 단계에서는 상수로만 준비, 실제 화면에는 아직 연결하지 않음).
export function gripAgePatientMessage(
  estimatedAge: number | null,
  outOfRange: GripAgeOutOfRange | null,
): string {
  if (outOfRange === "young") return "또래 평균 범위를 벗어난 근력입니다 (20세 미만 수준)";
  if (outOfRange === "old") return "또래 평균 범위를 벗어난 근력입니다 (80세 이상 수준)";
  return `또래 평균과 비교했을 때 약 ${estimatedAge}세 수준의 근력입니다`;
}

// 이전 검사 대비 근력나이 추이. "나이"가 낮을수록(젊을수록) 근력이 좋다는 뜻이라 개선으로 본다 —
// young(범위 미만, 최연소보다 젊음)이 가장 좋은 쪽, old(범위 초과)가 가장 나쁜 쪽 극단이다.
export type GripAgeTrend = "IMPROVED" | "MAINTAINED" | "WORSENED";

function gripAgeOrder(estimatedAge: number | null, outOfRange: GripAgeOutOfRange | null): number {
  if (outOfRange === "young") return -Infinity;
  if (outOfRange === "old") return Infinity;
  return estimatedAge ?? Infinity;
}

export function computeGripAgeTrend(
  current: { estimatedAge: number | null; outOfRange: GripAgeOutOfRange | null },
  previous: { estimatedAge: number | null; outOfRange: GripAgeOutOfRange | null },
): GripAgeTrend {
  const c = gripAgeOrder(current.estimatedAge, current.outOfRange);
  const p = gripAgeOrder(previous.estimatedAge, previous.outOfRange);
  if (c < p) return "IMPROVED";
  if (c > p) return "WORSENED";
  return "MAINTAINED";
}
