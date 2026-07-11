// 이벤트 이미지 생성기(task.md) — 배경 위에 타이틀+본문 문구를 완전 자동 배치로 합성한다.
// 서버 없이 브라우저 Canvas에서만 처리(실시간 미리보기 겸 최종 저장용 PNG 생성 겸용).

const MAX_CANVAS_WIDTH = 1080;
const MIN_CANVAS_WIDTH = 600;

function getCssFontFamily(varName: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  return value || (varName === "--font-display" ? "serif" : "sans-serif");
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("배경 이미지를 불러오지 못했습니다."));
    img.src = url;
  });
}

// 공백 기준 줄바꿈 — ctx.measureText로 maxWidth를 넘기지 않는 선에서 단어 단위로 끊는다.
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const lines: string[] = [];
  let current = words[0];
  for (const word of words.slice(1)) {
    const candidate = `${current} ${word}`;
    if (ctx.measureText(candidate).width <= maxWidth) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
    }
  }
  lines.push(current);
  return lines;
}

// 폰트 크기를 줄여가며 지정된 높이 안에 다 들어갈 때까지 줄바꿈을 재시도한다.
function fitWrappedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  fontFamily: string,
  weight: number,
  startSize: number,
  minSize: number,
  maxWidth: number,
  maxHeight: number,
): { lines: string[]; fontSize: number; lineHeight: number } {
  for (let size = startSize; size >= minSize; size -= 2) {
    ctx.font = `${weight} ${size}px ${fontFamily}`;
    const lines = wrapText(ctx, text, maxWidth);
    const lineHeight = size * 1.35;
    if (lines.length * lineHeight <= maxHeight || size === minSize) {
      return { lines, fontSize: size, lineHeight };
    }
  }
  ctx.font = `${weight} ${minSize}px ${fontFamily}`;
  return { lines: wrapText(ctx, text, maxWidth), fontSize: minSize, lineHeight: minSize * 1.35 };
}

export type ComposeEventImageInput = {
  canvas: HTMLCanvasElement;
  backgroundUrl: string;
  title: string;
  copy: string;
};

// 문구 총 길이에 따라 배치를 자동으로 고른다 — 짧으면 중앙 카드, 길면 하단 띠.
export async function composeEventImage({ canvas, backgroundUrl, title, copy }: ComposeEventImageInput) {
  const titleFontFamily = getCssFontFamily("--font-display");
  const bodyFontFamily = getCssFontFamily("--font-body");

  const img = await loadImage(backgroundUrl);
  const width = Math.max(MIN_CANVAS_WIDTH, Math.min(MAX_CANVAS_WIDTH, img.naturalWidth || MAX_CANVAS_WIDTH));
  const height = Math.round((img.naturalHeight / (img.naturalWidth || 1)) * width) || width;

  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  // 실제 사용할 굵기로 미리 로드해둬야 첫 렌더에서 폴백 폰트로 그려지는 것을 피한다.
  await Promise.all([
    document.fonts.load(`700 40px ${titleFontFamily}`),
    document.fonts.load(`500 24px ${bodyFontFamily}`),
  ]);
  await document.fonts.ready;

  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);

  const totalLength = title.length + copy.length;
  const isShort = totalLength <= 60;
  const paddingX = width * 0.1;
  const maxTextWidth = width - paddingX * 2;

  if (isShort) {
    drawCenterCard(ctx, { width, height, title, copy, titleFontFamily, bodyFontFamily, maxTextWidth, paddingX });
  } else {
    drawBottomBand(ctx, { width, height, title, copy, titleFontFamily, bodyFontFamily, maxTextWidth, paddingX });
  }
}

type DrawArgs = {
  width: number;
  height: number;
  title: string;
  copy: string;
  titleFontFamily: string;
  bodyFontFamily: string;
  maxTextWidth: number;
  paddingX: number;
};

function drawCenterCard(ctx: CanvasRenderingContext2D, args: DrawArgs) {
  const { width, height, title, copy, titleFontFamily, bodyFontFamily, maxTextWidth, paddingX } = args;

  const titleFit = fitWrappedText(ctx, title, titleFontFamily, 700, 52, 30, maxTextWidth, height * 0.28);
  const copyFit = fitWrappedText(ctx, copy, bodyFontFamily, 500, 26, 18, maxTextWidth, height * 0.22);

  const titleBlockHeight = titleFit.lines.length * titleFit.lineHeight;
  const copyBlockHeight = copyFit.lines.length * copyFit.lineHeight;
  const gap = 18;
  const cardPaddingY = 36;
  const cardHeight = cardPaddingY * 2 + titleBlockHeight + gap + copyBlockHeight;
  const cardTop = (height - cardHeight) / 2;

  ctx.fillStyle = "rgba(20, 18, 16, 0.45)";
  roundRect(ctx, paddingX * 0.6, cardTop, width - paddingX * 1.2, cardHeight, 16);
  ctx.fill();

  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";

  let y = cardTop + cardPaddingY + titleFit.fontSize * 0.85;
  ctx.font = `700 ${titleFit.fontSize}px ${titleFontFamily}`;
  ctx.fillStyle = "#FBF8F2";
  for (const line of titleFit.lines) {
    ctx.fillText(line, width / 2, y);
    y += titleFit.lineHeight;
  }

  y = cardTop + cardPaddingY + titleBlockHeight + gap + copyFit.fontSize * 0.85;
  ctx.font = `500 ${copyFit.fontSize}px ${bodyFontFamily}`;
  ctx.fillStyle = "#F6F1E7";
  for (const line of copyFit.lines) {
    ctx.fillText(line, width / 2, y);
    y += copyFit.lineHeight;
  }
}

function drawBottomBand(ctx: CanvasRenderingContext2D, args: DrawArgs) {
  const { width, height, title, copy, titleFontFamily, bodyFontFamily, maxTextWidth, paddingX } = args;

  const titleFit = fitWrappedText(ctx, title, titleFontFamily, 700, 44, 26, maxTextWidth, height * 0.16);
  const copyFit = fitWrappedText(ctx, copy, bodyFontFamily, 500, 24, 16, maxTextWidth, height * 0.28);

  const titleBlockHeight = titleFit.lines.length * titleFit.lineHeight;
  const copyBlockHeight = copyFit.lines.length * copyFit.lineHeight;
  const gap = 14;
  const bandPaddingY = 28;
  const bandHeight = bandPaddingY * 2 + titleBlockHeight + gap + copyBlockHeight;
  const bandTop = height - bandHeight;

  const gradient = ctx.createLinearGradient(0, bandTop - 40, 0, height);
  gradient.addColorStop(0, "rgba(20, 18, 16, 0)");
  gradient.addColorStop(1, "rgba(20, 18, 16, 0.72)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, bandTop - 40, width, height - (bandTop - 40));

  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";

  let y = bandTop + bandPaddingY + titleFit.fontSize * 0.85;
  ctx.font = `700 ${titleFit.fontSize}px ${titleFontFamily}`;
  ctx.fillStyle = "#FBF8F2";
  for (const line of titleFit.lines) {
    ctx.fillText(line, paddingX, y);
    y += titleFit.lineHeight;
  }

  y = bandTop + bandPaddingY + titleBlockHeight + gap + copyFit.fontSize * 0.85;
  ctx.font = `500 ${copyFit.fontSize}px ${bodyFontFamily}`;
  ctx.fillStyle = "#F6F1E7";
  for (const line of copyFit.lines) {
    ctx.fillText(line, paddingX, y);
    y += copyFit.lineHeight;
  }
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}
