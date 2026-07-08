// 일요일은 휴진(근무자 없음) — 자동 생성되는 할 일의 마감일이 휴진일에 걸리면 안 된다.
const CLOSED_WEEKDAYS = [0]; // 0 = 일요일

export function isClosedDay(date: Date): boolean {
  return CLOSED_WEEKDAYS.includes(date.getDay());
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

/** 날짜가 휴진일이면 다음 진료일로 밀어준다(휴진일이 연속돼도 안전하도록 반복 처리). */
export function shiftPastClosedDays(date: Date): Date {
  let d = date;
  while (isClosedDay(d)) {
    d = addDays(d, 1);
  }
  return d;
}

/** from(제외) ~ to(포함) 사이에서 휴진일을 뺀 실제 진료일 수를 센다. */
export function countOpenDaysBetween(from: Date, to: Date): number {
  let count = 0;
  let d = addDays(from, 1);
  while (d.getTime() <= to.getTime()) {
    if (!isClosedDay(d)) count++;
    d = addDays(d, 1);
  }
  return count;
}
