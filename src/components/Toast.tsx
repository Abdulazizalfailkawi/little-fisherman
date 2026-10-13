"use client";

import { createContext, useCallback, useContext, useState } from "react";
import { CheckCircle2 } from "lucide-react";

const Ctx = createContext<(msg: string) => void>(() => {});

/** Short confirmation message ("تم حفظ الصيدة") that survives page navigation. */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [msg, setMsg] = useState<string | null>(null);
  const show = useCallback((m: string) => {
    setMsg(m);
    setTimeout(() => setMsg((cur) => (cur === m ? null : cur)), 2600);
  }, []);
  return (
    <Ctx.Provider value={show}>
      {children}
      {msg && (
        <div role="status" className="no-print fixed inset-x-0 top-[calc(var(--safe-top)+0.75rem)] z-[60] flex justify-center px-4">
          <div className="flex items-center gap-2 rounded-2xl border border-good/40 bg-surface px-4 py-3 text-sm font-medium shadow-2xl">
            <CheckCircle2 className="size-5 text-good" /> {msg}
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);
