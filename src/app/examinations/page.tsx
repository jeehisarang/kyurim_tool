"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import styles from "./page.module.css";
import BackButton from "@/components/BackButton";
import {
  type ExaminationRow,
  EXAM_TYPE_LABEL,
  GRIP_AGE_TREND_LABEL,
  bmiCell,
  bodyFatCell,
  computeGripAgeTrendMap,
  formatExamDate,
  gripAgeLabel,
  gripLabel,
  hrvSummaryLabel,
  isSmiConcerning,
  rowKey,
  smiLabel,
  weightCell,
  whrCell,
} from "@/lib/examination-format";

const PAGE_SIZE = 10;

type ExamTypeFilter = "ALL" | "BODY_COMPOSITION" | "STRENGTH_TEST" | "HRV";

const EXAM_TYPE_FILTER_TABS: { key: ExamTypeFilter; label: string }[] = [
  { key: "ALL", label: "전체보기" },
  { key: "BODY_COMPOSITION", label: "인바디" },
  { key: "STRENGTH_TEST", label: "근력검사" },
  { key: "HRV", label: "자율신경맥파(HRV)" },
];

function isExamTypeFilter(value: string | null): value is ExamTypeFilter {
  return (
    value === "ALL" || value === "BODY_COMPOSITION" || value === "STRENGTH_TEST" || value === "HRV"
  );
}

export default function ExaminationListPage() {
  return (
    <Suspense fallback={null}>
      <ExaminationListPageInner />
    </Suspense>
  );
}

function ExaminationListPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [rows, setRows] = useState<ExaminationRow[] | null>(null);
  const [patientFilter, setPatientFilter] = useState(() => searchParams.get("q") ?? "");
  const [examTypeFilter, setExamTypeFilter] = useState<ExamTypeFilter>(() => {
    const raw = searchParams.get("type");
    return isExamTypeFilter(raw) ? raw : "ALL";
  });
  const [page, setPage] = useState(() => Number(searchParams.get("page")) || 1);
  // 기본은 활성 기록만(task2.md) — 토글 켜면 소프트삭제된 기록도 함께 불러와 흐리게 표시.
  const [showInactive, setShowInactive] = useState(false);

  function loadRows() {
    const query = showInactive ? "?includeInactive=1" : "";
    fetch(`/api/examinations${query}`)
      .then((res) => res.json())
      .then(setRows);
  }

  useEffect(() => {
    loadRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showInactive]);

  const filteredRows = useMemo(() => {
    if (!rows) return [];
    const q = patientFilter.trim();
    return rows.filter((r) => {
      if (examTypeFilter !== "ALL" && r.examType !== examTypeFilter) return false;
      if (q && !r.patient.name.includes(q) && !r.patient.chartNumber.includes(q)) return false;
      return true;
    });
  }, [rows, patientFilter, examTypeFilter]);

  // BODY_COMPOSITION/STRENGTH_TEST는 기존 상세화면과 같은 라우트, HRV는 전용 라우트를 쓴다
  // (goToDetail의 examType별 분기와 동일한 이유).
  async function handleDelete(e: React.MouseEvent, row: ExaminationRow) {
    e.stopPropagation();
    if (!window.confirm("이 검사 기록을 삭제하시겠습니까? (목록/통계에서 제외되며, 필요하면 목록에서 다시 볼 수 있습니다)")) {
      return;
    }
    const url = row.examType === "HRV" ? `/api/hrv-records/${row.id}` : `/api/examinations/${row.examType}/${row.id}`;
    try {
      const res = await fetch(url, { method: "DELETE" });
      if (!res.ok) {
        alert("삭제에 실패했습니다. 다시 시도해주세요.");
        return;
      }
      loadRows();
    } catch {
      alert("서버에 연결하지 못했습니다. 삭제되지 않았으니 다시 시도해주세요.");
    }
  }

  // 필터/검색 탭을 바꾸면 항상 1페이지로 되돌린다 — 이전 필터 기준 마지막 페이지에 남아있으면
  // 새 필터 결과가 그보다 적어 "결과 없음"으로 보이는 혼란이 생긴다.
  useEffect(() => {
    setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientFilter, examTypeFilter]);

  // 검색/필터/페이지 상태를 URL 쿼리스트링에 그대로 반영해둔다 — 상세보기로 갔다가
  // 뒤로가기(router.back())로 돌아오면 이 URL이 그대로 다시 로드되면서 검색 상태가
  // 복원된다(컴포넌트 로컬 state만으로는 페이지 이탈 시 사라져서 복원이 안 됨).
  const currentQueryString = useMemo(() => {
    const params = new URLSearchParams();
    if (patientFilter) params.set("q", patientFilter);
    if (examTypeFilter !== "ALL") params.set("type", examTypeFilter);
    if (page > 1) params.set("page", String(page));
    return params.toString();
  }, [patientFilter, examTypeFilter, page]);

  useEffect(() => {
    router.replace(currentQueryString ? `/examinations?${currentQueryString}` : "/examinations", {
      scroll: false,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentQueryString]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const pagedRows = filteredRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // 근력나이 추이는 환자별 시계열 비교이므로 필터/페이지와 무관하게 전체 rows 기준으로
  // 미리 계산해둔다(페이지를 넘겨도 "직전 기록과의 비교"가 끊기지 않아야 하기 때문). 단,
  // "비활성 항목 보기"를 켜서 화면에 소프트삭제 기록이 섞여도 추이 계산 자체는 항상
  // 활성 기록만으로 한다(task2.md 4번 — 삭제된 기록이 통계에 섞이면 안 됨).
  const gripAgeTrendByRowKey = useMemo(
    () => computeGripAgeTrendMap((rows ?? []).filter((r) => r.isActive), true),
    [rows],
  );

  function goToPatientHistory(e: React.MouseEvent, patientId: number) {
    e.stopPropagation();
    router.push(`/examinations/patient/${patientId}`);
  }

  function goToDetail(row: ExaminationRow) {
    // HRV는 [examType]/[id](인바디/근력검사 전용 구조) 대신 별도 정적 라우트
    // /examinations/hrv/[id](원장 확인 화면)로 간다 — /api/examinations/[examType]/[id]가
    // HRV를 지원하지 않아 그대로 붙이면 400이 난다(task2.md).
    if (row.examType === "HRV") {
      router.push(`/examinations/hrv/${row.id}`);
      return;
    }
    // 현재 검색/필터/페이지 상태를 함께 실어 보내 상세보기의 "← 검사 목록"이
    // 정확히 이 상태로 복귀할 수 있게 한다.
    const from = currentQueryString ? `?from=${encodeURIComponent(currentQueryString)}` : "";
    router.push(`/examinations/${row.examType}/${row.id}${from}`);
  }

  return (
    <div className={styles.container}>
      <div className={styles.pageHeader}>
        <div className={styles.titleGroup}>
          <BackButton />
          <h1 className={styles.pageTitle}>검사 목록</h1>
        </div>
        <Link href="/examinations/new" className={styles.newLink}>
          + 신규 등록
        </Link>
      </div>

      <div className={styles.filterRow}>
        {EXAM_TYPE_FILTER_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={examTypeFilter === tab.key ? styles.filterButtonActive : styles.filterButton}
            onClick={() => setExamTypeFilter(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className={styles.filterRow}>
        <input
          type="text"
          placeholder="환자명 또는 차트번호로 필터"
          value={patientFilter}
          onChange={(e) => setPatientFilter(e.target.value)}
        />
        <label className={styles.inactiveToggle}>
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
          />
          비활성 항목 보기
        </label>
      </div>

      <div className={styles.section}>
        {rows === null && <p className={styles.muted}>불러오는 중...</p>}
        {rows !== null && filteredRows.length === 0 && (
          <p className={styles.muted}>등록된 검사가 없습니다.</p>
        )}
        {pagedRows.length > 0 && (
          <>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>환자명</th>
                  <th>검사종류</th>
                  <th>측정일</th>
                  <th>체중</th>
                  <th>BMI</th>
                  <th>체지방율</th>
                  <th>WHR</th>
                  <th>SMI(판정)</th>
                  <th>악력(판정)</th>
                  <th>근력나이(추이)</th>
                  <th>HRV 요약</th>
                  <th>측정자</th>
                  <th>상태</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {pagedRows.map((row) => {
                  const trend = gripAgeTrendByRowKey.get(rowKey(row));
                  return (
                    <tr
                      key={rowKey(row)}
                      className={row.isActive ? styles.clickableRow : `${styles.clickableRow} ${styles.inactiveRow}`}
                      onClick={() => goToDetail(row)}
                    >
                      <td>
                        <button
                          type="button"
                          className={styles.patientNameButton}
                          onClick={(e) => goToPatientHistory(e, row.patient.id)}
                        >
                          {row.patient.name}
                        </button>{" "}
                        <span className={styles.mono}>({row.patient.chartNumber})</span>
                      </td>
                      <td>{EXAM_TYPE_LABEL[row.examType]}</td>
                      <td className={styles.mono}>{formatExamDate(row.examDate)}</td>
                      <td className={styles.mono}>{weightCell(row)}</td>
                      <td className={styles.mono}>{bmiCell(row)}</td>
                      <td className={styles.mono}>{bodyFatCell(row)}</td>
                      <td className={styles.mono}>{whrCell(row)}</td>
                      <td className={isSmiConcerning(row) ? styles.judgementBad : undefined}>
                        {smiLabel(row)}
                      </td>
                      <td
                        className={
                          row.examType === "STRENGTH_TEST" && row.gripJudgement === "WEAK"
                            ? styles.judgementBad
                            : undefined
                        }
                      >
                        {gripLabel(row)}
                      </td>
                      <td className={trend === "WORSENED" ? styles.judgementBad : undefined}>
                        {gripAgeLabel(row)}
                        {trend && ` (${GRIP_AGE_TREND_LABEL[trend]})`}
                      </td>
                      <td>{hrvSummaryLabel(row)}</td>
                      <td>{row.staffUserName}</td>
                      <td className={row.isActive ? undefined : styles.statusInactive}>
                        {row.isActive ? "활성" : "비활성"}
                      </td>
                      <td>
                        {row.isActive && (
                          <button
                            type="button"
                            className={styles.deleteButton}
                            onClick={(e) => handleDelete(e, row)}
                          >
                            삭제
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {totalPages > 1 && (
              <div className={styles.paginationRow}>
                <button
                  type="button"
                  className={styles.pageNavButton}
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  이전
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
                  <button
                    key={n}
                    type="button"
                    className={n === page ? styles.pageButtonActive : styles.pageButton}
                    onClick={() => setPage(n)}
                  >
                    {n}
                  </button>
                ))}
                <button
                  type="button"
                  className={styles.pageNavButton}
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  다음
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
