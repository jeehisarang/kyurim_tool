"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import styles from "./page.module.css";
import CategoryBadge from "@/components/CategoryBadge";
import VisitTypeTag from "@/components/VisitTypeTag";
import NavTiles from "@/components/NavTiles";
import PatientHistoryModal from "@/components/PatientHistoryModal";
import TodoTaskTable, {
  buildTaskRows,
  isRowResolved,
  splitByDateScope,
  type Patient,
  type TodoTask,
} from "@/components/TodoTaskTable";
import ExamButton from "@/components/ExamButton";
import ProgramBadge from "@/components/ProgramBadge";
import { getCurrentUserId } from "@/lib/currentUser";
import { useActivePrescriptionsByPatient } from "@/lib/useActivePrescriptionsByPatient";

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

type Announcement = {
  id: number;
  title: string;
  content: string;
};

const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];
const WEEKDAY_FULL_LABELS = ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"];
const CALENDAR_STRIP_DAYS = 14;

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
  return (
    <Suspense fallback={null}>
      <HomePageInner />
    </Suspense>
  );
}

function HomePageInner() {
  const router = useRouter();
  const [selectedDate, setSelectedDate] = useState(() => startOfDay(new Date()));
  const [monthly, setMonthly] = useState<MonthlyDailyStats | null>(null);
  const [selectedVisits, setSelectedVisits] = useState<VisitRecord[] | null>(null);
  const [todoTasks, setTodoTasks] = useState<TodoTask[] | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [stampTaskId, setStampTaskId] = useState<number | null>(null);
  const [historyPatient, setHistoryPatient] = useState<Patient | null>(null);
  const [calendarExpanded, setCalendarExpanded] = useState(false);
  const [showResolved, setShowResolved] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const [staffUsers, setStaffUsers] = useState<StaffUser[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  // 환자별 진행중 치료처방 배지 표시용 — /prescriptions 목록과 동일한 데이터 재사용.
  const activePrescByPatientId = useActivePrescriptionsByPatient();

  useEffect(() => {
    fetch("/api/staff-users")
      .then((res) => res.json())
      .then(setStaffUsers);
  }, []);

  // 공지사항은 화면에서 넘겨보는 selectedDate와 무관하게 항상 실제 "오늘" 기준으로
  // 노출 여부를 판단한다(task2.md 요구사항 — 날짜 이동과 무관).
  useEffect(() => {
    fetch(`/api/announcements?activeOnly=1&date=${toDateParam(startOfDay(new Date()))}`)
      .then((res) => res.json())
      .then(setAnnouncements);
  }, []);

  // 요청이 실패하면(네트워크 순단, 서버 재시작 타이밍 등) 화면이 "불러오는 중"에서
  // 영원히 멈추지 않도록 반드시 에러 상태로 빠져나가게 한다 — 실사용 중 발견된 문제:
  // 에러 처리가 없으면 실패한 fetch 하나 때문에 새로고침 전까지 화면이 복구되지 않았다.
  useEffect(() => {
    setLoadError(false);
    fetch("/api/dashboard/daily")
      .then((res) => {
        if (!res.ok) throw new Error("dashboard/daily 응답 실패");
        return res.json();
      })
      .then(setMonthly)
      .catch(() => setLoadError(true));
  }, [retryKey]);

  useEffect(() => {
    setSelectedVisits(null);
    fetch(`/api/visits?date=${toDateParam(selectedDate)}`)
      .then((res) => {
        if (!res.ok) throw new Error("visits 응답 실패");
        return res.json();
      })
      .then(setSelectedVisits)
      .catch(() => setLoadError(true));
  }, [selectedDate, retryKey]);

  useEffect(() => {
    setTodoTasks(null);
    fetch(`/api/todo-tasks?date=${toDateParam(selectedDate)}`)
      .then((res) => {
        if (!res.ok) throw new Error("todo-tasks 응답 실패");
        return res.json();
      })
      .then(setTodoTasks)
      .catch(() => setLoadError(true));
  }, [selectedDate, refreshKey, retryKey]);

  // 날짜를 옮기면 "완료된 항목 보기" 펼침 상태를 초기화한다 (체크 후 재조회 때는 유지 —
  // 방금 완료 처리한 걸 보고 있는 도중에 패널이 갑자기 접히면 안 됨).
  useEffect(() => {
    setShowResolved(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate]);

  async function handleCheck(task: TodoTask) {
    const doneByUserId = getCurrentUserId();
    if (!doneByUserId) {
      alert("상단에서 현재 사용자를 먼저 선택하세요.");
      return;
    }

    await fetch(`/api/todo-tasks/${task.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ doneByUserId, action: "DONE" }),
    });

    setStampTaskId(task.id);
    setRefreshKey((k) => k + 1);
  }

  function handleManageTalk(patientId: number) {
    const params = new URLSearchParams({
      tab: "talk",
      talkGroup: "1",
      patientId: String(patientId),
      date: toDateParam(selectedDate),
    });
    router.push(`/ai-studio?${params.toString()}`);
  }

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

  // 접힌 상태에서는 오늘까지 발생한(미래 아닌) 날짜 중 최근 것만 최대 14일 보여준다.
  // 새 API 없이 이번달 daily 데이터 범위 안에서만 구성 — 월초라면 그만큼 적게 표시된다.
  const stripDays = monthly
    ? monthly.daily.filter((d) => !(isCurrentMonth && d.day > todayDayOfMonth)).slice(-CALENDAR_STRIP_DAYS)
    : [];

  // /todo와 동일한 스코프(밀린 할 일 중 미완료만 + 선택 날짜의 할 일)로 좁힌다 — 원본
  // /api/todo-tasks 응답은 완료 여부와 무관하게 dueDate < 선택일 전부를 반환하므로,
  // 그대로 쓰면 과거에 이미 완료된 건까지 섞여 나온다(실사용 버그로 확인됨).
  const { overdueUnresolved, dueOnDate } = splitByDateScope(todoTasks ?? [], selectedDate);
  const scopedTodoTasks = [...overdueUnresolved, ...dueOnDate];
  const todoDoneCount = scopedTodoTasks.filter((t) => t.isDone).length;
  const todoTotalCount = scopedTodoTasks.length;

  // 완료된 항목(행 기준 — 톡 그룹은 그룹 내 전부 완료/보류일 때만 완료로 침)은 기본적으로
  // 접어두고, "완료된 항목 보기" 토글로만 펼친다. 미완료 항목은 항상 노출한다.
  const todoRows = buildTaskRows(scopedTodoTasks);
  const unresolvedRows = todoRows.filter((row) => !isRowResolved(row));
  const resolvedRows = todoRows.filter((row) => isRowResolved(row));
  const rowTasks = (row: (typeof todoRows)[number]) =>
    row.kind === "single" ? [row.task] : row.group.tasks;
  const unresolvedTasks = unresolvedRows.flatMap(rowTasks);
  const resolvedTasks = resolvedRows.flatMap(rowTasks);

  const isToday = isSameDate(selectedDate, startOfDay(new Date()));
  const todoSectionTitle = isToday
    ? "오늘 할 일"
    : `${selectedDate.getMonth() + 1}월 ${selectedDate.getDate()}일 할 일`;

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

      {announcements.length > 0 && (
        <div className={styles.announcementList}>
          {announcements.map((a) => (
            <div key={a.id} className={styles.announcementCard}>
              <div className={styles.announcementTitle}>{a.title}</div>
              <div className={styles.announcementContent}>{a.content}</div>
            </div>
          ))}
        </div>
      )}

      {loadError && !monthly ? (
        <div className={styles.errorBox}>
          <p>화면을 불러오지 못했습니다. 네트워크 상태를 확인하고 다시 시도해 주세요.</p>
          <button type="button" onClick={() => setRetryKey((k) => k + 1)}>
            다시 시도
          </button>
        </div>
      ) : !monthly ? (
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
              {todoSectionTitle} ({todoTotalCount}건)
            </div>

            {todoTasks !== null && todoRows.length === 0 && (
              <p className={styles.muted}>처리할 항목이 없습니다.</p>
            )}
            {todoRows.length > 0 && (
              <>
                <div className={styles.weeklyHeader}>
                  <span>
                    오늘 할 일 처리 현황: {todoTotalCount}건 중 {todoDoneCount}건 완료
                  </span>
                </div>
                <div className={styles.progressTrack}>
                  <div
                    className={styles.progressFill}
                    style={{
                      width: `${Math.min(100, (todoDoneCount / todoTotalCount) * 100)}%`,
                    }}
                  />
                </div>

                {unresolvedRows.length === 0 ? (
                  <p className={styles.allDoneBanner}>오늘 할 일을 모두 처리했습니다 🎉</p>
                ) : (
                  <TodoTaskTable
                    tasks={unresolvedTasks}
                    referenceDate={selectedDate}
                    showDueBadge
                    stampTaskId={stampTaskId}
                    staffUsers={staffUsers}
                    onCheck={handleCheck}
                    onManageTalk={handleManageTalk}
                    onPatientClick={setHistoryPatient}
                    onWorkTaskChanged={() => setRefreshKey((k) => k + 1)}
                  />
                )}

                {resolvedRows.length > 0 && (
                  <>
                    <button
                      type="button"
                      className={styles.resolvedToggleButton}
                      onClick={() => setShowResolved((v) => !v)}
                    >
                      {showResolved ? "완료된 항목 접기" : `완료된 항목 보기 (${resolvedRows.length}건)`}
                    </button>
                    {showResolved && (
                      <TodoTaskTable
                        tasks={resolvedTasks}
                        referenceDate={selectedDate}
                        showDueBadge
                        stampTaskId={stampTaskId}
                        staffUsers={staffUsers}
                        onCheck={handleCheck}
                        onManageTalk={handleManageTalk}
                        onPatientClick={setHistoryPatient}
                        onWorkTaskChanged={() => setRefreshKey((k) => k + 1)}
                      />
                    )}
                  </>
                )}
              </>
            )}
          </div>

          <div className={styles.section}>
            <div className={styles.sectionTitle}>바로가기</div>
            <NavTiles />
          </div>

          <div className={styles.section}>
            <div className={styles.sectionTitleRow}>
              <div className={styles.sectionTitle}>
                이번달 흐름 ({monthly.year}.{String(monthly.month).padStart(2, "0")})
              </div>
              <button
                type="button"
                className={styles.calendarToggleButton}
                onClick={() => setCalendarExpanded((v) => !v)}
              >
                {calendarExpanded ? "접기" : "펼쳐보기"}
              </button>
            </div>

            {!calendarExpanded && (
              <div className={styles.miniStrip}>
                {stripDays.map((d) => {
                  const isToday = isCurrentMonth && d.day === todayDayOfMonth;
                  const isSelected =
                    monthly.year === selectedDate.getFullYear() &&
                    monthly.month === selectedDate.getMonth() + 1 &&
                    d.day === selectedDate.getDate();
                  return (
                    <div
                      key={d.date}
                      className={`${styles.miniCell} ${isToday ? styles.miniCellToday : ""} ${isSelected ? styles.miniCellSelected : ""}`}
                      style={{ background: cellBackground(d) }}
                      onClick={() => selectDay(d.day)}
                      title={`${d.day}일 · ${d.visitCount}건`}
                    >
                      <span className={styles.miniCellDay}>{d.day}</span>
                    </div>
                  );
                })}
              </div>
            )}

            {calendarExpanded && (
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
            )}
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
                    <th>검사</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedVisits.map((v) => (
                    <tr key={v.id}>
                      <td className={styles.mono}>{v.patient.chartNumber}</td>
                      <td>
                        <Link href={`/patients/${v.patient.id}`} className={styles.patientNameLink}>
                          {v.patient.name}
                        </Link>
                        {(activePrescByPatientId.get(v.patient.id) ?? []).map((program) => (
                          <span key={program.id} className={styles.inlineBadge}>
                            <ProgramBadge
                              id={program.id}
                              name={program.name}
                              onClick={() => router.push(`/prescriptions/${program.prescriptionId}`)}
                            />
                          </span>
                        ))}
                      </td>
                      <td>
                        <CategoryBadge id={v.treatmentCategory.id} name={v.treatmentCategory.name} />
                      </td>
                      <td>
                        <VisitTypeTag name={v.visitType.name} />
                      </td>
                      <td>{v.isReserved ? "예약함" : "예약안함"}</td>
                      <td>{v.checkedByUser?.name ?? "-"}</td>
                      <td>
                        <ExamButton patientId={v.patient.id} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {historyPatient && (
        <PatientHistoryModal
          patientId={historyPatient.id}
          patientName={historyPatient.name}
          onClose={() => setHistoryPatient(null)}
        />
      )}
    </div>
  );
}
