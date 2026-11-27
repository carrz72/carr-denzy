"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeftIcon, ArrowRightIcon, MapPinIcon, XIcon } from "@phosphor-icons/react/dist/ssr";
import { findArticle } from "@/lib/help";
import { cn } from "@/lib/cn";

/**
 * "Show me": a walkthrough over the real app.
 *
 * It dims the screen, rings the actual button to tap, and moves on when that
 * button is tapped. People learn where things are by doing it once on their
 * own screen, which a written page or a video never quite manages.
 *
 * Where it is up to lives in sessionStorage, so it carries on across the
 * page changes the steps themselves cause, and a reload does not lose it.
 * The overlay never blocks a tap: it is drawn with `pointer-events: none`,
 * so the highlighted button (and anything else) still works as normal.
 */

const KEY = "help-tour";
const EVENT = "help-tour-change";

interface TourState {
  id: string;
  step: number;
}

function readState(): TourState | null {
  try {
    const raw = window.sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as TourState) : null;
  } catch {
    return null;
  }
}

function writeState(state: TourState | null) {
  try {
    if (state) window.sessionStorage.setItem(KEY, JSON.stringify(state));
    else window.sessionStorage.removeItem(KEY);
  } catch {
    // Private browsing: the walkthrough still runs, it just won't survive a reload.
  }
  memory = state;
  window.dispatchEvent(new Event(EVENT));
}

// Fallback when sessionStorage is unavailable.
let memory: TourState | null = null;

export function startTour(id: string) {
  writeState({ id, step: 0 });
}

function visible(element: HTMLElement): boolean {
  if (element.getClientRects().length === 0) return false;
  const style = window.getComputedStyle(element);
  return style.visibility !== "hidden" && style.display !== "none";
}

interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
  /** Which step and screen it was measured for. */
  for: string;
}

export function HelpTour() {
  const pathname = usePathname();
  const router = useRouter();
  const [state, setState] = useState<TourState | null>(null);
  const [rawBox, setBox] = useState<Box | null>(null);
  const targetRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const sync = () => setState(readState() ?? memory);
    sync();
    window.addEventListener(EVENT, sync);
    return () => window.removeEventListener(EVENT, sync);
  }, []);

  const article = state ? findArticle(state.id) : undefined;
  const step = article && state ? article.steps[state.step] : undefined;
  const total = article?.steps.length ?? 0;
  const onWrongPagePath = Boolean(step?.path && step.path !== pathname);

  const go = useCallback(
    (delta: number) => {
      const current = readState() ?? memory;
      if (!current) return;
      const art = findArticle(current.id);
      const next = current.step + delta;
      if (!art || next >= art.steps.length) writeState(null);
      else writeState({ id: current.id, step: Math.max(0, next) });
    },
    [],
  );

  const end = useCallback(() => writeState(null), []);

  // A step that is only "open this screen" is done once you are on it, even
  // if the link to it is not on the page you are looking at.
  const linkTo = step?.target?.match(/a\[href="([^"]+)"\]/)?.[1];
  const alreadyThere = Boolean(linkTo && linkTo === pathname && !step?.manual);
  const onWrongPage = onWrongPagePath && !alreadyThere;
  useEffect(() => {
    if (alreadyThere) go(1);
  }, [alreadyThere, state?.step, go]);

  // The ring belongs to one step on one screen; a ring measured for an
  // earlier step is simply not drawn.
  const stepKey = state && step?.target && !onWrongPage && !alreadyThere ? `${state.id}:${state.step}:${pathname}` : null;
  const box = rawBox && rawBox.for === stepKey ? rawBox : null;

  // Find the button for this step, keep the ring on it as the page scrolls or
  // changes, and scroll it into view the first time it appears.
  useEffect(() => {
    targetRef.current = null;
    if (!stepKey || !step?.target) return;

    let frame = 0;
    let scrolled = false;
    let last = "";

    const tick = () => {
      const element =
        Array.from(document.querySelectorAll<HTMLElement>(step.target!)).find(visible) ?? null;
      targetRef.current = element;

      if (element) {
        if (!scrolled) {
          element.scrollIntoView({ block: "center", behavior: "smooth" });
          scrolled = true;
        }
        const r = element.getBoundingClientRect();
        const key = `${Math.round(r.top)}:${Math.round(r.left)}:${Math.round(r.width)}:${Math.round(r.height)}`;
        if (key !== last) {
          last = key;
          setBox({ top: r.top, left: r.left, width: r.width, height: r.height, for: stepKey });
        }
      } else if (last !== "") {
        last = "";
        setBox(null);
      }
      frame = window.requestAnimationFrame(tick);
    };

    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [step, stepKey]);

  // Tapping the highlighted button counts as doing the step.
  useEffect(() => {
    if (!step || step.manual) return;
    const onTap = (event: Event) => {
      const element = targetRef.current;
      if (element && event.target instanceof Node && element.contains(event.target)) {
        // After the tap has done its own work (opened a form, changed page).
        window.setTimeout(() => go(1), 50);
      }
    };
    document.addEventListener("click", onTap, true);
    return () => document.removeEventListener("click", onTap, true);
  }, [step, go]);

  useEffect(() => {
    if (!step) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") end();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step, end]);

  if (!article || !step || !state) return null;

  const last = state.step === total - 1;
  // Card at the bottom, unless the button is down there, then at the top.
  const cardAtTop = box ? box.top + box.height / 2 > window.innerHeight * 0.55 : false;
  const pad = 6;

  return (
    <div className="no-print">
      {box ? (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed z-[90] rounded-xl ring-4 ring-accent transition-[top,left,width,height] duration-200 ease-out motion-reduce:transition-none"
          style={{
            top: box.top - pad,
            left: box.left - pad,
            width: box.width + pad * 2,
            height: box.height + pad * 2,
            boxShadow: "0 0 0 9999px rgb(10 20 40 / 0.5)",
          }}
        />
      ) : null}

      <div
        role="dialog"
        aria-live="polite"
        aria-label={`How to: ${article.question}`}
        className={cn(
          "fixed inset-x-3 z-[91] mx-auto max-w-md rounded-2xl bg-surface-raised p-4 shadow-float ring-1 ring-line",
          cardAtTop ? "top-3" : "bottom-[calc(env(safe-area-inset-bottom)+5.25rem)] lg:bottom-6",
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <p className="text-xs font-semibold text-ink-subtle">
            Step {state.step + 1} of {total} · {article.question}
          </p>
          <button
            type="button"
            onClick={end}
            className="-m-2 flex size-10 shrink-0 items-center justify-center rounded-full text-ink-subtle hover:bg-surface-sunken hover:text-ink"
          >
            <XIcon size={18} weight="bold" aria-hidden="true" />
            <span className="sr-only">End the walkthrough</span>
          </button>
        </div>

        <p className="mt-1.5 text-[1.0625rem] font-semibold leading-snug text-ink">{step.text}</p>

        {onWrongPage ? (
          <button
            type="button"
            onClick={() => router.push(step.path!)}
            className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-full bg-accent px-4 text-sm font-bold text-white"
          >
            Take me there
            <ArrowRightIcon size={16} weight="bold" aria-hidden="true" />
          </button>
        ) : step.where && !box ? (
          <p className="mt-2 flex items-center gap-1.5 text-sm text-ink-muted">
            <MapPinIcon size={16} aria-hidden="true" className="shrink-0" />
            {step.where}
          </p>
        ) : step.target && !box ? (
          <p className="mt-2 text-sm text-ink-muted">Look for it on this screen. You may need to scroll.</p>
        ) : null}

        <div className="mt-3 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => go(-1)}
            disabled={state.step === 0}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-ink-muted hover:text-ink disabled:invisible"
          >
            <ArrowLeftIcon size={16} weight="bold" aria-hidden="true" />
            Back
          </button>
          <button
            type="button"
            onClick={() => go(1)}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-line-strong px-4 text-sm font-bold text-ink hover:border-ink"
          >
            {last ? "Done" : box && !step.manual ? "Skip" : "Next"}
            {last ? null : <ArrowRightIcon size={16} weight="bold" aria-hidden="true" />}
          </button>
        </div>
      </div>
    </div>
  );
}
