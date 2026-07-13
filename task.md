# 작업지시서 — 프로그램티칭/이벤트이미지 원장실↔집 PC Git 기반 동기화

## 배경
- 환자 데이터(dev.db)는 PC별로 완전히 분리 운영하는 것이 원칙 (기존과 동일하게 유지)
- 단, ProgramTeaching(프로그램티칭)과 EventImage(이벤트이미지)는 "콘텐츠 자산" 성격이라
  원장실 PC와 집 PC 양쪽에서 동일하게 보이도록 동기화 필요
- 이미 쓰고 있는 git pull/push 루틴에 얹는 방식으로, 새 인프라 없이 처리

## 1. 스키마 변경 — 동기화용 고유식별자 추가
- ProgramTeaching, EventImage 두 모델에 각각 `syncKey String @unique` 필드 추가
  (Prisma `cuid()` 또는 `uuid()` 기본값으로 생성 — 레코드 생성 시 자동 부여)
- 기존 레코드에는 마이그레이션 시 일괄로 고유값 채워넣기 (백필)
- 이 필드는 두 PC의 DB가 서로 다른 autoincrement id를 갖더라도 "같은 레코드"임을
  판별하는 용도로만 사용, 화면 노출 불필요

## 2. 내보내기 스크립트 (`prisma/export-shared-data.ts`)
- ProgramTeaching 전체 레코드 + EventImage 전체 레코드를 조회
- 결과를 `shared-data/program-teaching.json`, `shared-data/event-images.json`으로 저장
  (사람이 봐도 되는 pretty-print JSON)
- 각 레코드에 연결된 이미지 파일(ProgramTeaching.supportImagePath,
  EventImage.backgroundImagePath, EventImage.compositeImagePath)이 있으면
  `shared-data/images/` 폴더로 복사 (파일명은 syncKey 기반으로 충돌 없게 생성,
  예: `{syncKey}_support.png`)
- JSON 안의 이미지 경로 필드는 상대경로(`shared-data/images/xxx.png`)로 기록해
  어느 PC에서 열어도 동일하게 해석되도록 함
- `import "dotenv/config"` 최상단 포함 (seed 스크립트와 동일 패턴)
- `npm run db:export-shared` 스크립트로 package.json에 등록

## 3. 가져오기 스크립트 (`prisma/import-shared-data.ts`)
- `shared-data/program-teaching.json`, `shared-data/event-images.json` 읽기
- syncKey 기준으로 upsert (있으면 갱신, 없으면 생성) — 기존 시드 스크립트들과
  동일한 안전한 패턴, 로컬에서만 만든 테스트 데이터가 있어도 실수로 지워지지 않게
  "JSON에 없는 로컬 레코드는 그대로 둔다"는 원칙 유지 (삭제 동기화는 하지 않음,
  삭제는 각 PC에서 수동으로)
- 이미지 파일은 `shared-data/images/`에서 실제 서비스 이미지 경로(public/uploads 등
  기존 관례 위치)로 복사
- `import "dotenv/config"` 최상단 포함
- `npm run db:import-shared` 스크립트로 package.json에 등록

## 4. .gitignore 확인
- `shared-data/` 폴더는 git 추적 대상이어야 함 (기존 dev.db 제외 룰과 헷갈리지 않게
  명시적으로 확인)
- 이미지 파일 용량이 너무 크지 않은지 확인 (개별 이미지 1-2MB 이내면 git으로 충분,
  그 이상이면 별도 논의)

## 5. 작업 루틴 문서화 (README 또는 기존 로그 파일 규칙에 맞춰 별도 안내 파일)
- 세션 종료 시(작업 PC에서): `npm run db:export-shared` → `git add . && git commit && git push`
- 세션 시작 시(다른 PC에서): `git pull` → `npm run db:import-shared`
- 기존 `git pull → npm install → prisma migrate → prisma generate → npm run dev` 루틴
  마지막에 `npm run db:import-shared` 한 줄 추가하는 것으로 통합 권장

## 검증 체크리스트
- [ ] 마이그레이션 후 기존 ProgramTeaching/EventImage 레코드에 syncKey 정상 백필 확인
- [ ] export 실행 → JSON + 이미지 파일 정상 생성 확인
- [ ] (다른 PC 시뮬레이션 어려우면 같은 PC에서) DB 일부 레코드 삭제 후 import 실행 →
      정상 복구되는지 확인
- [ ] import 시 로컬에만 있던 테스트 레코드가 삭제되지 않고 유지되는지 확인
- [ ] 이미지 경로가 두 상황(export 직후 / import 후) 모두 정상적으로 화면에 렌더링되는지 확인
- [ ] `npx tsc --noEmit`, `npm run build` 통과

## 완료 후 보고
- 신규/수정 파일 목록
- 검증 체크리스트 결과
- 실제 export → (다른 PC 가정) import 흐름을 어떻게 테스트했는지
- git commit/push는 원장님 확인 후 진행