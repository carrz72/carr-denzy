"use client";

import Image from "next/image";
import { useCallback, useId, useRef, useState } from "react";
import { ArrowsHorizontalIcon } from "@phosphor-icons/react/dist/ssr";
import { cn } from "@/lib/cn";

/**
 * A before/after slider — a draggable divider that wipes between two overlaid
 * images of the same job.
 *
 * Built because two photographs of one garden shown as two neighbouring cards
 * read as two unrelated projects. Overlaying them and making the customer drag
 * the divider does the opposite: it forces the comparison, and it is the one
 * interaction on this site somebody might actually enjoy.
 *
 * Implementation notes:
 *
 *  * `clip-path: inset()` on the top layer, driven by one CSS custom property.
 *    Clipping composites on the GPU; animating width would relayout every frame.
 *  * Pointer Events, not mouse + touch listeners, so a finger, a mouse and a
 *    stylus all take the same path.
 *  * A real `<input type="range">` sits on top at full size and full
 *    transparency. That is the whole keyboard and screen-reader story for free —
 *    arrow keys, Home/End and an announced value — instead of a div with
 *    hand-rolled ARIA that never quite behaves.
 *  * No framer-motion: it is not a dependency of this project, and this needs
 *    no physics. Position tracks the pointer exactly; a spring would lag behind
 *    the finger and feel broken.
 */
export function BeforeAfter({
  beforeSrc,
  afterSrc,
  caption,
  priority = false,
  className,
}: {
  beforeSrc: string;
  afterSrc: string;
  caption: string;
  priority?: boolean;
  className?: string;
}) {
  const [position, setPosition] = useState(50);
  const [dragging, setDragging] = useState(false);
  const frameRef = useRef<HTMLDivElement>(null);
  const labelId = useId();

  const setFromClientX = useCallback((clientX: number) => {
    const frame = frameRef.current;
    if (!frame) return;

    const { left, width } = frame.getBoundingClientRect();
    if (width === 0) return;

    const next = ((clientX - left) / width) * 100;
    setPosition(Math.min(100, Math.max(0, next)));
  }, []);

  return (
    <figure className={cn("group", className)}>
      <div
        ref={frameRef}
        className={cn(
          "relative overflow-hidden rounded-xl border border-line bg-surface-sunken shadow-subtle",
          "aspect-[4/3] touch-none select-none",
        )}
        onPointerDown={(event) => {
          // Capture on the frame so a fast drag that leaves the element still
          // tracks, instead of stopping dead at the edge.
          event.currentTarget.setPointerCapture(event.pointerId);
          setDragging(true);
          setFromClientX(event.clientX);
        }}
        onPointerMove={(event) => {
          if (!dragging) return;
          setFromClientX(event.clientX);
        }}
        onPointerUp={(event) => {
          event.currentTarget.releasePointerCapture(event.pointerId);
          setDragging(false);
        }}
        onPointerCancel={() => setDragging(false)}
        style={{ ["--wipe" as string]: `${position}%` }}
      >
        {/* Base layer: the finished job. */}
        <Image
          src={afterSrc}
          alt={`${caption} — after`}
          fill
          sizes="(min-width: 1024px) 50vw, 100vw"
          priority={priority}
          className="object-cover"
        />

        {/* Top layer: how it started, clipped to the left of the divider. */}
        <div
          className="absolute inset-0"
          style={{ clipPath: "inset(0 calc(100% - var(--wipe)) 0 0)" }}
        >
          <Image
            src={beforeSrc}
            alt={`${caption} — before`}
            fill
            sizes="(min-width: 1024px) 50vw, 100vw"
            priority={priority}
            className="object-cover"
          />
        </div>

        <Corner side="left" label="Before" hidden={position < 18} />
        <Corner side="right" label="After" hidden={position > 82} />

        {/* The divider. `pointer-events-none` so it never swallows a drag that
            is really meant for the range input underneath the cursor. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 z-10 w-0.5 -translate-x-1/2 bg-surface-raised shadow-[0_0_0_1px_rgba(0,0,0,0.15)]"
          style={{ left: "var(--wipe)" }}
        >
          <span
            className={cn(
              "absolute left-1/2 top-1/2 flex size-11 -translate-x-1/2 -translate-y-1/2",
              "items-center justify-center rounded-full bg-surface-raised text-ink shadow-float",
              "transition-transform duration-200 [transition-timing-function:var(--ease-standard)]",
              // A small grow on hover and a press-down on drag: the handle should
              // feel like a physical thing you have hold of.
              "group-hover:scale-105",
              dragging && "scale-95",
              "motion-reduce:transition-none motion-reduce:group-hover:scale-100",
            )}
          >
            <ArrowsHorizontalIcon size={20} weight="bold" aria-hidden="true" />
          </span>
        </div>

        {/*
          The accessible control. Invisible but not `hidden` — it is the real
          input, sized to the whole frame so keyboard focus lands somewhere
          sensible and a screen reader announces a slider with a percentage.
        */}
        <label htmlFor={labelId} className="sr-only">
          {caption} — drag to compare before and after
        </label>

        <input
          id={labelId}
          type="range"
          min={0}
          max={100}
          step={1}
          value={Math.round(position)}
          onChange={(event) => setPosition(Number(event.target.value))}
          aria-valuetext={`${Math.round(position)}% of the finished job showing`}
          className={cn(
            "absolute inset-0 z-20 h-full w-full cursor-ew-resize appearance-none bg-transparent",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
            // The native thumb is replaced by the styled handle above.
            "[&::-webkit-slider-thumb]:h-11 [&::-webkit-slider-thumb]:w-11",
            "[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:opacity-0",
            "[&::-moz-range-thumb]:h-11 [&::-moz-range-thumb]:w-11",
            "[&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:opacity-0",
          )}
        />
      </div>

      <figcaption className="mt-3.5 flex items-baseline gap-2">
        <span className="font-medium text-ink">{caption}</span>
        <span className="text-sm text-ink-subtle">drag to compare</span>
      </figcaption>
    </figure>
  );
}

/** A corner label that gets out of the way once the wipe reaches it. */
function Corner({
  side,
  label,
  hidden,
}: {
  side: "left" | "right";
  label: string;
  hidden: boolean;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "absolute top-3 z-10 rounded-xs px-2 py-1 text-xs font-semibold",
        "bg-surface-inverse/75 text-ink-inverse backdrop-blur-sm",
        "transition-opacity duration-200 [transition-timing-function:var(--ease-standard)]",
        side === "left" ? "left-3" : "right-3",
        hidden ? "opacity-0" : "opacity-100",
      )}
    >
      {label}
    </span>
  );
}
