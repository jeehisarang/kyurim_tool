# 오늘의 작업 지시

## 지금 할 일 — 핵심기능⑤ 사용자 식별 / 작업이력 (MVP)

### 설계 방향 (중요)
- 이 툴은 로컬 네트워크에서 원장/직원 몇 명이 함께 쓰는 실무 도구이므로,
  보안용 로그인(비밀번호 인증)이 아니라 "지금 이 기기를 쓰고 있는 사람이 누구인지
  가볍게 선택"하는 방식으로 구현한다.
- 비밀번호, 세션 인증 라이브러리(NextAuth 등) 도입하지 말 것. 단순하게 갈 것.

1. DB 스키마 추가 (prisma/schema.prisma)
   model StaffUser {
     id        Int      @id @default(autoincrement())
     name      String   @unique
     role      String   // "원장" | "직원"
     isActive  Boolean  @default(true)
     createdAt DateTime @default(now())
     visits    Visit[]
   }
   - Visit 모델에 다음 필드 추가 (nullable로, 기존 데이터 호환):
     checkedByUserId Int?
     checkedByUser   StaffUser? @relation(fields: [checkedByUserId], references: [id])
   - prisma migrate dev로 마이그레이션 실행

2. 초기 데이터(seed) 추가
   - 원장: 김우석 (role: "원장")
   - 직원: 박간호, 최실장 (role: "직원")
   (이미 있는 seed.ts에 추가하는 형태로)

3. "현재 사용자" 선택 UI
   - 전체 화면 상단(레이아웃 공통 영역, 예: src/app/layout.tsx 또는 공통 헤더 컴포넌트)에
     "현재 사용자: [이름 ▾]" 형태의 드롭다운 배치
   - 선택한 사용자는 브라우저에 저장(localStorage)해서, 새로고침해도 유지되게 할 것
     (기기별로 다를 수 있으므로 서버 세션이 아닌 클라이언트 저장 방식으로 충분)
   - 아직 아무도 선택 안 했으면 "사용자를 선택하세요" 같은 안내 표시

4. 내원체크(visit-check) 화면 연동
   - 내원 체크(POST /api/visits) 시, 현재 선택된 사용자를 checkedByUserId로 함께 저장
   - "오늘 체크된 내원 목록" 표에 "체크한 사람" 컬럼 추가

5. 디자인은 기존 청자·한지 시스템 그대로 재사용, 새로 만들지 말 것

## 완료 후
- npm run dev로 확인 요청
- 생성/수정된 파일 목록 정리해서 보고할 것