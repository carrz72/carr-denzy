"use client";

import { useEffect, useId, useRef, useState } from "react";

/**
 * A review's words. Long ones show the first four lines and a button to read
 * the rest; the full text is always in the page, so search engines and screen
 * readers get all of it.
 *
 * Whether a review is "long" depends on the screen: a review that needs six
 * lines on a phone may fit in four on a wide card. So rather than guessing
 * from the character count, this measures whether the clamped text is
 * actually cut off, and re-checks when the card changes width. The button
 * only appears when there is genuinely more to read.
 */
export function ReviewText({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const [cutOff, setCutOff] = useState(false);
  const ref = useRef<HTMLQuoteElement>(null);
  const id = useId();

  useEffect(() => {
    const el = ref.current;
    if (!el || open) return;

    // ResizeObserver also fires once straight away, which is the first check.
    const check = () => setCutOff(el.scrollHeight - el.clientHeight > 1);
    const observer = new ResizeObserver(check);
    observer.observe(el);
    return () => observer.disconnect();
  }, [open, text]);

  return (
    <div className="flex flex-col items-start gap-1.5">
      <blockquote
        ref={ref}
        id={id}
        className={`m-0 leading-relaxed whitespace-pre-line ${open ? "" : "line-clamp-4"}`}
      >
        {text}
      </blockquote>
      {(cutOff || open) && (
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen((value) => !value)}
          className="inline-flex min-h-11 items-center font-bold text-accent transition-opacity hover:opacity-75"
        >
          {open ? "Show less" : "Read more"}
        </button>
      )}
    </div>
  );
}
