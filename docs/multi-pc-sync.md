# 원장실PC ↔ 집PC 동기화 루틴

## 무엇이 동기화되나
- **콘텐츠 자산만** git으로 동기화: `ProgramTeaching`(프로그램티칭), `EventImage`(이벤트이미지)
  + 연결된 이미지 파일
- **환자 데이터(dev.db 본체)는 여전히 PC별로 완전히 분리** — 기존 원칙 그대로 유지.
  `dev.db`, `.env`, `secrets/`는 지금처럼 git에 올라가지 않고 각 PC에 독립적으로 존재한다.

## 세션 종료 시 (지금 작업하던 PC에서)
```
npm run db:export-shared
git add .
git commit -m "..."
git push
```
`db:export-shared`는 `shared-data/program-teaching.json`, `shared-data/event-images.json`,
`shared-data/images/`를 최신 DB 내용으로 덮어쓴다. 커밋 전에 `git status`로
`shared-data/` 변경사항이 예상대로 들어갔는지 한 번 확인할 것.

## 세션 시작 시 (다른 PC에서)
기존 루틴 마지막에 한 줄만 추가:
```
git pull
npm install
npx prisma migrate deploy
npx prisma generate
npm run db:import-shared   # ← 추가된 단계
npm run dev
```
`db:import-shared`는 `shared-data/`의 내용을 syncKey 기준으로 upsert한다 — 이 PC에만
있던 프로그램티칭/이벤트이미지(테스트 데이터 등)는 절대 지우지 않는다(삭제 동기화 없음,
삭제는 각 PC에서 화면으로 직접 할 것).

## 주의사항
- `shared-data/`는 "마지막으로 export한 PC의 내용이 곧 정답"이 되는 단순한 모델이다.
  두 PC에서 같은 레코드(syncKey)를 동시에 다르게 수정하고 각각 export하면, 나중에
  import하는 쪽 내용으로 덮어써진다 — 충돌 감지/병합은 하지 않는다. 실무상 두 PC에서
  동시에 같은 프로그램티칭을 수정할 일은 거의 없어 지금은 이 정도로 충분하다고 판단.
- `EventImage.createdByStaffId`는 PC마다 StaffUser의 autoincrement id가 다를 수 있어
  작성자 **이름**으로 재매칭한다. import 대상 PC에 해당 이름의 직원이 없으면 에러로
  중단되니, 먼저 `npm run db:seed`로 기본 직원 목록을 맞춰둘 것.
- 이미지 파일은 git으로 커밋되는 용량이라(1건당 대략 수십 KB~수백 KB, 현재 14개 파일
  합계 약 1.9MB) 너무 커지면(예: 개별 파일이 수 MB를 넘기 시작하면) 별도 논의 필요.
