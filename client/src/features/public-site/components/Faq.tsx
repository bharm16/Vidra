import { useId, useState, type ReactElement } from "react";
import { FreshIcon } from "@/components/fresh/FreshButton";

export interface FaqRow { question: string; answer: string }

/** One answer open at a time: opening a question closes the last one, and the open question collapses. */
export function FaqList({ rows, initiallyOpen }: { rows: readonly FaqRow[]; initiallyOpen?: number }): ReactElement {
  const [open, setOpen] = useState<number | undefined>(initiallyOpen);
  return <div className="vf-site-faq">{rows.map((row, index) => <FaqItem key={row.question} row={row} open={open === index} onToggle={() => setOpen(current => current === index ? undefined : index)} />)}</div>;
}

function FaqItem({ row, open, onToggle }: { row: FaqRow; open: boolean; onToggle: () => void }): ReactElement {
  const id = useId();
  return <section className="vf-site-faq-row" data-open={open || undefined}>
    <h3><button type="button" aria-expanded={open} aria-controls={id} onClick={onToggle}><span>{row.question}</span><FreshIcon name="down" /></button></h3>
    <p id={id} hidden={!open}>{row.answer}</p>
  </section>;
}
