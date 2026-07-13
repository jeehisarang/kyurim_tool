## 작업: PatientTeachingPage 소프트삭제 기능 추가

### 배경
- 프로그램티칭지(PatientTeachingPage)는 현재 삭제 기능이 전혀 없음 — 테스트로
  만든 것들이 계속 쌓여서 생성목록/드롭다운이 지저분해지는 문제
- 이미 환자에게 발송된 링크(/p/[token], /s/[token] 경유)가 있을 수 있으므로,
  완전삭제가 아니라 소프트삭제 방식으로 진행 (기존 Patient/Program 등에서
  쓰던 isActive 패턴과 동일한 원칙)

### 스키마
- `PatientTeachingPage`에 `isActive`(Boolean, default true) 필드 추가

### 동작 원칙
- 소프트삭제(isActive=false) 시:
  - 생성 화면의 "기존 티칭지 선택" 드롭다운(`GET /api/patients/[id]/teaching-pages`)
    목록에서 제외
  - 티칭지 목록/관리 화면에서도 기본적으로 숨김 (필요시 "삭제된 항목 보기" 토글로
    확인 가능하게 해도 좋음, 필수는 아님)
  - **공개 페이지(/p/[token], /s/[token] 및 그 안에서 참조되는 PatientShareLink)는
    isActive 여부와 무관하게 계속 정상 렌더링** — 이미 나간 링크를 깨뜨리면 안 됨

### API/UI
- API: `PATCH /api/teaching-pages/[id]` 또는 신규 `DELETE /api/teaching-pages/[id]`
  (실제로는 isActive=false로 업데이트하는 소프트삭제) 추가
- UI: 티칭지 생성 완료 화면(수정/링크복사/다른 프로그램으로 새로 만들기 버튼 있는 곳)에
  "삭제" 버튼 추가, 클릭 시 확인창("이 티칭지를 목록에서 삭제하시겠어요? 이미 발송된
  링크는 계속 유효합니다" 정도의 안내) 후 처리
- 티칭지 목록/관리 화면(있다면)에도 동일하게 삭제 버튼 반영

### 검증 요청
1. 테스트 티칭지 소프트삭제 → 생성 화면 드롭다운에서 사라지는지 확인
2. 소프트삭제된 티칭지의 기존 `/p/[token]` 링크 → 여전히 정상 렌더링되는지 확인
3. 그 티칭지를 포함한 PatientShareLink(`/s/[token]`)도 여전히 정상 렌더링되는지 확인
4. 실사용 중인 정상 티칭지(7/11에 발견된 19건 등)는 건드리지 않았는지 확인
5. `npx tsc --noEmit`, `npm run build` 통과 확인
6. 테스트로 만든 불필요한 티칭지들 실제로 정리(소프트삭제)

### 완료 후 보고
- 수정/신규 파일 목록
- 위 검증 결과
- 정리한 테스트 티칭지 개수/목록