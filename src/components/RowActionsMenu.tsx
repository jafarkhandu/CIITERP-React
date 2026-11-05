import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export type RowActionItem = {
  label: string;
  onSelect: () => void;
  disabled?: boolean;
  danger?: boolean;
};

type Position = { top: number; left: number };

type Props = {
  actions: RowActionItem[];
  label?: string;
  disabled?: boolean;
};

const MENU_WIDTH = 184;
const MENU_HEIGHT = 196;

export default function RowActionsMenu({ actions, label = 'Row actions', disabled = false }: Props) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<Position>({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const updatePosition = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const top = window.innerHeight - rect.bottom < MENU_HEIGHT + 12
      ? Math.max(8, rect.top - MENU_HEIGHT - 6)
      : rect.bottom + 6;
    const left = Math.min(window.innerWidth - MENU_WIDTH - 8, Math.max(8, rect.right - MENU_WIDTH));
    setPosition({ top, left });
  }, []);

  useEffect(() => {
    if (!open) return;
    updatePosition();

    const closeOnOutside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!triggerRef.current?.contains(target) && !menuRef.current?.contains(target)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    const reposition = () => updatePosition();

    document.addEventListener('pointerdown', closeOnOutside);
    document.addEventListener('keydown', closeOnEscape);
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutside);
      document.removeEventListener('keydown', closeOnEscape);
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [open, updatePosition]);

  if (!actions.length) return null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="ciit-row-actions-trigger"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => {
          if (!open) updatePosition();
          setOpen((value) => !value);
        }}
      >
        <span aria-hidden="true">•••</span>
      </button>
      {open && createPortal(
        <div ref={menuRef} className="ciit-row-actions-menu" role="menu" style={{ top: position.top, left: position.left }}>
          {actions.map((action) => (
            <button
              key={action.label}
              type="button"
              role="menuitem"
              className={action.danger ? 'is-danger' : ''}
              disabled={action.disabled}
              onClick={() => {
                setOpen(false);
                action.onSelect();
              }}
            >
              {action.label}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </>
  );
}
