"use client";

import { useParams } from "next/navigation";
import ExitSurveyForm from "@/components/ExitSurveyForm";

// 3일차 마감톡에 삽입되는 마감설문 링크(task.md Phase 2-1) — 기존 forms.gle 링크 대체.
export default function ExitSurveyPage() {
  const params = useParams<{ prescriptionId: string }>();
  return <ExitSurveyForm prescriptionId={Number(params.prescriptionId)} />;
}
