개발서버가 "Jest worker encountered 2 child process exceptions, exceeding retry limit" 
에러로 500을 반환 중입니다. 다음 순서로 조치해주세요:

1. 기존 dev 서버 프로세스 종료
2. .next 캐시 폴더 삭제 (rm -rf .next 또는 Windows PowerShell: Remove-Item -Recurse -Force .next)
3. dev 서버 재시작
4. 재시작 후 미매칭 검사기록 화면에서 "검사기록으로 전환" 버튼이 정상 작동하는지 
   테스트 환자(426) 기준으로 먼저 확인
5. 문제없으면 실제 화면(김우석 미매칭 건)에서도 재확인