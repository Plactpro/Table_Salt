import { useEffect } from "react";

export function announceToScreenReader(message: string): void {
  const announcer = document.getElementById("aria-announcer");
  if (announcer) {
    announcer.textContent = "";
    requestAnimationFrame(() => {
      announcer.textContent = message;
    });
  }
}

export function PageTitle({ title }: { title: string }) {
  useEffect(() => {
    document.title = `${title} — Table Salt`;
  }, [title]);
  return null;
}
