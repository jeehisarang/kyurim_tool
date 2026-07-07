import styles from "./CategoryBadge.module.css";

const TONE_CLASSES = [
  styles.tone1,
  styles.tone2,
  styles.tone3,
  styles.tone4,
  styles.tone5,
];

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
}: {
  id: number;
  name: string;
  truncate?: boolean;
  onClick?: () => void;
}) {
  const toneClass = TONE_CLASSES[id % TONE_CLASSES.length];
  const className = [styles.badge, toneClass, truncate ? styles.truncate : "", onClick ? styles.clickable : ""]
    .filter(Boolean)
    .join(" ");

  if (onClick) {
    return (
      <button type="button" className={className} title={name} onClick={onClick}>
        {name}
      </button>
    );
  }

  return (
    <span className={className} title={name}>
      {name}
    </span>
  );
}
