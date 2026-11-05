import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
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

const MENU_WIDTH = 196;
const VIEWPORT_GAP = 8;

export default function RowActionsMenu({ actions, label = 'Row actions', disabled = false }: Props) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<Position>({ top: -1000, left: -1000 });
  const [positionReady, setPositionReady] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current?.getBoundingClientRect();
    const menu = menuRef.current;
    if (!trigger || !menu) return;

    const menuRect = menu.getBoundingClientRect();
    const menuHeight = Math.min(menuRect.height || 160, window.innerHeight - VIEWPORT_GAP * 2);
    const menuWidth = Math.min(menuRect.width || MENU_WIDTH, window.innerWidth - VIEWPORT_GAP * 2);
    const spaceBelow = window.innerHeight - trigger.bottom - VIEWPORT_GAP;
    const spaceAbove = trigger.top - VIEWPORT_GAP;
    const showAbove = spaceBelow < menuHeight + 6 && spaceAbove > spaceBelow;

    const preferredTop = showAbove
      ? trigger.top - menuHeight - 6
      : trigger.bottom + 6;
    const top = Math.max(
      VIEWPORT_GAP,
      Math.min(preferredTop, window.innerHeight - menuHeight - VIEWPORT_GAP),
    );
    const left = Math.max(
      VIEWPORT_GAP,
      Math.min(trigger.right - menuWidth, window.innerWidth - menuWidth - VIEWPORT_GAP),
    );
    const next = { top: Math.round(top), left: Math.round(left) };

    setPosition((current) => (
      current.top === next.top && current.left === next.left ? current : next
    ));
    setPositionReady(true);
  }, []);

  useLayoutEffect(() => {
    if (!open) {
      setPositionReady(false);
      return;
    }

    updatePosition();

    const closeOnOutside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!triggerRef.current?.contains(target) && !menuRef.current?.contains(target)) {
        setOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };

    document.addEventListener('pointerdown', closeOnOutside);
    document.addEventListener('keydown', closeOnEscape);
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);

    return () => {
      document.removeEventListener('pointerdown', closeOnOutside);
      document.removeEventListener('keydown', closeOnEscape);
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open, updatePosition]);

  if (!actions.length) return null;

  // A single permitted action stays visible; only multi-action rows get a menu.
  if (actions.length === 1) {
    const action = actions[0];
    return (
      <button
        type="button"
        className={`ciit-row-single-action${action.danger ? ' is-danger' : ''}`}
        disabled={disabled || Boolean(action.disabled)}
        onClick={action.onSelect}
      >
        {action.label}
      </button>
    );
  }

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
        onClick={() => setOpen((value) => !value)}
      >
        <span aria-hidden="true">•••</span>
      </button>
      {open && createPortal(
        <div
          ref={menuRef}
          className="ciit-row-actions-menu"
          role="menu"
          aria-label={label}
          style={{
            top: position.top,
            left: position.left,
            visibility: positionReady ? 'visible' : 'hidden',
          }}
        >
          {actions.map((action) => (
            <button
              key={action.label}
              type="button"
              role="menuitem"
              className={action.danger ? 'is-danger' : ''}
              disabled={disabled || Boolean(action.disabled)}
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
