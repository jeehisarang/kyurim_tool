import path from "node:path";
import { auth, drive } from "@googleapis/drive";

let cachedAuth: InstanceType<typeof auth.GoogleAuth> | null = null;

// google-sheets.ts와 동일한 서비스계정 키 파일을 재사용한다(secrets/google-service-account.json) —
// 계정을 새로 만들 필요 없이 이 스코프만 추가하면 된다. 단, 이 계정이 실제 HRV 결과지가
// 든 구글드라이브 폴더에 "뷰어(읽기)" 권한으로 공유되어 있어야 한다(task2.md 안내문서 참고).
function getAuth() {
  if (cachedAuth) return cachedAuth;

  const keyPath = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH;
  if (!keyPath) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_KEY_PATH 환경변수가 설정되지 않았습니다.");
  }

  cachedAuth = new auth.GoogleAuth({
    keyFile: path.resolve(/* turbopackIgnore: true */ process.cwd(), keyPath),
    scopes: ["https://www.googleapis.com/auth/drive.readonly"],
  });
  return cachedAuth;
}

export class HrvDriveFolderNotConfiguredError extends Error {
  constructor() {
    super(
      "GOOGLE_HRV_DRIVE_FOLDER_ID 환경변수가 설정되지 않았습니다. 원장님이 구글드라이브 폴더 공유를 완료한 뒤 폴더 ID를 설정해주세요.",
    );
    this.name = "HrvDriveFolderNotConfiguredError";
  }
}

export type HrvDriveFile = {
  id: string;
  name: string;
  modifiedTime: string | null;
  thumbnailLink: string | null;
};

/** HRV 결과지 폴더의 최근 파일 목록(최신 수정순) — 이미지/PDF만 대상으로 한다. */
export async function listHrvDriveFiles(): Promise<HrvDriveFile[]> {
  const folderId = process.env.GOOGLE_HRV_DRIVE_FOLDER_ID;
  if (!folderId) {
    throw new HrvDriveFolderNotConfiguredError();
  }

  const driveClient = drive({ version: "v3", auth: getAuth() });
  const res = await driveClient.files.list({
    q: `'${folderId}' in parents and trashed = false and (mimeType contains 'image/' or mimeType = 'application/pdf')`,
    fields: "files(id, name, modifiedTime, thumbnailLink)",
    orderBy: "modifiedTime desc",
    pageSize: 50,
  });

  return (res.data.files ?? []).map((f) => ({
    id: f.id!,
    name: f.name ?? "(이름 없음)",
    modifiedTime: f.modifiedTime ?? null,
    thumbnailLink: f.thumbnailLink ?? null,
  }));
}

/** 특정 드라이브 파일의 바이너리 콘텐츠를 다운로드한다(이미지 리사이즈 저장용). */
export async function downloadDriveFileBuffer(fileId: string): Promise<Buffer> {
  const driveClient = drive({ version: "v3", auth: getAuth() });
  const res = await driveClient.files.get(
    { fileId, alt: "media" },
    { responseType: "arraybuffer" },
  );
  return Buffer.from(res.data as ArrayBuffer);
}
