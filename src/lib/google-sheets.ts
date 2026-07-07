import path from "node:path";
import { auth, sheets } from "@googleapis/sheets";

let cachedAuth: InstanceType<typeof auth.GoogleAuth> | null = null;

function getAuth() {
  if (cachedAuth) return cachedAuth;

  const keyPath = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH;
  if (!keyPath) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_KEY_PATH 환경변수가 설정되지 않았습니다.");
  }

  cachedAuth = new auth.GoogleAuth({
    keyFile: path.resolve(/* turbopackIgnore: true */ process.cwd(), keyPath),
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
  return cachedAuth;
}

/** 킬팻캡슐 3일체험 설문(구글폼 응답 시트)의 전체 행을 2차원 배열로 가져온다. 0번째 행은 헤더. */
export async function getSheetRows(): Promise<string[][]> {
  const spreadsheetId = process.env.GOOGLE_TRIAL_SURVEY_SHEET_ID;
  const range = process.env.GOOGLE_TRIAL_SURVEY_SHEET_RANGE;
  if (!spreadsheetId || !range) {
    throw new Error(
      "GOOGLE_TRIAL_SURVEY_SHEET_ID / GOOGLE_TRIAL_SURVEY_SHEET_RANGE 환경변수가 설정되지 않았습니다.",
    );
  }

  const sheetsClient = sheets({ version: "v4", auth: getAuth() });
  const res = await sheetsClient.spreadsheets.values.get({ spreadsheetId, range });
  return (res.data.values as string[][] | undefined) ?? [];
}
