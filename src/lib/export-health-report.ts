// 건강 리포트 PDF/이미지 다운로드(task.md PART D) — 원장 확인화면(/examinations/hrv/[id])
// 전용. DOM을 그대로 캡처하는 방식(html2canvas)이라 신버전(7카드)/레거시(4섹션) 구조 차이를
// 이 파일이 신경 쓸 필요가 없다 — 호출측이 캡처 대상 DOM 노드(ref)만 넘기면 된다.
"use client";

// data: URI 대신 blob: URL을 쓴다(task.md — 다운로드 버튼이 팝업 차단에 걸리는 문제 수정).
// canvas.toDataURL()로 만든 큰 base64 data: URI를 <a download>에 직접 물리면 일부 브라우저
// 조합에서 다운로드가 "새 창을 여는 동작"처럼 취급돼 팝업 차단에 걸릴 수 있다 — blob: URL은
// 실제 파일 다운로드로 더 안정적으로 인식된다(jsPDF도 내부적으로 이 방식을 쓴다).
function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("캔버스를 이미지로 변환하지 못했습니다."));
    }, "image/png");
  });
}

export async function downloadElementAsPng(element: HTMLElement, fileName: string): Promise<void> {
  const html2canvas = (await import("html2canvas")).default;
  const canvas = await html2canvas(element, { backgroundColor: "#ffffff", scale: 2 });
  const blob = await canvasToBlob(canvas);
  const url = URL.createObjectURL(blob);
  triggerDownload(url, fileName);
  // 즉시 revoke하면 일부 브라우저에서 다운로드 시작 전에 URL이 무효화될 수 있어(jsPDF의
  // saveAs 내부 구현도 동일하게 지연 revoke를 쓴다), 다운로드가 시작될 시간을 두고 해제한다.
  setTimeout(() => URL.revokeObjectURL(url), 40000);
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
