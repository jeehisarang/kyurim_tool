import { prisma } from "@/lib/db";

// 발송닷컴 알림톡 연동(task.md) — 킬팻캡슐 3일체험 신청 시 "킬팻캡슐신청본인확인"
// 템플릿(14361) 자동발송. UserID/UserPW는 서버 전용 환경변수로만 다루고, 클라이언트
// 번들에 노출되면 안 되므로 이 파일은 서버 코드(API route/lib)에서만 import한다.
const BALSONG_API_URL = "https://balsong.com/Linkage/API/";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} 환경변수가 설정되지 않았습니다.`);
  return value;
}

export type BalsongSendResult = {
  result: string;
  code: string | null;
  jobNo: string | null;
  raw: unknown;
};

/**
 * 킬팻캡슐 3일체험 신청 본인확인 알림톡 발송 — best-effort 호출. 신청 저장(DB) 자체를
 * 막으면 안 되므로 호출자가 반드시 try/catch로 감싸야 한다(이 함수는 그대로 throw한다).
 */
export async function sendKillCapApplicationAlimtalk(input: {
  name: string;
  phone: string;
}): Promise<BalsongSendResult> {
  const userId = requireEnv("BALSONG_USER_ID");
  const userPw = requireEnv("BALSONG_USER_PW");
  const callback = requireEnv("BALSONG_CALLBACK");
  const channelId = requireEnv("BALSONG_CHANNEL_ID");
  const templateSeq = process.env.BALSONG_TEMPLATE_SEQ || "14361";

  // 발송닷컴 안내대로 하이픈 등 숫자 이외 문자는 전부 제거(task.md).
  const phoneDigits = input.phone.replace(/\D/g, "");

  const destination = [
    {
      Company: "규림한의원",
      Name: input.name,
      Phone: phoneDigits,
      Replace_Datas: [{ Key: "#{이름}", Value: input.name }],
      Buttons: [{ name: "신청 본인 확인", type: "BK" }],
    },
  ];

  const formData = new FormData();
  formData.set("UserID", userId);
  formData.set("UserPW", userPw);
  formData.set("Service", "ATALK");
  formData.set("Type", "Send");
  formData.set("Channel_ID", channelId);
  formData.set("Template_Seq", templateSeq);
  formData.set("Callback", callback);
  formData.set("Fail_To", "");
  formData.set("Subject", "킬팻캡슐 신청 본인확인");
  formData.set("Main_Text", "킬팻캡슐 3일체험 신청이 접수되었습니다.");
  formData.set("Destination", JSON.stringify(destination));

  const res = await fetch(BALSONG_API_URL, { method: "POST", body: formData });
  const json = (await res.json()) as Record<string, unknown>;

  return {
    result: String(json.Result ?? json.result ?? "UNKNOWN"),
    code: json.Code != null ? String(json.Code) : json.code != null ? String(json.code) : null,
    jobNo: json.Job_No != null ? String(json.Job_No) : json.job_no != null ? String(json.job_no) : null,
    raw: json,
  };
}

export type BalsongStatusResult = {
  status: string;
  raw: unknown;
};

// 발송 결과 상태조회(Report_Detail, task.md 4단계) — Job_No로 나중에 실제 성공/실패를 확인한다.
export async function checkAlimtalkStatus(jobNo: string): Promise<BalsongStatusResult> {
  const userId = requireEnv("BALSONG_USER_ID");
  const userPw = requireEnv("BALSONG_USER_PW");

  const formData = new FormData();
  formData.set("UserID", userId);
  formData.set("UserPW", userPw);
  formData.set("Service", "ATALK");
  formData.set("Type", "Report_Detail");
  formData.set("Job_No", jobNo);
  // 실제 API 테스트 중 발견(task.md 5단계) — 문서/작업지시서에는 없었으나 Page/List_EA가
  // 없으면 "필수값이 누락되었습니다"(Code 6754)로 거부됨. 신청 1건=발송 1건이라 1페이지에
  // 1건 조회로 충분하다.
  formData.set("Page", "1");
  formData.set("List_EA", "1");

  const res = await fetch(BALSONG_API_URL, { method: "POST", body: formData });
  const json = (await res.json()) as Record<string, unknown>;

  // 실제 응답 구조(task.md 5단계 테스트로 확인) — 상태는 최상위가 아니라
  // List[0].Status_Detail(또는 Status)에 들어있다. 작업지시서 예시("Status가 실패면")는
  // 단순화된 설명이었던 것으로 보임.
  const list = Array.isArray(json.List) ? (json.List as Record<string, unknown>[]) : [];
  const first = list[0];
  const status = first ? String(first.Status_Detail ?? first.Status ?? "UNKNOWN") : "UNKNOWN";

  return { status, raw: json };
}

// 상태조회 대기 최소 경과시간(task.md "발송 후 5~10분 뒤") — 이보다 짧으면 아직 발송닷컴
// 쪽에서도 최종 결과가 안 나왔을 가능성이 높아 조회 대상에서 제외한다.
const STATUS_CHECK_MIN_DELAY_MS = 5 * 60 * 1000;

// "실패"로 판정하는 문자열 — 실제 테스트(task.md 5단계, 010-0000-0000)로 "전화번호 오류"
// 상태를 확인했다. 발송닷컴 상태값 전체 목록 문서가 없어 부정적 키워드로 느슨하게
// 매칭한다(정상 상태값이 여기 걸릴 일은 없을 것으로 판단 — "완료"/"성공"/"발송" 등과
// 겹치지 않음).
function isFailedStatus(status: string): boolean {
  return /실패|오류|에러|불가|차단|거부|fail|error/i.test(status);
}

/**
 * 발송 결과 지연 확인(task.md 4단계, 실제 cron/타이머 없이 lazy-check 패턴 — 기존
 * generateTalkTodos와 동일 원칙) — 관리자 화면(/refer/applications) 조회 시점마다
 * 호출해, 발송 후 5분 넘게 지났는데 아직 상태를 확인 안 한 건들만 Report_Detail로
 * 조회해 최종 성공/실패를 확정한다. 개별 건 조회 실패는 다음 조회 기회로 넘긴다
 * (alimtalkStatusChecked를 true로 만들지 않음 — throw하지 않고 조용히 건너뜀).
 */
export async function refreshPendingAlimtalkStatuses(): Promise<void> {
  const cutoff = new Date(Date.now() - STATUS_CHECK_MIN_DELAY_MS);
  const pending = await prisma.trialApplication.findMany({
    where: {
      alimtalkJobNo: { not: null },
      alimtalkStatusChecked: false,
      alimtalkSentAt: { lte: cutoff },
    },
  });

  for (const application of pending) {
    try {
      const { status } = await checkAlimtalkStatus(application.alimtalkJobNo!);
      await prisma.trialApplication.update({
        where: { id: application.id },
        data: {
          alimtalkStatusChecked: true,
          alimtalkFailReason: isFailedStatus(status) ? status : null,
        },
      });
    } catch {
      // 조회 자체가 실패하면(네트워크 등) 다음 화면 조회 시 다시 시도 — 여기서는 무시.
    }
  }
}
