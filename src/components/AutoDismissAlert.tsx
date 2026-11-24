import { useEffect, useState, type ReactNode } from 'react';
import { ALERT_DISMISS_MS } from '@/core/notifications/useAutoDismissMessage';

interface AutoDismissAlertProps {
  message: string;
  className?: string;
  role?: 'alert' | 'status';
  as?: 'div' | 'p';
  children?: ReactNode;
}

/**
 * Hide a failure notification without clearing the underlying load/validation
 * state. Retry controls remain usable after the notification disappears.
 */
export function AutoDismissAlert({
  message,
  className,
  role = 'alert',
  as: Element = 'div',
  children,
}: AutoDismissAlertProps) {
  const [dismissed, setDismissed] = useState<string | null>(null);

  useEffect(() => {
    setDismissed(null);
    if (!message) return;
    const timeout = window.setTimeout(() => setDismissed(message), ALERT_DISMISS_MS);
    return () => window.clearTimeout(timeout);
  }, [message]);

  const visible = Boolean(message) && dismissed !== message;
  if (!visible && !children) return null;

  return (
    <Element
      className={visible ? className : 'd-flex justify-content-end mb-2'}
      role={visible ? role : undefined}
    >
      {visible && message}
      {children}
    </Element>
  );
}
