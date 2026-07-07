"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import styles from "./page.module.css";
import { TALK_MESSAGE_TYPE_LABEL } from "@/lib/message-templates";

type Patient = { id: number; chartNumber: string; name: string };
type TreatmentCategory = { id: number; name: string };
type VisitType = { id: number; name: string };
type StaffUser = { id: number; name: string; role: string };
type VisitRecord = {
  id: number;
  isReserved: boolean;
  patient: Patient;
  treatmentCategory: TreatmentCategory;
  visitType: VisitType;
  checkedByUser: StaffUser | null;
};

type Program = { id: number; name: string };
type TodoCategory = "PRESCRIPTION" | "TALK";
type TodoTask = {
  id: number;
  category: TodoCategory;
  taskType: string;
  dueDate: string;
  patient: Patient;
  program: Program | null;
  staffUser: StaffUser | null;
  isDone: boolean;
  doneByUser: StaffUser | null;
};
type WeeklySummary = { weekDone: number; weekTotal: number };

const TASK_TYPE_LABEL: Record<string, string> = {
  NEXT_DOSE: "다음 처방일",
  FOLLOW_UP: "후속조치",
  ...TALK_MESSAGE_TYPE_LABEL,
};

const CATEGORY_LABEL: Record<TodoCategory, string> = {
  PRESCRIPTION: "처방",
  TALK: "톡",
};

const TODO_PREVIEW_COUNT = 5;

type DailyStat = {
  date: string;
  day: number;
  visitCount: number;
  reservationRate: number | null;
};

type MonthlyDailyStats = {
  year: number;
  month: number;
  daysInMonth: number;
  daily: DailyStat[];
  monthTotalVisits: number;
  monthAvgReservationRate: number;
};

const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];
const WEEKDAY_FULL_LABELS = ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"];

function formatPercent(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

function isSameDate(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function toDateParam(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatFullLabel(date: Date): string {
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일 (${WEEKDAY_FULL_LABELS[date.getDay()]})`;
}

function formatShortLabel(date: Date): string {
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.statCard}>
      <div className={styles.statValue}>{value}</div>
      <div className={styles.statLabel}>{label}</div>
    </div>
  );
}

function cellBackground(d: DailyStat): string | undefined {
  if (d.visitCount === 0 || d.reservationRate === null) return undefined;
  const alpha = 0.15 + d.reservationRate * 0.65;
  return `rgba(110, 148, 140, ${alpha})`;
}

export default function HomePage() {
  const [selectedDate, setSelectedDate] = useState(() => startOfDay(new Date()));
  const [monthly, setMonthly] = useState<MonthlyDailyStats | null>(null);
  const [selectedVisits, setSelectedVisits] = useState<VisitRecord[] | null>(null);
  const [todoTasks, setTodoTasks] = useState<TodoTask[] | null>(null);
  const [weeklySummary, setWeeklySummary] = useState<WeeklySummary | null>(null);

  useEffect(() => {
    fetch("/api/dashboard/daily")
      .then((res) => res.json())
      .then(setMonthly);
    fetch("/api/todo-tasks")
      .then((res) => res.json())
      .then(setTodoTasks);
    fetch("/api/todo-tasks/summary")
      .then((res) => res.json())
      .then(setWeeklySummary);
  }, []);

  useEffect(() => {
    setSelectedVisits(null);
    fetch(`/api/visits?date=${toDateParam(selectedDate)}`)
      .then((res) => res.json())
      .then(setSelectedVisits);
  }, [selectedDate]);

  const selectedVisitCount = selectedVisits?.length ?? 0;
  const selectedReservationRate =
    selectedVisits && selectedVisits.length > 0
      ? selectedVisits.filter((v) => v.isReserved).length / selectedVisits.length
      : 0;

  const today = new Date();
  const isCurrentMonth =
    monthly && monthly.year === today.getFullYear() && monthly.month === today.getMonth() + 1;
  const todayDayOfMonth = today.getDate();

  const leadingBlanks = monthly ? new Date(monthly.year, monthly.month - 1, 1).getDay() : 0;

  function selectDay(day: number) {
    if (!monthly) return;
    setSelectedDate(new Date(monthly.year, monthly.month - 1, day));
  }

  return (
    <div className={styles.container}>
      <h1 className={styles.pageTitle}>홈</h1>

      <div className={styles.dateNav}>
        <button
          type="button"
          className={styles.dateNavArrow}
          onClick={() => setSelectedDate((d) => addDays(d, -1))}
          aria-label="하루 전"
        >
          ◀
        </button>
        <span className={styles.dateNavLabel}>{formatFullLabel(selectedDate)}</span>
        <button
          type="button"
          className={styles.dateNavArrow}
          onClick={() => setSelectedDate((d) => addDays(d, 1))}
          aria-label="하루 후"
        >
          ▶
        </button>
        <button
          type="button"
          className={styles.dateNavTodayButton}
          onClick={() => setSelectedDate(startOfDay(new Date()))}
        >
          오늘
        </button>
      </div>

      {!monthly ? (
        <p className={styles.muted}>불러오는 중...</p>
      ) : (
        <>
          <div className={styles.cardGrid}>
            <StatCard
              label={`${formatShortLabel(selectedDate)} 내원`}
              value={`${selectedVisitCount}건`}
            />
            <StatCard
              label={`${formatShortLabel(selectedDate)} 예약율`}
              value={formatPercent(selectedReservationRate)}
            />
            <StatCard label="이번달 누적내원" value={`${monthly.monthTotalVisits}건`} />
            <StatCard
              label="이번달 평균예약율"
              value={formatPercent(monthly.monthAvgReservationRate)}
            />
          </div>

          <div className={styles.section}>
            <div className={styles.sectionTitle}>
              이번달 흐름 ({monthly.year}.{String(monthly.month).padStart(2, "0")})
            </div>

            <div className={styles.calendarGrid}>
              {WEEKDAY_LABELS.map((label) => (
                <div key={label} className={styles.weekdayLabel}>
                  {label}
                </div>
              ))}

              {Array.from({ length: leadingBlanks }).map((_, i) => (
                <div key={`blank-${i}`} className={styles.dayCellBlank} />
              ))}

              {monthly.daily.map((d) => {
                const isFuture = isCurrentMonth ? d.day > todayDayOfMonth : true;
                const isToday = isCurrentMonth && d.day === todayDayOfMonth;
                const isSelected =
                  monthly.year === selectedDate.getFullYear() &&
                  monthly.month === selectedDate.getMonth() + 1 &&
                  d.day === selectedDate.getDate();

                if (isFuture) {
                  return (
                    <div
                      key={d.date}
                      className={`${styles.dayCell} ${styles.dayCellFuture} ${isSelected ? styles.dayCellSelected : ""}`}
                      onClick={() => selectDay(d.day)}
                    >
                      <span className={styles.dayNumber}>{d.day}</span>
                    </div>
                  );
                }

                return (
                  <div
                    key={d.date}
                    className={`${styles.dayCell} ${isToday ? styles.dayCellToday : ""} ${isSelected ? styles.dayCellSelected : ""}`}
                    style={{ background: cellBackground(d) }}
                    onClick={() => selectDay(d.day)}
                  >
                    <span className={styles.dayNumber}>{d.day}</span>
                    <span className={styles.dayValue}>
                      {d.visitCount > 0 ? `${d.visitCount}건` : "-"}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className={styles.section}>
            <div className={styles.sectionTitle}>
              {selectedDate.getMonth() + 1}월 {selectedDate.getDate()}일 내원한 환자 목록 (
              {selectedVisits?.length ?? 0}건)
            </div>
            {selectedVisits !== null && selectedVisits.length === 0 && (
              <p className={styles.muted}>내원 기록이 없습니다.</p>
            )}
            {selectedVisits && selectedVisits.length > 0 && (
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>차트번호</th>
                    <th>이름</th>
                    <th>진료분야</th>
                    <th>진료구분</th>
                    <th>예약여부</th>
                    <th>체크한 사람</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedVisits.map((v) => (
                    <tr key={v.id}>
                      <td className={styles.mono}>{v.patient.chartNumber}</td>
                      <td>{v.patient.name}</td>
                      <td>{v.treatmentCategory.name}</td>
                      <td>{v.visitType.name}</td>
                      <td>{v.isReserved ? "예약함" : "예약안함"}</td>
                      <td>{v.checkedByUser?.name ?? "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className={styles.section}>
            <div className={styles.sectionTitle}>오늘 할 일 미리보기</div>

            {weeklySummary &&
              (weeklySummary.weekTotal === 0 ? (
                <p className={styles.muted}>이번주 예정된 작업이 없습니다.</p>
              ) : (
                <>
                  <div className={styles.weeklyHeader}>
                    <span>이번주 처리 현황</span>
                    <span className={styles.weeklyValue}>
                      {weeklySummary.weekDone}/{weeklySummary.weekTotal}건
                    </span>
                  </div>
                  <div className={styles.progressTrack}>
                    <div
                      className={styles.progressFill}
                      style={{
                        width: `${Math.min(
                          100,
                          (weeklySummary.weekDone / weeklySummary.weekTotal) * 100,
                        )}%`,
                      }}
                    />
                  </div>
                </>
              ))}

            {todoTasks !== null && todoTasks.length === 0 && (
              <p className={styles.muted}>오늘 처리할 항목이 없습니다.</p>
            )}
            {todoTasks && todoTasks.length > 0 && (
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>구분</th>
                    <th>환자명</th>
                    <th>할일종류</th>
                    <th>담당자</th>
                    <th>완료여부</th>
                  </tr>
                </thead>
                <tbody>
                  {todoTasks.slice(0, TODO_PREVIEW_COUNT).map((task) => (
                    <tr key={task.id}>
                      <td>
                        <span
                          className={
                            task.category === "PRESCRIPTION"
                              ? styles.categoryBadgePrescription
                              : styles.categoryBadgeTalk
                          }
                        >
                          {CATEGORY_LABEL[task.category]}
                        </span>
                      </td>
                      <td>{task.patient.name}</td>
                      <td>{TASK_TYPE_LABEL[task.taskType] ?? task.taskType}</td>
                      <td>{task.staffUser?.name ?? "미배정"}</td>
                      <td>
                        {task.isDone ? (
                          <span className={styles.doneLabel}>
                            완료 ({task.doneByUser?.name ?? "-"})
                          </span>
                        ) : (
                          "미완료"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <Link href="/todo" className={styles.moreLink}>
              더보기 →
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
