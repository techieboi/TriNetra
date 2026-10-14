import type { ReactNode } from 'react';
import { Icon } from './Icon';

interface Props {
  open: boolean;
  title: ReactNode;
  subtitle?: ReactNode;
  onClose: () => void;
  children: ReactNode;
}

/** Right-hand detail panel (a bottom sheet on phones). Stays mounted so it can slide in and out. */
export function Drawer({ open, title, subtitle, onClose, children }: Props) {
  return (
    <aside className={`drawer ${open ? 'open' : ''}`} aria-hidden={!open}>
      <div className="drawer-head">
        <div className="drawer-titles">
          <div className="drawer-title">{title}</div>
          {subtitle && <div className="drawer-sub">{subtitle}</div>}
        </div>
        <button className="icon-btn" onClick={onClose} aria-label="Close panel"><Icon name="x" size={16} /></button>
      </div>
      <div className="drawer-body">{children}</div>
    </aside>
  );
}
