import { useRef, useState, type ReactElement } from "react";
import { Dialog, DialogClose, DialogContent, DialogTitle, DialogTrigger } from "@promptstudio/system/dialog";
import { FreshButton } from "@/components/fresh/FreshButton";

export function MobileContentsSheet({ items, className = "", tone = "quiet" }: { items: Array<{ id: string; label: string }>; className?: string; tone?: "quiet" | "secondary" }): ReactElement {
  const [open, setOpen] = useState(false);
  const selected = useRef<string>();
  return <Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild><FreshButton className={className} tone={tone}>On this page</FreshButton></DialogTrigger><DialogContent className="vf vf-mobile-contents-sheet" overlayClassName="vf vf-contents-overlay" aria-describedby={undefined} hideClose onCloseAutoFocus={event => {
    const id = selected.current;
    selected.current = undefined;
    if (!id) return;
    const heading = document.getElementById(id);
    if (!heading) return;
    event.preventDefault();
    heading.focus({ preventScroll: true });
    heading.scrollIntoView?.({ block: "start" });
  }}><div className="vf-mobile-contents-heading"><DialogTitle>On this page</DialogTitle><DialogClose asChild><FreshButton tone="quiet" aria-label="Close contents"><img src="/design-assets/fidelity-public-close.svg" alt="" width={18} height={18} /></FreshButton></DialogClose></div><nav aria-label="Page contents">{items.map(item => <a key={item.id} href={`#${item.id}`} onClick={event => { event.preventDefault(); selected.current = item.id; setOpen(false); }}>{item.label}</a>)}</nav></DialogContent></Dialog>;
}
