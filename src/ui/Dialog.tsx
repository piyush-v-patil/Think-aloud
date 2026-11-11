import { useEffect, useRef, type ReactNode } from 'react';

/** A modal built on the native <dialog> element (focus trap and Escape for free). */
export function Dialog({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-labelledby="dialog-title"
      className="m-auto w-[min(560px,calc(100vw-32px))] rounded-dialog border border-ink bg-board p-6 text-ink backdrop:bg-[var(--backdrop)]"
    >
      <h2 id="dialog-title" className="mb-4 text-md font-semibold">
        {title}
      </h2>
      {children}
    </dialog>
  );
}
