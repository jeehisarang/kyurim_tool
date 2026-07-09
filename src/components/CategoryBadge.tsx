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

// tier(카테고리 안 기간 길이 명도 단계)가 함께 주어지면 카테고리 기본 톤 대신 이 3단계 중
// 하나로 대체한다 — 환(S환/하비환)처럼 기간 개념이 없는 카테고리는 매핑에 없어 항상 기존
// 기본 톤으로 남는다.
const CATEGORY_TIER_TONE_CLASSES: Partial<Record<string, [string, string, string]>> = {
  탕약: [styles.tangTier1, styles.tangTier2, styles.tangTier3],
  킬팻캡슐: [styles.capsuleTier1, styles.capsuleTier2, styles.capsuleTier3],
};

/**
 * 범용 id-톤 뱃지(진료분야/프로그램 등). 프로그램이 늘어나도 색상을 새로 정의할 필요 없이
 * id를 기준으로 청자색 팔레트 내 톤을 순환 배정해 항상 구분 가능하게 한다.
 * name이 길면 truncate로 축약 표시하고, title 속성으로 항상 전체명을 확인할 수 있게 한다.
 * period가 주어지면 "이름 · 기간" 형식으로 표시하고 기간 부분만 굵게 강조한다.
 */
export default function CategoryBadge({
  id,
  name,
  truncate,
  onClick,
  categoryKey,
  icon,
  period,
  tier,
}: {
  id: number;
  name: string;
  truncate?: boolean;
  onClick?: () => void;
  categoryKey?: string;
  icon?: string;
  period?: string;
  tier?: 1 | 2 | 3;
}) {
  const tierTones = categoryKey ? CATEGORY_TIER_TONE_CLASSES[categoryKey] : undefined;
  const toneClass =
    (tier && tierTones?.[tier - 1]) ||
    (categoryKey && CATEGORY_TONE_CLASSES[categoryKey]) ||
    TONE_CLASSES[id % TONE_CLASSES.length];
  const className = [styles.badge, toneClass, truncate ? styles.truncate : "", onClick ? styles.clickable : ""]
    .filter(Boolean)
    .join(" ");
  const content = (
    <>
      {icon ? `${icon} ` : ""}
      {name}
      {period ? (
        <>
          {" · "}
          <strong className={styles.period}>{period}</strong>
        </>
      ) : null}
    </>
  );
  const titleText = period ? `${name} · ${period}` : name;

  if (onClick) {
    return (
      <button type="button" className={className} title={titleText} onClick={onClick}>
        {content}
      </button>
    );
  }

  return (
    <span className={className} title={titleText}>
      {content}
    </span>
  );
}
