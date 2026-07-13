## 작업: 공유링크 토큰 단축 (UUID → 짧은 랜덤코드)

### 배경
- 현재 PatientTeachingPage.token, PatientShareLink.token이 UUID(36자)로 생성되어
  URL이 지나치게 길어짐 (카톡 발송 시 가독성/클릭유도 안 좋음)
- 짧은 랜덤 코드(예: 8자, 대소문자+숫자 조합)로 변경

### 수정 사항
- nanoid 패키지 설치 (`npm install nanoid`)
- 토큰 생성 로직을 `nanoid(8)` 방식으로 교체 (PatientTeachingPage 생성 시,
  PatientShareLink 생성 시 둘 다)
- 중복 방지: 생성 시 unique 제약 위반하면 재시도하는 로직 추가 (8자 조합에서
  현재 규모상 충돌 확률은 매우 낮지만, 안전하게 재시도 처리)
- **기존에 이미 생성된 UUID 토큰 링크는 절대 건드리지 말 것** — 이미 발송됐거나
  발송될 수 있는 링크이므로, 새로 생성되는 토큰만 짧은 형식 적용 (마이그레이션 없음,
  기존 데이터는 그대로 유지)

### 검증 요청
1. 새 티칭지 생성 → 토큰이 8자 짧은 코드로 생성되는지 확인
2. 새 공유링크(PatientShareLink) 생성 → 동일하게 짧은 코드 확인
3. 기존(UUID) 토큰으로 만들어진 /p/[token], /s/[token] 링크 여전히 정상 작동하는지
   확인 (회귀 없음)
4. npx tsc --noEmit, npm run build 통과 확인

### 완료 후 보고
- 수정 파일 목록
- 새로 생성된 링크 예시 (짧아진 실제 URL)
- 기존 UUID 링크 회귀 테스트 결과