/**
 * DRY-RUN 전용 — ProgramTeaching 셀링 7필드 → 신규 3필드(환자/한의원/기타) 자동 재분류.
 *
 * DB에는 아무것도 쓰지 않는다(update/create 호출 없음). 기존 ProgramTeaching을 전부
 * 읽어서 gpt-4o-mini로 분류한 뒤 "기존 7필드 → 신규 3필드" 매핑 결과를 콘솔에 출력만
 * 한다. 결과를 원장님이 검수/승인한 뒤에야 실제 DB 반영 + 스키마 컬럼 삭제를 진행한다.
 *
 * 실행: npx tsx prisma/reclassify-selling-points.ts  (또는 npm run db:reclassify-dry-run)
 * 필요: .env에 OPENAI_API_KEY 설정 (원장실 PC에서 실행)
 */
import "dotenv/config";
import OpenAI from "openai";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../src/generated/prisma/client";

const MODEL = "gpt-4o-mini";

const adapter = new PrismaBetterSqlite3({
  url: process.env.DATABASE_URL ?? "file:./dev.db",
});
const prisma = new PrismaClient({ adapter });

const SELLING_FIELD_KEYS = [
  "sellingAccessCost",
  "sellingConvenience",
  "sellingDifferentiation",
  "sellingEffectiveness",
  "sellingSafety",
  "sellingLifestyleFit",
  "sellingOther",
] as const;
type SellingFieldKey = (typeof SELLING_FIELD_KEYS)[number];

const SELLING_FIELD_LABEL: Record<SellingFieldKey, string> = {
  sellingAccessCost: "접근성/비용",
  sellingConvenience: "복용·시술 편의성",
  sellingDifferentiation: "차별성",
  sellingEffectiveness: "효과 체감",
  sellingSafety: "안전성",
  sellingLifestyleFit: "생활 적합성",
  sellingOther: "기타",
};

const NEW_FIELD_LABEL = {
  patient: "환자 셀링포인트 (patientSellingPoints)",
  clinic: "한의원 셀링포인트 (clinicSellingPoints)",
  etc: "기타 (etcSellingPoints)",
} as const;
type NewFieldKey = keyof typeof NEW_FIELD_LABEL;

const CLASSIFY_SYSTEM_PROMPT = `당신은 한의원 마케팅 콘텐츠를 재구성하는 편집자입니다.
아래 입력된 프로그램의 기존 셀링포인트 필드(최대 7개)를 신규 3개 필드 중 하나로
분류하고, 같은 신규 필드로 배정된 내용을 자연스러운 문장으로 재구성해 JSON으로만
응답하세요.

[신규 3필드 정의]
- patient (환자 셀링포인트): 환자 입장에서 이 프로그램을 왜 해야 하는지 — 가격 부담,
  효과에 대한 의심, 요요 걱정, 복용/시술 부담 등 환자가 망설이는 이유에 대응하는 내용
- clinic (한의원 셀링포인트): 한의원 입장에서(마케팅적으로) 왜 이 프로그램을 미는지 —
  전통, 노하우, 전문성 등 한의원의 강점을 드러내는 내용
- etc (기타): 위 두 관점 어디에도 명확히 속하지 않는 내용

[분류 원칙]
- 카테고리명만 보고 기계적으로 매핑하지 말고, 실제 문장 내용을 읽고 판단할 것
- 참고 경향(절대 규칙 아님, 내용을 우선할 것):
  - 접근성/비용, 안전성 → 대개 환자 관점일 가능성이 높음
  - 차별성, 효과 체감 → 환자/한의원 어느 쪽도 가능, 내용 기준으로 판단
  - 복용·시술 편의성, 생활 적합성 → 대개 환자 관점일 가능성이 높음
  - 기타 → 대개 그대로 기타로 분류하되, 내용이 명확히 환자/한의원 관점이면 재분류
- 같은 신규 필드에 여러 기존 필드 내용이 배정되면 자연스러운 문장으로 이어붙일 것
  (기계적 나열 금지). 단 원문 표현은 최대한 보존하고 과도하게 재작성하지 말 것
- 해당 관점에 배정할 내용이 하나도 없으면 그 필드는 null로 출력할 것

[출력 형식]
{
  "patientSellingPoints": "재구성된 문장 또는 null",
  "clinicSellingPoints": "재구성된 문장 또는 null",
  "etcSellingPoints": "재구성된 문장 또는 null",
  "mapping": { "기존필드key": "patient|clinic|etc", ... 입력에 있던 필드만 전부 포함 }
}
다른 텍스트 없이 JSON만 출력하세요.`;

type ProgramRow = {
  id: number;
  programName: string;
} & Record<SellingFieldKey, string | null>;

type ClassifyResult = {
  patientSellingPoints: string | null;
  clinicSellingPoints: string | null;
  etcSellingPoints: string | null;
  mapping: Partial<Record<SellingFieldKey, NewFieldKey>>;
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

async function classifyProgram(program: ProgramRow): Promise<ClassifyResult> {
  const filledFields = SELLING_FIELD_KEYS.filter((key) => isNonEmptyString(program[key]));

  if (filledFields.length === 0) {
    return { patientSellingPoints: null, clinicSellingPoints: null, etcSellingPoints: null, mapping: {} };
  }

  const fieldsText = filledFields
    .map((key) => `- ${SELLING_FIELD_LABEL[key]} (${key}): ${program[key]}`)
    .join("\n");

  const userMessage = `[프로그램명] ${program.programName}

[기존 셀링포인트 필드]
${fieldsText}`;

  const client = new OpenAI();
  const response = await client.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: CLASSIFY_SYSTEM_PROMPT },
      { role: "user", content: userMessage },
    ],
    response_format: { type: "json_object" },
    max_tokens: 900,
  });

  const raw = response.choices[0]?.message?.content?.trim() ?? "{}";
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`[${program.programName}] AI 응답을 JSON으로 파싱하지 못했습니다: ${raw}`);
  }
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error(`[${program.programName}] AI 응답 형식이 올바르지 않습니다: ${raw}`);
  }
  const v = parsed as Record<string, unknown>;
  return {
    patientSellingPoints: isNonEmptyString(v.patientSellingPoints) ? v.patientSellingPoints.trim() : null,
    clinicSellingPoints: isNonEmptyString(v.clinicSellingPoints) ? v.clinicSellingPoints.trim() : null,
    etcSellingPoints: isNonEmptyString(v.etcSellingPoints) ? v.etcSellingPoints.trim() : null,
    mapping: (typeof v.mapping === "object" && v.mapping !== null ? v.mapping : {}) as ClassifyResult["mapping"],
  };
}

function printProgram(program: ProgramRow, result: ClassifyResult) {
  console.log("=".repeat(70));
  console.log(`[${program.id}] ${program.programName}`);
  console.log("-".repeat(70));
  console.log("기존 7필드:");
  for (const key of SELLING_FIELD_KEYS) {
    const value = program[key];
    if (!isNonEmptyString(value)) continue;
    const mapped = result.mapping[key];
    const arrow = mapped ? `→ ${NEW_FIELD_LABEL[mapped]}` : "→ (분류 없음)";
    console.log(`  · ${SELLING_FIELD_LABEL[key]} (${key}) ${arrow}`);
    console.log(`    "${value}"`);
  }
  console.log("");
  console.log("신규 3필드 결과:");
  console.log(`  [환자] ${result.patientSellingPoints ?? "(없음)"}`);
  console.log(`  [한의원] ${result.clinicSellingPoints ?? "(없음)"}`);
  console.log(`  [기타] ${result.etcSellingPoints ?? "(없음)"}`);
  console.log("");
}

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error(
      "OPENAI_API_KEY가 설정되어 있지 않습니다. .env에 OPENAI_API_KEY=sk-... 를 추가한 뒤 다시 실행하세요.",
    );
  }

  const programs = (await prisma.programTeaching.findMany({
    orderBy: { id: "desc" },
  })) as unknown as ProgramRow[];

  console.log(`DRY-RUN 시작 — ProgramTeaching ${programs.length}건 조회됨.`);
  console.log("이 스크립트는 DB에 아무것도 쓰지 않습니다(조회 + AI 분류 + 콘솔 출력만).\n");

  for (const program of programs) {
    const result = await classifyProgram(program);
    printProgram(program, result);
  }

  console.log("DRY-RUN 완료. 위 결과를 검수한 뒤 승인하시면 실제 DB 반영 + 스키마 컬럼 삭제를 진행합니다.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
