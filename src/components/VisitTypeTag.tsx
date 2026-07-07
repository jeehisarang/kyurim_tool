import styles from "./VisitTypeTag.module.css";

const VISIT_TYPE_ICON: Record<string, string> = {
  초진: "🆕",
  재초진: "🆕",
  재진: "🔁",
  전화상담: "📞",
};

/** 진료구분(VisitType) 표시. 초진/재초진은 강조 스타일로 눈에 띄게 한다. */
export default function VisitTypeTag({ name }: { name: string }) {
  const isInitialVisit = name === "초진" || name === "재초진";
  const icon = VISIT_TYPE_ICON[name] ?? "🔹";

  return (
    <span className={isInitialVisit ? styles.emphasized : styles.normal}>
      {icon} {name}
    </span>
  );
}
