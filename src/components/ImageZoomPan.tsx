"use client";

import { useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent, WheelEvent as ReactWheelEvent } from "react";
import styles from "./ImageZoomPan.module.css";

const MIN_SCALE = 1;
const MAX_SCALE = 5;
const ZOOM_STEP = 0.4;

function clampScale(s: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));
}

/**
 * HRV "환자와 함께보기" 결과지 이미지용 확대/축소/드래그 뷰어(task2.md 추가사항) — 별도
 * 무거운 라이브러리 없이 CSS transform(scale/translate) + Pointer Events로 직접 구현.
 * Pointer Events 하나로 마우스 드래그/터치 팬/두 손가락 핀치를 전부 처리한다(포인터별
 * 좌표를 추적해 2개가 잡히면 핀치, 1개면 팬으로 분기).
 */
export default function ImageZoomPan({
  src,
  alt,
  initialScale = MIN_SCALE,
}: {
  src: string;
  alt: string;
  // 진입 시 자동으로 한 단계 확대된 상태로 시작하고 싶을 때 사용(task.md 3번 — 기본 표시
  // 크기가 작아 리포트 글씨가 안 보인다는 실사용 피드백). 리셋 버튼은 이 값이 아니라
  // MIN_SCALE(1)로 돌아간다 — "원래크기"는 항상 무확대를 의미해야 직관적이라서.
  initialScale?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(() => clampScale(initialScale));
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);

  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const dragStartRef = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null);
  const pinchStartRef = useRef<{ distance: number; scale: number } | null>(null);

  // 커서/손가락 위치가 확대·축소 후에도 같은 이미지 지점을 가리키도록 translate를 함께 보정한다.
  function zoomAt(clientX: number, clientY: number, delta: number) {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const cx = clientX - rect.left - rect.width / 2;
    const cy = clientY - rect.top - rect.height / 2;

    setScale((prevScale) => {
      const nextScale = clampScale(prevScale + delta);
      if (nextScale === prevScale) return prevScale;
      const ratio = nextScale / prevScale;
      setTranslate((prev) => ({
        x: cx - (cx - prev.x) * ratio,
        y: cy - (cy - prev.y) * ratio,
      }));
      return nextScale;
    });
  }

  function setScaleAt(clientX: number, clientY: number, nextScale: number) {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const cx = clientX - rect.left - rect.width / 2;
    const cy = clientY - rect.top - rect.height / 2;

    setScale((prevScale) => {
      const clamped = clampScale(nextScale);
      if (clamped === prevScale) return prevScale;
      const ratio = clamped / prevScale;
      setTranslate((prev) => ({
        x: cx - (cx - prev.x) * ratio,
        y: cy - (cy - prev.y) * ratio,
      }));
      return clamped;
    });
  }

  function handleWheel(e: ReactWheelEvent<HTMLDivElement>) {
    // Ctrl+휠(브라우저 자체 페이지 줌, 트랙패드 핀치도 ctrlKey로 들어옴)은 그대로 두어
    // 브라우저 줌과 충돌하지 않게 한다.
    if (e.ctrlKey) return;
    e.preventDefault();
    const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
    zoomAt(e.clientX, e.clientY, delta);
  }

  function handlePointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    (e.target as Element).setPointerCapture(e.pointerId);
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointersRef.current.size === 2) {
      const pts = [...pointersRef.current.values()];
      const distance = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      pinchStartRef.current = { distance, scale };
      dragStartRef.current = null;
      setIsDragging(false);
    } else if (pointersRef.current.size === 1 && scale > MIN_SCALE) {
      dragStartRef.current = { startX: e.clientX, startY: e.clientY, originX: translate.x, originY: translate.y };
      setIsDragging(true);
    }
  }

  function handlePointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!pointersRef.current.has(e.pointerId)) return;
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointersRef.current.size === 2 && pinchStartRef.current) {
      const pts = [...pointersRef.current.values()];
      const distance = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const midX = (pts[0].x + pts[1].x) / 2;
      const midY = (pts[0].y + pts[1].y) / 2;
      const nextScale = pinchStartRef.current.scale * (distance / pinchStartRef.current.distance);
      setScaleAt(midX, midY, nextScale);
      return;
    }

    if (dragStartRef.current) {
      const dx = e.clientX - dragStartRef.current.startX;
      const dy = e.clientY - dragStartRef.current.startY;
      setTranslate({ x: dragStartRef.current.originX + dx, y: dragStartRef.current.originY + dy });
    }
  }

  function handlePointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size < 2) pinchStartRef.current = null;
    if (pointersRef.current.size === 0) {
      dragStartRef.current = null;
      setIsDragging(false);
    }
  }

  function zoomButton(delta: number) {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, delta);
  }

  function reset() {
    setScale(1);
    setTranslate({ x: 0, y: 0 });
  }

  return (
    <div className={styles.wrapper}>
      <div
        ref={containerRef}
        className={`${styles.viewport} ${scale > MIN_SCALE ? (isDragging ? styles.grabbing : styles.grabbable) : ""}`}
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt}
          className={styles.image}
          style={{ transform: `translate(${translate.x}px, ${translate.y}px) scale(${scale})` }}
          draggable={false}
        />
      </div>
      <div className={styles.controls}>
        <button type="button" className={styles.controlButton} onClick={() => zoomButton(ZOOM_STEP)} aria-label="확대">
          +
        </button>
        <button type="button" className={styles.controlButton} onClick={() => zoomButton(-ZOOM_STEP)} aria-label="축소">
          −
        </button>
        <button type="button" className={styles.controlButton} onClick={reset} aria-label="원래 크기로">
          원래크기
        </button>
      </div>
    </div>
  );
}
