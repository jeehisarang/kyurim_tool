// 건강 리포트 PDF/이미지 다운로드(task.md PART D) — 원장 확인화면(/examinations/hrv/[id])
// 전용. DOM을 그대로 캡처하는 방식(html2canvas)이라 신버전(7카드)/레거시(4섹션) 구조 차이를
// 이 파일이 신경 쓸 필요가 없다 — 호출측이 캡처 대상 DOM 노드(ref)만 넘기면 된다.
"use client";

export async function downloadElementAsPng(element: HTMLElement, fileName: string): Promise<void> {
  const html2canvas = (await import("html2canvas")).default;
  const canvas = await html2canvas(element, { backgroundColor: "#ffffff", scale: 2 });
  const dataUrl = canvas.toDataURL("image/png");
  triggerDownload(dataUrl, fileName);
}

export async function downloadElementAsPdf(element: HTMLElement, fileName: string): Promise<void> {
  const html2canvas = (await import("html2canvas")).default;
  const { jsPDF } = await import("jspdf");

  const canvas = await html2canvas(element, { backgroundColor: "#ffffff", scale: 2 });
  const imgData = canvas.toDataURL("image/png");

  // A4 폭(210mm)에 맞춰 비율 유지 스케일 — 내용이 A4 한 페이지보다 길면 세로로 이어 붙인다.
  const pageWidthMm = 210;
  const pageHeightMm = 297;
  const imgWidthMm = pageWidthMm;
  const imgHeightMm = (canvas.height * imgWidthMm) / canvas.width;

  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  let remainingHeightMm = imgHeightMm;
  let position = 0;

  pdf.addImage(imgData, "PNG", 0, position, imgWidthMm, imgHeightMm);
  remainingHeightMm -= pageHeightMm;

  while (remainingHeightMm > 0) {
    position = remainingHeightMm - imgHeightMm;
    pdf.addPage();
    pdf.addImage(imgData, "PNG", 0, position, imgWidthMm, imgHeightMm);
    remainingHeightMm -= pageHeightMm;
  }

  pdf.save(fileName);
}

function triggerDownload(dataUrl: string, fileName: string): void {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

// 파일명 규칙(task.md 제안 형식): [환자이름]_건강리포트_[검사일자(YYYYMMDD)]
export function buildHealthReportFileName(patientName: string, testDateIso: string, ext: "pdf" | "png"): string {
  const d = new Date(testDateIso);
  const pad = (n: number) => String(n).padStart(2, "0");
  const dateStr = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
  return `${patientName}_건강리포트_${dateStr}.${ext}`;
}
