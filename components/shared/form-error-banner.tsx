interface FormErrorBannerProps {
  message: string | null | undefined;
}

export function FormErrorBanner({ message }: FormErrorBannerProps) {
  if (!message) return null;
  return (
    <div
      role="alert"
      aria-live="polite"
      className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-950/50 dark:text-red-400"
    >
      {message}
    </div>
  );
}
