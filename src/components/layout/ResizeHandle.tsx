import React, { useRef } from 'react';

interface ResizeHandleProps {
  /** 'vertical' splits left/right, 'horizontal' splits top/bottom. */
  orientation: 'vertical' | 'horizontal';
  /** Container whose rect defines the 100% reference for `value`. */
  containerRef: React.RefObject<HTMLElement | null>;
  /** Size (%) of the leading panel — the one before the divider. */
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
}

/**
 * Draggable divider between two panels.
 *
 * - Pointer drag (pointer capture keeps the drag alive outside the handle)
 * - Keyboard: arrow keys adjust by 2%, Shift+arrow by 10%
 * - ARIA separator semantics with the current value announced
 */
export const ResizeHandle: React.FC<ResizeHandleProps> = ({
  orientation,
  containerRef,
  value,
  onChange,
  min = 15,
  max = 85,
}) => {
  const dragState = useRef<{ pointer: number; startValue: number } | null>(null);
  const isVertical = orientation === 'vertical';

  const axisPos = (e: React.PointerEvent) => (isVertical ? e.clientX : e.clientY);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragState.current = { pointer: axisPos(e), startValue: value };
    document.body.style.userSelect = 'none';
    document.body.style.cursor = isVertical ? 'col-resize' : 'row-resize';
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const state = dragState.current;
    if (!state) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const total = isVertical ? rect.width : rect.height;
    if (total <= 0) return;
    const deltaPct = ((axisPos(e) - state.pointer) / total) * 100;
    const next = Math.min(max, Math.max(min, state.startValue + deltaPct));
    if (next !== value) onChange(next);
  };

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragState.current) return;
    dragState.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* pointer may already be released */
    }
    document.body.style.userSelect = '';
    document.body.style.cursor = '';
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 10 : 2;
    let next: number | null = null;
    if (isVertical && e.key === 'ArrowLeft') next = value - step;
    if (isVertical && e.key === 'ArrowRight') next = value + step;
    if (!isVertical && e.key === 'ArrowUp') next = value - step;
    if (!isVertical && e.key === 'ArrowDown') next = value + step;
    if (next === null) return;
    e.preventDefault();
    onChange(Math.min(max, Math.max(min, next)));
  };

  return (
    <div
      role="separator"
      tabIndex={0}
      aria-orientation={orientation}
      aria-label={isVertical ? 'Resize panels left and right' : 'Resize panels top and bottom'}
      aria-valuenow={Math.round(value)}
      aria-valuemin={min}
      aria-valuemax={max}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onKeyDown={handleKeyDown}
      onLostPointerCapture={endDrag}
      style={{ touchAction: 'none' }}
      className={`group relative z-10 flex shrink-0 items-center justify-center bg-[#04060c] transition-colors hover:bg-amber-500/5 focus:bg-amber-500/5 focus:outline-none ${
        isVertical ? 'w-2 cursor-col-resize' : 'h-2 cursor-row-resize'
      }`}
      title="Drag to resize panels (arrow keys supported)"
    >
      <div
        className={`rounded-full bg-[#2b3a58] transition-colors group-hover:bg-amber-400 group-focus:bg-amber-400 ${
          isVertical ? 'h-8 w-0.5' : 'h-0.5 w-8'
        }`}
      />
    </div>
  );
};
