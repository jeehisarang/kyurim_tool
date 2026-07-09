import Link from "next/link";
import styles from "./ExamButton.module.css";

/**
 * /visit-check, /home의 "내원한 환자 목록"에서 공유하는 검사 등록 진입 버튼.
 * 환자 재검색 없이 /examinations/new에 patientId를 넘겨 바로 검사 폼으로 이동한다.
 */
export default function ExamButton({ patientId }: { patientId: number }) {
  return (
    <Link href={`/examinations/new?patientId=${patientId}`} className={styles.examButton}>
      검사
    </Link>
  );
}
