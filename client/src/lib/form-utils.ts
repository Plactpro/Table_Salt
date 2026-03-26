import { useEffect } from "react";

export function scrollToFirstError(formRef?: React.RefObject<HTMLElement | null>) {
  const container = formRef?.current ?? document;
  const firstError = container.querySelector<HTMLElement>(
    '[aria-invalid="true"], .border-red-500, .border-destructive, [data-invalid="true"]'
  );
  if (firstError) {
    firstError.scrollIntoView({ behavior: "smooth", block: "center" });
    const focusable = firstError.matches("input, select, textarea")
      ? firstError
      : firstError.querySelector<HTMLElement>("input, select, textarea");
    focusable?.focus();
  }
}

export function useDirtyFormGuard(isDirty: boolean) {
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "You have unsaved changes that will be lost.";
      return e.returnValue;
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);
}
