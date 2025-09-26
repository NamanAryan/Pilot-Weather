import { useEffect } from "react";
import { useToast } from "../../hooks/use-toast";

export default function Toaster() {
  const { toasts, dismiss } = useToast();

  useEffect(() => {
    const timers = toasts.map((t) => setTimeout(() => dismiss(t.id), 3000));
    return () => timers.forEach(clearTimeout);
  }, [toasts]);

  return (
    <div className="pointer-events-none fixed top-4 right-4 z-50 space-y-3">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto max-w-sm w-80 rounded-md border shadow-lg overflow-hidden animate-[fadeIn_.15s_ease-out] ${
            t.variant === 'success'
              ? 'border-green-200 bg-green-50'
              : t.variant === 'error'
              ? 'border-red-200 bg-red-50'
              : 'border-gray-200 bg-white'
          }`}
          role="status"
          aria-live="polite"
        >
          <div className="px-4 py-3">
            {t.title && (
              <div className={`font-medium mb-1 ${t.variant==='error' ? 'text-red-900' : t.variant==='success' ? 'text-green-900' : 'text-gray-900'}`}>{t.title}</div>
            )}
            {t.description && (
              <div className={`text-sm ${t.variant==='error' ? 'text-red-800' : t.variant==='success' ? 'text-green-800' : 'text-gray-700'}`}>{t.description}</div>
            )}
          </div>
          <button
            onClick={() => dismiss(t.id)}
            className="absolute top-2 right-2 text-gray-400 hover:text-gray-600"
            aria-label="Close"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}


