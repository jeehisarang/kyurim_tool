import { nanoid } from "nanoid";
import { Prisma } from "@/generated/prisma/client";

const TOKEN_LENGTH = 8;
const MAX_ATTEMPTS = 5;

// PatientTeachingPage.token, PatientShareLink.token 둘 다 카톡 발송 시 가독성을 위해
// UUID(36자) 대신 짧은 랜덤코드로 생성한다(task.md). 기존에 이미 생성된 UUID 토큰은
// 절대 건드리지 않는다 — 이 함수는 "새로 생성되는" 토큰에만 적용된다.
function generateShortToken(): string {
  return nanoid(TOKEN_LENGTH);
}

/**
 * token unique 제약 위반(P2002) 시 새 토큰으로 재시도한다 — 8자 조합 충돌 확률은
 * 현재 규모에서 극히 낮지만 안전하게 처리한다(task.md 지시).
 */
export async function createWithShortToken<T>(create: (token: string) => Promise<T>): Promise<T> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await create(generateShortToken());
    } catch (err) {
      const isTokenCollision =
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002" &&
        (err.meta?.target as string[] | undefined)?.includes("token");
      if (!isTokenCollision || attempt === MAX_ATTEMPTS) throw err;
    }
  }
  throw new Error("unreachable");
}
