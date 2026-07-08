import styles from "./CategoryBadge.module.css";

const TONE_CLASSES = [
  styles.tone1,
  styles.tone2,
  styles.tone3,
  styles.tone4,
  styles.tone5,
];

// categoryKey가 주어지면(예: 치료처방 프로그램의 탕약/환/킬팻캡슐 그룹) id 순환톤 대신
// 카테고리 고유 톤을 쓴다 — 진료분야(TreatmentCategory) 등 categoryKey 없이 쓰는 기존
// 호출부는 영향받지 않는다.
const CATEGORY_TONE_CLASSES: Record<string, string> = {
  탕약: styles.categoryTang,
  환: styles.categoryHwan,
  킬팻캡슐: styles.categoryCapsule,
};

/**
 * 범용 id-톤 뱃지(진료분야/프로그램 등). 프로그램이 늘어나도 색상을 새로 정의할 필요 없이
 * id를 기준으로 청자색 팔레트 내 톤을 순환 배정해 항상 구분 가능하게 한다.
 * name이 길면 truncate로 축약 표시하고, title 속성으로 항상 전체명을 확인할 수 있게 한다.
 */
export default function CategoryBadge({
  id,
  name,
  truncate,
  onClick,
  categoryKey,
  icon,
}: {
  id: number;
  name: string;
  truncate?: boolean;
  onClick?: () => void;
  categoryKey?: string;
  icon?: string;
}) {
  const toneClass =
    (categoryKey && CATEGORY_TONE_CLASSES[categoryKey]) || TONE_CLASSES[id % TONE_CLASSES.length];
  const className = [styles.badge, toneClass, truncate ? styles.truncate : "", onClick ? styles.clickable : ""]
    .filter(Boolean)
    .join(" ");
  const label = icon ? `${icon} ${name}` : name;

  if (onClick) {
    return (
      <button type="button" className={className} title={name} onClick={onClick}>
        {label}
      </button>
    );
  }

  return (
    <span className={className} title={name}>
      {label}
    </span>
  );
}
