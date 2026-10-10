import React from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

interface PanelSectionProps {
  title: string;
  icon?: React.ReactNode;
  /** Right-aligned header content, e.g. a counter or action button. */
  actions?: React.ReactNode;
  /**
   * Section body. It gets its own scrollbar, independent of every other
   * section in the panel, so long tables never drag the whole panel.
   */
  children: React.ReactNode;
  /** Section content that should not scroll (short cards, summary tiles). */
  scroll?: boolean;
  /** Extra classes on the inner scroll/body area. */
  bodyClassName?: string;
  defaultCollapsed?: boolean;
  className?: string;
}

/**
 * A titled, bordered block whose body scrolls on its own. Panels compose these
 * instead of stacking loose cards under a single `overflow-y-auto` root, which
 * is what previously forced one scrollbar across the whole panel.
 */
export const PanelSection: React.FC<PanelSectionProps> = React.memo(({
  title,
  icon,
  actions,
  children,
  scroll = true,
  bodyClassName = '',
  defaultCollapsed = false,
  className = '',
}) => {
  const [collapsed, setCollapsed] = React.useState(defaultCollapsed);

  return (
    <section
      className={`flex flex-col min-h-0 rounded-lg border border-[#1b253b] bg-[#0e1422] overflow-hidden ${className}`}
    >
      <header className="flex items-center justify-between gap-2 px-2 py-1 bg-[#0b101c] border-b border-[#182338] shrink-0">
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          aria-expanded={!collapsed}
          className="flex items-center gap-1.5 text-[10px] font-bold tracking-wider text-amber-400 hover:text-amber-300 transition-colors text-left"
        >
          {collapsed ? (
            <ChevronRight />
          ) : (
            <ChevronDown className="w-3 h-3 opacity-60" />
          )}
          {icon}
          <span className="truncate">{title}</span>
        </button>
        {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
      </header>

      {!collapsed && (
        <div
          className={`flex-1 min-h-0 ${scroll ? 'overflow-auto' : 'overflow-hidden'} ${bodyClassName}`}
        >
          {children}
        </div>
      )}
    </section>
  );
});

/** Small chevron sized for section headers. */
const ChevronRight: React.FC = () => (
  <ChevronUp className="w-3 h-3 opacity-60 -rotate-90" />
);
