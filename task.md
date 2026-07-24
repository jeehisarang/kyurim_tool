# 작업 지시서 — 추천링크 공유 기능 통합 버그 수정

## 배경
`/refer/my/[token]` 페이지에서 카카오톡 공유하기를 테스트하다가 문제 3가지 발견,
전부 원인이 연결되어 있어 한 번에 정리.

## 문제 1 — 링크가 로컬 IP로 생성됨
7/15에 공유링크(`/p/`, `/s/`) 생성을 `NEXT_PUBLIC_SHARE_BASE_URL` 환경변수
기반으로 통일했었는데(window.location.origin 폴백 방식), 이번 추천이벤트
기능(ReferralLink 관련 — 처방상세 링크 표시, `/refer/my`, 톡생성기 링크삽입 등)은
이 규칙을 안 따르고 접속 중인 주소(로컬 IP 포함)를 그대로 쓰고 있음.

### 수정
- ReferralLink 관련 URL을 생성하는 모든 지점(`referrals.ts`,
  `referral-share-format.ts`, 처방상세 페이지, 톡생성기 링크삽입 로직 등)을
  전수 조사해서 `NEXT_PUBLIC_SHARE_BASE_URL` 환경변수 기반으로 통일
  (`/p/`, `/s/`가 쓰던 것과 동일한 헬퍼 함수가 있으면 그대로 재사용)
- `window.location.origin`을 직접 참조하는 부분은 전부 제거

## 문제 2 — 카카오 공유 카드가 "내 추천 현황" 페이지 자기 자신을 가리킴
`/refer/my/[token]`에서 카톡 공유하기를 누르면, 받는 사람이 클릭했을 때
신청폼(`/refer/trial/[token]`)이 아니라 지금 보고 있던 "내 추천 현황" 페이지
(`/refer/my/[token]`) 자체가 다시 열림.

### 수정
- `/refer/my/[token]` 페이지에서 `KakaoShareButton` 호출 시, 공유할 링크로
  반드시 **해당 토큰의 신청폼 주소**(`{SHARE_BASE_URL}/refer/trial/[token]`)를
  명시적으로 전달하도록 수정 (현재 페이지 주소를 암묵적으로 쓰는 구조였다면 수정)
- "링크 복사" 버튼도 같은 문제(자기 자신 페이지 복사)가 있는지 함께 점검
- 문제 1의 SHARE_BASE_URL 수정과 합쳐서, 최종적으로
  `https://link.kyurim.kr/refer/trial/[token]`가 공유/복사되는지 확인

## 문제 3 — 카카오 공유 카드 문구가 적립금을 노골적으로 강조
받는 친구 입장에서 "적립금 받으려고 보내는구나" 느낌이 강한 문구.

### 수정
- 공유 템플릿 title/description을 아래로 변경:
  - title: "규림한의원 킬팻캡슐 3일체험"
  - description: "저도 해본 킬팻캡슐 3일체험, 부담없이 한번 받아보세요! 규림한의원에서 무료로 체험하실 수 있어요."
- 적립금 관련 문구는 카드에서 완전히 제거 (그 정보는 `/refer/my` 페이지 안에서
  본인만 보면 되는 정보)

## 검증
- `https://link.kyurim.kr/refer/my/[token]`에서 실제 표시 링크가 로컬 IP가 아닌
  `link.kyurim.kr` 기준인지 확인 (처방상세 페이지 표시값도 함께 확인)
- 카톡 공유 → 받은 카드 클릭 → 신청폼(`/refer/trial/...`)이 뜨는지 확인
  (내 추천현황 페이지가 다시 뜨면 안 됨)
- "링크 복사" 버튼도 신청폼 주소가 정확히 복사되는지 확인
- 새 문구로 카드가 뜨는지 확인 (적립금 언급 없이)
- 기존 `/p/`, `/s/` 링크 생성 및 PC/모바일 카카오 공유(webUrl/mobileWebUrl)에
  회귀 없는지 확인
- npx tsc --noEmit / npm run build 통과

## 완료 후 보고
- 수정 파일 경로
- 커밋 해시, git push 결과
- PC/모바일 양쪽 실제 클릭 테스트 결과