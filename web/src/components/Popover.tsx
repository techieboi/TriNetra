import { useEffect, useRef, useState, type ReactNode } from 'react';

interface Props {
  /** Renders the trigger button; call `toggle` from its onClick. */
  trigger: (open: boolean, toggle: () => void) => ReactNode;
  children: (close: () => void) => ReactNode;
  align?: 'left' | 'right';
  className?: string;
}

/** Dropdown anchored under its trigger; closes on outside click or Esc. */
export function Popover({ trigger, children, align = 'right', className = '' }: Props) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const close = () => setOpen(false);
  return (
    <div className="pop-root" ref={root}>
      {trigger(open, () => setOpen((o) => !o))}
      {open && <div className={`pop-menu ${align} ${className}`}>{children(close)}</div>}
    </div>
  );
}
