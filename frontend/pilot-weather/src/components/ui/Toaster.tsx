import { useEffect, useState } from "react";
import { useToast } from "../../hooks/use-toast";

export default function Toaster() {
  const { toasts, dismiss } = useToast();
  const [dismissingToasts, setDismissingToasts] = useState<Set<string>>(new Set());

  useEffect(() => {
    const timers = toasts.map((t) => setTimeout(() => {
      setDismissingToasts(prev => new Set(prev).add(t.id));
      setTimeout(() => dismiss(t.id), 300); // Wait for slide-out animation
    }, 3000));
    return () => timers.forEach(clearTimeout);
  }, [toasts, dismiss]);

  const handleDismiss = (toastId: string) => {
    setDismissingToasts(prev => new Set(prev).add(toastId));
    setTimeout(() => dismiss(toastId), 300); // Wait for slide-out animation
  };

  return (
    <div className="pointer-events-none fixed top-4 right-4 z-50 space-y-3">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto max-w-sm w-80 rounded-md border shadow-lg overflow-hidden ${
            dismissingToasts.has(t.id) ? 'toast-slide-out' : 'toast-slide-in'
          } ${
            t.variant === 'success'
              ? 'border-green-200 bg-green-50'
              : t.variant === 'error'
              ? 'border-red-200 bg-red-50'
              : 'border-gray-700 bg-gray-800'
          }`}
          role="status"
          aria-live="polite"
        >
          <div className="px-4 py-3">
            {t.title && (
              <div className={`font-medium mb-1 ${t.variant==='error' ? 'text-red-700' : t.variant==='success' ? 'text-green-700' : 'text-white'}`}>{t.title}</div>
            )}
            {t.description && (
              <div className={`text-sm ${t.variant==='error' ? 'text-red-600' : t.variant==='success' ? 'text-green-600' : 'text-gray-200'}`}>{t.description}</div>
            )}
          </div>
          <button
            onClick={() => handleDismiss(t.id)}
            className="absolute top-2 right-2 text-gray-300 hover:text-white"
            aria-label="Close"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}


