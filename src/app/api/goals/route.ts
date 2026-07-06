import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  GOAL_METRIC_KEYS,
  isValidMetricKey,
  isValidPeriodType,
  periodStartFor,
} from "@/lib/goals";

export async function GET() {
  const now = new Date();
  const weeklyStart = periodStartFor("weekly", now);
  const monthlyStart = periodStartFor("monthly", now);

  const goals = await prisma.goal.findMany({
    where: {
      metricKey: { in: GOAL_METRIC_KEYS },
      OR: [
        { periodType: "weekly", periodStart: weeklyStart },
        { periodType: "monthly", periodStart: monthlyStart },
      ],
    },
  });

  return NextResponse.json(goals);
}

export async function POST(request: Request) {
  const body = await request.json();
  const { metricKey, periodType, targetValue } = body;

  if (
    typeof metricKey !== "string" ||
    !isValidMetricKey(metricKey) ||
    typeof periodType !== "string" ||
    !isValidPeriodType(periodType) ||
    typeof targetValue !== "number" ||
    !Number.isFinite(targetValue) ||
    targetValue <= 0
  ) {
    return NextResponse.json({ error: "요청 값이 올바르지 않습니다." }, { status: 400 });
  }

  const periodStart = periodStartFor(periodType);

  const goal = await prisma.goal.upsert({
    where: {
      metricKey_periodType_periodStart: { metricKey, periodType, periodStart },
    },
    create: { metricKey, periodType, periodStart, targetValue },
    update: { targetValue },
  });

  return NextResponse.json(goal, { status: 201 });
}
