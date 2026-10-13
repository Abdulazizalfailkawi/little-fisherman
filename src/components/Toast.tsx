"use client";

import Link from "next/link";
import { createContext, useCallback, useContext, useState } from "react";
import { CheckCircle2 } from "lucide-react";

export interface ToastAction {
  label: string;
  href: string;
}
type Show = (msg: string, action?: ToastAction) => void;
const Ctx = createContext<Show>(() => {});

/** Short confirmation message ("تم حفظ الصيدة") that survives page navigation. */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<{ msg: string; action?: ToastAction } | null>(null);
  const show = useCallback<Show>((msg, action) => {
    const item = { msg, action };
    setToast(item);
    setTimeout(() => setToast((cur) => (cur === item ? null : cur)), action ? 7000 : 2600);
  }, []);
  return (
    <Ctx.Provider value={show}>
      {children}
      {toast && (
        <div role="status" className="no-print pointer-events-none fixed inset-x-0 top-[calc(var(--safe-top)+0.75rem)] z-[60] flex justify-center px-4">
          <div className="pointer-events-auto flex items-center gap-2 rounded-2xl border border-good/40 bg-surface px-4 py-3 text-sm font-medium shadow-2xl">
            <CheckCircle2 className="size-5 shrink-0 text-good" /> <span>{toast.msg}</span>
            {toast.action && (
              <Link href={toast.action.href} className="shrink-0 rounded-lg bg-teal/15 px-2.5 py-1 text-teal" onClick={() => setToast(null)}>
                {toast.action.label}
              </Link>
            )}
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);
