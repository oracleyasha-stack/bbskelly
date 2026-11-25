import React from 'react';
import { createPortal } from 'react-dom';
import { useEffect, useRef, useState } from 'react';
import type { FunctionCode } from '../../types/terminal';
import { Maximize2, Minimize2, ChevronDown } from 'lucide-react';
import { AVAILABLE_FUNCTIONS } from '../../data/functions';
import { audioService } from '../../services/audioService';

interface PanelWrapperProps {
  title: string;
  code: FunctionCode;
  ticker?: string;
  isMaximized?: boolean;
  onToggleMaximize?: () => void;
  onChangeFunction?: (code: FunctionCode) => void;
  children: React.ReactNode;
  headerAction?: React.ReactNode;
}



export const PanelWrapper: React.FC<PanelWrapperProps> = React.memo(({
  title,
  code,
  ticker,
  isMaximized,
  onToggleMaximize,
  onChangeFunction,
  children,
  headerAction,
}) => {
  const [functionMenuOpen, setFunctionMenuOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0, maxHeight: 320 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const openFunctionMenu = () => {
    const trigger = triggerRef.current;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const menuWidth = Math.min(256, window.innerWidth - 16);
    const maxHeight = Math.min(320, window.innerHeight - 16);
    const spaceBelow = window.innerHeight - rect.bottom - 8;
    const placeAbove = spaceBelow < Math.min(maxHeight, AVAILABLE_FUNCTIONS.length * 27) && rect.top > spaceBelow;
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - menuWidth - 8));

    setMenuPosition({
      top: placeAbove ? Math.max(8, rect.top - maxHeight - 4) : rect.bottom + 4,
      left,
      maxHeight,
    });
    setFunctionMenuOpen(true);
  };

  useEffect(() => {
    if (!functionMenuOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!triggerRef.current?.contains(target) && !menuRef.current?.contains(target)) {
        setFunctionMenuOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setFunctionMenuOpen(false);
        triggerRef.current?.focus();
        return;
      }
      // Arrow-key navigation between menu items (menuitemradio pattern).
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        const items = menuRef.current?.querySelectorAll<HTMLButtonElement>('button[role="menuitemradio"]');
        if (!items || items.length === 0) return;
        event.preventDefault();
        const active = document.activeElement as HTMLElement | null;
        let idx = Array.from(items).indexOf(active as HTMLButtonElement);
        if (idx === -1) {
          idx = event.key === 'ArrowDown' ? 0 : items.length - 1;
        } else {
          idx = event.key === 'ArrowDown' ? (idx + 1) % items.length : (idx - 1 + items.length) % items.length;
        }
        items[idx].focus();
      }
    };
    const handleViewportChange = (event: Event) => {
      // Scrolling the menu itself is how keyboard and touch users reach the
      // lower functions. Only close it when the page or another scroll region
      // moves, not when the portal's own list scrolls.
      if (event.type === 'scroll' && menuRef.current?.contains(event.target as Node)) return;
      setFunctionMenuOpen(false);
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', handleViewportChange);
    window.addEventListener('scroll', handleViewportChange, true);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', handleViewportChange);
      window.removeEventListener('scroll', handleViewportChange, true);
    };
  }, [functionMenuOpen]);

  return (
    <div className="flex flex-col h-full w-full bg-[#0a0e17] border border-[#2b3a58] rounded overflow-hidden shadow-lg">
      {/* Slim panel titlebar: 1 row, minimal chrome so panels show data first */}
      <div className="flex items-center justify-between gap-2 px-2 py-1 bg-[#0f1524] border-b border-[#2b3a58] text-xs font-mono shrink-0">
        <div className="flex items-center space-x-2 min-w-0 flex-1">
          {/* Function Dropdown */}
          {onChangeFunction ? (
            <div className="relative">
              <button
                ref={triggerRef}
                type="button"
                aria-haspopup="menu"
                aria-expanded={functionMenuOpen}
                aria-label={`Select function for ${title}`}
                onClick={() => {
                  audioService.playKeyClick();
                  if (functionMenuOpen) setFunctionMenuOpen(false);
                  else openFunctionMenu();
                }}
                className="flex items-center space-x-1 px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 font-bold border border-amber-500/40 hover:bg-amber-500/30 text-[11px] transition-colors min-h-[28px]"
              >
                <span>{code}</span>
                <ChevronDown className="w-2.5 h-2.5" aria-hidden="true" />
              </button>
              {functionMenuOpen && createPortal(
                <div
                  ref={menuRef}
                  role="menu"
                  aria-label={`Functions for ${title}`}
                  style={{
                    position: 'fixed',
                    top: menuPosition.top,
                    left: menuPosition.left,
                    width: Math.min(256, window.innerWidth - 16),
                    maxHeight: menuPosition.maxHeight,
                    zIndex: 1000,
                  }}
                  className="overflow-y-auto bg-[#101726] border border-[#232f48] shadow-2xl rounded py-1 text-[11px]"
                >
                  {AVAILABLE_FUNCTIONS.map((f) => (
                    <button
                      key={f.code}
                      type="button"
                      role="menuitemradio"
                      aria-checked={f.code === code}
                      onClick={() => {
                        audioService.playKeyClick();
                        onChangeFunction(f.code);
                        setFunctionMenuOpen(false);
                      }}
                      className={`w-full text-left px-3 py-1 hover:bg-amber-500/20 hover:text-amber-300 transition-colors ${
                        f.code === code ? 'text-amber-400 font-bold bg-amber-500/10' : 'text-zinc-300'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>,
                document.body
              )}
            </div>
          ) : (
            <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 font-bold border border-amber-500/40 text-[11px]">
              {code}
            </span>
          )}

          <span className="font-semibold text-zinc-200 tracking-wide text-[11px] truncate min-w-0 flex-1">{title}</span>

          {ticker && (
            <span className="text-zinc-400 text-[10px] bg-[#162033] px-1.5 py-px rounded border border-[#22304d] shrink-0">
              {ticker}
            </span>
          )}
        </div>

        {/* Right Actions */}
        <div className="flex items-center space-x-2 shrink-0">
          {headerAction}

          {onToggleMaximize && (
            <button
              onClick={() => {
                audioService.playKeyClick();
                onToggleMaximize();
              }}
              title={isMaximized ? 'Restore View' : 'Maximize Panel'}
              aria-label={isMaximized ? `Restore ${title}` : `Maximize ${title}`}
              className="text-zinc-400 hover:text-amber-400 transition-colors p-1.5 rounded hover:bg-[#1a2336] min-h-[28px] min-w-[28px] flex items-center justify-center focus-visible:outline-2 focus-visible:outline-amber-400"
            >
              {isMaximized ? <Minimize2 className="w-3.5 h-3.5" aria-hidden="true" /> : <Maximize2 className="w-3.5 h-3.5" aria-hidden="true" />}
            </button>
          )}
        </div>
      </div>

      {/* Panel Body. Deliberately `overflow-hidden`, not `overflow-auto`: every
          panel owns its own scroll regions (PanelSection bodies, the chart SVG,
          table wrappers), so a scrollbar here would nest a second, redundant
          one around the whole panel. */}
      <div className="flex-1 min-h-0 overflow-hidden bg-[#090d16] relative">{children}</div>
    </div>
  );
});
