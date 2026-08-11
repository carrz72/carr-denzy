"use client";

import Image from "next/image";
import { useRef, useState, useTransition } from "react";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CheckIcon,
  EyeIcon,
  EyeSlashIcon,
  ImageSquareIcon,
  PlusIcon,
  TrashIcon,
  UploadSimpleIcon,
} from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/surface";
import { FormError, TextField } from "@/components/ui/field";
import { EmptyState, Skeleton } from "@/components/ui/states";
import { createClient } from "@/lib/supabase/client";
import { preparePhoto, storageKey } from "@/lib/photos";
import { portfolioImageUrl } from "@/lib/portfolio";
import { cn } from "@/lib/cn";
import {
  createPortfolioItem,
  deletePortfolioItem,
  movePortfolioItem,
  setPortfolioPublished,
  updatePortfolioItem,
} from "@/app/(app)/app/portfolio/actions";
import type { PortfolioItem } from "@/types/database";

/**
 * The "Our work" gallery, as the owner manages it.
 *
 * Uploads go straight from the browser to Supabase storage, exactly as the
 * public enquiry form does — the file never passes through a server action, so
 * a 4 MB photograph is not being base64'd through a form post. `preparePhoto`
 * downscales to a 1600px edge first, which is the difference between a 12 MB
 * upload and a 300 KB one from a phone on 4G.
 *
 * A row is one JOB. Adding a "before" to a row is what turns it into a
 * before-and-after on the website, and that is stated in the UI rather than
 * left to be discovered.
 */

type Draft = {
  afterPath: string;
  beforePath: string;
  caption: string;
  location: string;
};

const EMPTY: Draft = { afterPath: "", beforePath: "", caption: "", location: "" };

export function PortfolioManager({ items }: { items: PortfolioItem[] }) {
  const [adding, setAdding] = useState(false);

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-label uppercase text-ink-subtle">Add a job</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">
              One entry is one job. Add a &ldquo;before&rdquo; photo and the website shows
              the two together with a slider, instead of as two separate pictures.
            </p>
          </div>

          {!adding ? (
            <Button
              variant="secondary"
              onClick={() => setAdding(true)}
              icon={<PlusIcon size={18} weight="bold" />}
            >
              Add a job
            </Button>
          ) : null}
        </div>

        {adding ? (
          <div className="mt-5 border-t border-line pt-5">
            <ItemForm onDone={() => setAdding(false)} onCancel={() => setAdding(false)} />
          </div>
        ) : null}
      </Card>

      {items.length === 0 ? (
        <EmptyState
          icon={<ImageSquareIcon size={28} weight="duotone" />}
          title="Nothing in the gallery yet"
          description="Photographs of finished work are the single most persuasive thing on the website. Add the first one and it appears on the home page and on Our work."
        />
      ) : (
        <ul className="flex flex-col gap-4">
          {items.map((item, index) => (
            <ItemRow
              key={item.id}
              item={item}
              isFirst={index === 0}
              isLast={index === items.length - 1}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// One saved row
// ---------------------------------------------------------------------------

function ItemRow({
  item,
  isFirst,
  isLast,
}: {
  item: PortfolioItem;
  isFirst: boolean;
  isLast: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function run(action: (data: FormData) => Promise<{ ok: boolean; formError?: string }>, data: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await action(data);
      if (!result.ok) setError(result.formError ?? "That did not work. Try again.");
    });
  }

  function move(direction: "up" | "down") {
    const data = new FormData();
    data.set("id", item.id);
    data.set("direction", direction);
    run(movePortfolioItem, data);
  }

  function togglePublished() {
    const data = new FormData();
    data.set("id", item.id);
    data.set("is_published", String(!item.is_published));
    run(setPortfolioPublished, data);
  }

  function remove() {
    const data = new FormData();
    data.set("id", item.id);
    run(deletePortfolioItem, data);
  }

  return (
    <li>
      <Card className={cn(!item.is_published && "border-dashed")}>
        <div className="flex flex-col gap-4 sm:flex-row">
          <div className="flex shrink-0 gap-2">
            <Thumb src={item.after_path} label={item.before_path ? "After" : undefined} />
            {item.before_path ? <Thumb src={item.before_path} label="Before" /> : null}
          </div>

          <div className="min-w-0 flex-1">
            <p className="font-medium text-ink">{item.caption}</p>

            <p className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm text-ink-subtle">
              {item.location ? <span>{item.location}</span> : null}
              {item.before_path ? (
                <span className="font-medium text-accent">Before &amp; after</span>
              ) : null}
              {!item.is_published ? <span>Hidden from the website</span> : null}
            </p>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setEditing((value) => !value)}
                disabled={isPending}
              >
                {editing ? "Close" : "Edit"}
              </Button>

              <Button
                size="sm"
                variant="quiet"
                onClick={togglePublished}
                disabled={isPending}
                icon={
                  item.is_published ? <EyeSlashIcon size={16} /> : <EyeIcon size={16} />
                }
              >
                {item.is_published ? "Hide" : "Show"}
              </Button>

              <div className="ml-auto flex items-center gap-1">
                <IconButton
                  label="Move earlier"
                  disabled={isFirst || isPending}
                  onClick={() => move("up")}
                >
                  <ArrowUpIcon size={17} />
                </IconButton>
                <IconButton
                  label="Move later"
                  disabled={isLast || isPending}
                  onClick={() => move("down")}
                >
                  <ArrowDownIcon size={17} />
                </IconButton>
                <IconButton
                  label="Remove this job"
                  tone="critical"
                  disabled={isPending}
                  onClick={() => setConfirmingDelete(true)}
                >
                  <TrashIcon size={17} />
                </IconButton>
              </div>
            </div>

            {/* Inline confirm rather than a dialog: on a phone a modal covers
                the very photo the owner is deciding about. */}
            {confirmingDelete ? (
              <div className="mt-4 rounded-lg border border-critical/30 bg-critical-soft p-4">
                <p className="text-[0.9375rem] font-medium text-critical">
                  Remove this from the website? The photo is deleted too.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" variant="destructive" loading={isPending} onClick={remove}>
                    Yes, remove it
                  </Button>
                  <Button size="sm" variant="quiet" onClick={() => setConfirmingDelete(false)}>
                    Keep it
                  </Button>
                </div>
              </div>
            ) : null}

            {error ? (
              <div className="mt-4">
                <FormError message={error} />
              </div>
            ) : null}

            {editing ? (
              <div className="mt-5 border-t border-line pt-5">
                <ItemForm item={item} onDone={() => setEditing(false)} onCancel={() => setEditing(false)} />
              </div>
            ) : null}
          </div>
        </div>
      </Card>
    </li>
  );
}

function Thumb({ src, label }: { src: string; label?: string }) {
  return (
    <div className="relative size-24 overflow-hidden rounded-md border border-line bg-surface-sunken">
      <Image
        src={portfolioImageUrl(src)}
        alt=""
        fill
        sizes="96px"
        className="object-cover"
      />
      {label ? (
        <span className="absolute inset-x-0 bottom-0 bg-surface-inverse/75 px-1.5 py-0.5 text-center text-[0.625rem] font-semibold text-ink-inverse">
          {label}
        </span>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Add / edit form
// ---------------------------------------------------------------------------

function ItemForm({
  item,
  onDone,
  onCancel,
}: {
  item?: PortfolioItem;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [draft, setDraft] = useState<Draft>(
    item
      ? {
          afterPath: item.after_path,
          beforePath: item.before_path ?? "",
          caption: item.caption,
          location: item.location ?? "",
        }
      : EMPTY,
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  function handleSubmit() {
    setErrors({});
    setFormError(null);

    const data = new FormData();
    if (item) data.set("id", item.id);
    data.set("after_path", draft.afterPath);
    data.set("before_path", draft.beforePath);
    data.set("caption", draft.caption);
    data.set("location", draft.location);

    startTransition(async () => {
      const result = item
        ? await updatePortfolioItem(data)
        : await createPortfolioItem(data);

      if (!result.ok) {
        setErrors(result.errors ?? {});
        setFormError(result.formError ?? null);
        return;
      }

      onDone();
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <PhotoField
          label="The finished job"
          hint="This is the one that shows on the website."
          value={draft.afterPath}
          onChange={(afterPath) => setDraft((d) => ({ ...d, afterPath }))}
          error={errors.after_path}
        />

        <PhotoField
          label="Before (optional)"
          hint="Add this and the two are shown together with a slider."
          value={draft.beforePath}
          onChange={(beforePath) => setDraft((d) => ({ ...d, beforePath }))}
          error={errors.before_path}
        />
      </div>

      <TextField
        name={`caption-${item?.id ?? "new"}`}
        label="What was the job"
        required
        placeholder="Garage conversion with porcelain paving"
        value={draft.caption}
        onChange={(event) => setDraft((d) => ({ ...d, caption: event.target.value }))}
        error={errors.caption}
      />

      <TextField
        name={`location-${item?.id ?? "new"}`}
        label="Where"
        hint="Leave blank if you would rather not say. Only fill this in if it is accurate."
        placeholder="West Bridgford"
        value={draft.location}
        onChange={(event) => setDraft((d) => ({ ...d, location: event.target.value }))}
        error={errors.location}
      />

      <FormError message={formError} />

      <div className="flex flex-wrap gap-2">
        <Button
          loading={isPending}
          disabled={!draft.afterPath || draft.caption.trim().length < 3}
          onClick={handleSubmit}
          icon={<CheckIcon size={18} weight="bold" />}
        >
          {item ? "Save changes" : "Add to the gallery"}
        </Button>

        <Button variant="quiet" onClick={onCancel} disabled={isPending}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

/**
 * One photo slot: pick, downscale, upload, preview.
 *
 * The upload happens as soon as a file is chosen rather than on submit, so the
 * owner sees the picture they picked and knows it has landed before they start
 * typing a caption.
 */
function PhotoField({
  label,
  hint,
  value,
  onChange,
  error,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (path: string) => void;
  error?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  async function handleFile(file: File | undefined) {
    if (!file) return;

    setUploadError(null);

    const prepared = await preparePhoto(file);
    if (!prepared.ok) {
      setUploadError(prepared.error);
      return;
    }

    setUploading(true);

    try {
      const supabase = createClient();
      const key = storageKey("portfolio", prepared.photo.file.name);

      const { error: uploadFailed } = await supabase.storage
        .from("portfolio")
        .upload(key, prepared.photo.file, {
          contentType: prepared.photo.file.type,
          upsert: false,
        });

      if (uploadFailed) {
        console.error("[portfolio] upload failed", uploadFailed.message);
        setUploadError("That photo did not upload. Check your signal and try again.");
        return;
      }

      onChange(key);
    } finally {
      setUploading(false);
      URL.revokeObjectURL(prepared.photo.previewUrl);
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span className="font-medium text-ink">{label}</span>
      <p className="text-sm text-ink-muted">{hint}</p>

      <div className="mt-1 flex items-start gap-3">
        <div className="relative size-28 shrink-0 overflow-hidden rounded-md border border-line bg-surface-sunken">
          {uploading ? (
            // A skeleton in the shape of the thumbnail, not a spinner: it shows
            // where the photo is going to land.
            <Skeleton className="size-full rounded-none" />
          ) : value ? (
            <Image
              src={portfolioImageUrl(value)}
              alt=""
              fill
              sizes="112px"
              className="object-cover"
            />
          ) : (
            <span className="flex size-full items-center justify-center text-ink-subtle">
              <ImageSquareIcon size={26} weight="duotone" aria-hidden="true" />
            </span>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <Button
            size="sm"
            variant="secondary"
            loading={uploading}
            loadingLabel="Uploading…"
            onClick={() => inputRef.current?.click()}
            icon={<UploadSimpleIcon size={16} />}
          >
            {value ? "Replace" : "Choose a photo"}
          </Button>

          {value ? (
            <Button size="sm" variant="quiet" onClick={() => onChange("")} disabled={uploading}>
              Remove
            </Button>
          ) : null}
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
        className="sr-only"
        onChange={(event) => {
          void handleFile(event.target.files?.[0]);
          // Reset so choosing the same file twice still fires a change.
          event.target.value = "";
        }}
      />

      {uploadError || error ? (
        <p role="alert" className="text-sm font-medium text-critical">
          {uploadError ?? error}
        </p>
      ) : null}
    </div>
  );
}

function IconButton({
  label,
  tone = "neutral",
  disabled,
  onClick,
  children,
}: {
  label: string;
  tone?: "neutral" | "critical";
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      className={cn(
        "flex size-11 items-center justify-center rounded-md",
        "transition-colors duration-200 [transition-timing-function:var(--ease-standard)]",
        "active:translate-y-px disabled:pointer-events-none disabled:opacity-30",
        tone === "critical"
          ? "text-ink-subtle hover:bg-critical-soft hover:text-critical"
          : "text-ink-subtle hover:bg-surface-sunken hover:text-ink",
      )}
    >
      <span aria-hidden="true">{children}</span>
      <span className="sr-only">{label}</span>
    </button>
  );
}
