"use client";

import { useOptimistic, useRef, useState, useTransition } from "react";
import { PaperPlaneTiltIcon } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/button";
import { postMessage } from "@/app/(portal)/portal/actions";
import { formatDateTime } from "@/lib/dates";
import { cn } from "@/lib/cn";

/**
 * The owner ↔ client message thread.
 *
 * Optimistic: the message appears the instant it is sent, marked as sending,
 * rather than after a server round trip. On a phone with two bars in someone's
 * basement, a two-second wait with no feedback reads as "it did not work" and
 * gets tapped again.
 */

export interface ThreadMessage {
  id: string;
  body: string;
  sender_id: string;
  created_at: string;
}

export function MessageThread({
  jobId,
  currentUserId,
  messages,
  emptyLabel,
}: {
  jobId: string;
  currentUserId: string;
  messages: ThreadMessage[];
  emptyLabel: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const [optimistic, addOptimistic] = useOptimistic(
    messages,
    (current, pending: ThreadMessage) => [...current, pending],
  );

  function handleSubmit(formData: FormData) {
    const body = String(formData.get("body") ?? "").trim();
    if (!body) return;

    setError(null);
    formRef.current?.reset();

    startTransition(async () => {
      addOptimistic({
        id: `pending-${Date.now()}`,
        body,
        sender_id: currentUserId,
        created_at: new Date().toISOString(),
      });

      const result = await postMessage(formData);

      if (!result.ok) {
        setError(result.formError ?? "That did not send. Try again.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-5">
      {optimistic.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line-strong bg-surface px-4 py-6 text-center text-[0.9375rem] text-ink-muted">
          {emptyLabel}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {optimistic.map((message) => {
            const isMine = message.sender_id === currentUserId;
            const isPendingMessage = message.id.startsWith("pending-");

            return (
              <li
                key={message.id}
                className={cn("flex flex-col gap-1", isMine ? "items-end" : "items-start")}
              >
                <div
                  className={cn(
                    "max-w-[85%] rounded-lg px-4 py-3",
                    isMine
                      ? "rounded-br-xs bg-accent text-white"
                      : "rounded-bl-xs bg-surface-sunken text-ink",
                    isPendingMessage && "opacity-60",
                  )}
                >
                  <p className="whitespace-pre-wrap text-[0.9375rem] leading-relaxed">
                    {message.body}
                  </p>
                </div>

                <p className="px-1 text-xs text-ink-subtle">
                  {isPendingMessage ? "Sending…" : formatDateTime(message.created_at)}
                </p>
              </li>
            );
          })}
        </ul>
      )}

      <form ref={formRef} action={handleSubmit} className="flex flex-col gap-3">
        <input type="hidden" name="job_id" value={jobId} />

        <label htmlFor={`message-${jobId}`} className="sr-only">
          Write a message
        </label>

        <textarea
          id={`message-${jobId}`}
          name="body"
          rows={3}
          required
          maxLength={5000}
          placeholder="Anything we should know?"
          className={cn(
            "w-full resize-y rounded-md border border-line bg-surface-raised px-3.5 py-3",
            "shadow-subtle transition-[border-color] duration-200",
            "placeholder:text-ink-subtle",
            "hover:border-line-strong focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25",
          )}
        />

        {error ? (
          <p role="alert" className="text-sm font-medium text-critical">
            {error}
          </p>
        ) : null}

        <Button
          type="submit"
          variant="secondary"
          className="self-end"
          loading={isPending}
          loadingLabel="Sending…"
          icon={<PaperPlaneTiltIcon size={17} weight="fill" />}
        >
          Send
        </Button>
      </form>
    </div>
  );
}
