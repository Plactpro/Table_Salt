export type ChefEvent =
  | "idle"
  | "greeting"
  | "hover"
  | "click"
  | "scroll"
  | "success"
  | "error"
  | "sleeping"
  | "order-complete"
  | "reservation-new"
  | "busy-hour";

const CHEF_EVENT = "chef:event";

export function emitChefEvent(event: ChefEvent, detail?: string) {
  window.dispatchEvent(
    new CustomEvent(CHEF_EVENT, { detail: { event, message: detail } })
  );
}

export function onChefEvent(
  handler: (event: ChefEvent, message?: string) => void
): () => void {
  const listener = (e: Event) => {
    const ce = e as CustomEvent<{ event: ChefEvent; message?: string }>;
    handler(ce.detail.event, ce.detail.message);
  };
  window.addEventListener(CHEF_EVENT, listener);
  return () => window.removeEventListener(CHEF_EVENT, listener);
}
