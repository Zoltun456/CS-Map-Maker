import { useEffect, useRef, type ReactNode } from 'react';

export function Dialog({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose(): void;
}) {
  const dialog = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  useEffect(() => {
    previousFocus.current = document.activeElement as HTMLElement | null;
    const first = dialog.current?.querySelector<HTMLElement>(
      'button,textarea,input,select,[tabindex]:not([tabindex="-1"])',
    );
    first?.focus();
    return () => previousFocus.current?.focus();
  }, []);
  const keyboard = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== 'Tab' || !dialog.current) return;
    const focusable = [
      ...dialog.current.querySelectorAll<HTMLElement>(
        'button,textarea,input,select,a[href],[tabindex]:not([tabindex="-1"])',
      ),
    ].filter((element) => !element.hasAttribute('disabled'));
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable.at(-1)!;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };
  return (
    <div
      className="modal"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="box"
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        onKeyDown={keyboard}
      >
        <h2 id="dialog-title">{title}</h2>
        {children}
      </div>
    </div>
  );
}
