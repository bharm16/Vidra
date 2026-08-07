import { spanIdSelector } from "@features/span-highlighting";
export function scrollToSpanById(spanId: string): void {
  if (!spanId || typeof document === "undefined") return;

  const target = document.querySelector(
    spanIdSelector(spanId),
  ) as HTMLElement | null;

  if (!target) return;

  target.scrollIntoView({
    behavior: "smooth",
    block: "center",
    inline: "nearest",
  });
  target.classList.add("ps-animate-span-pulse");
  window.setTimeout(() => {
    target.classList.remove("ps-animate-span-pulse");
  }, 700);
}
