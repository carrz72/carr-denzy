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
  ImagesIcon,
  PencilSimpleIcon,
  PlusIcon,
  XIcon,
  TrashIcon,
  UploadSimpleIcon,
} from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/surface";
import { FormError, SelectField, TextField } from "@/components/ui/field";
import { EmptyState, Skeleton } from "@/components/ui/states";
import { createClient } from "@/lib/supabase/client";
import { preparePhoto, storageKey } from "@/lib/photos";
import { portfolioImageUrl } from "@/lib/portfolio";
import { cn } from "@/lib/cn";
import {
  createPortfolioCategory,
  createPortfolioItem,
  createPortfolioItems,
  deletePortfolioCategory,
  deletePortfolioItem,
  movePortfolioCategory,
  renamePortfolioCategory,
  movePortfolioItem,
  setPortfolioPublished,
  updatePortfolioItem,
} from "@/app/(app)/app/portfolio/actions";
import type { PortfolioCategory, PortfolioItem } from "@/types/database";

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
  categoryId: string;
};

const EMPTY: Draft = { afterPath: "", beforePath: "", caption: "", location: "", categoryId: "" };

/** "all", "none" (no category), or a category id. */
type Filter = string;

export function PortfolioManager({
  items,
  categories,
}: {
  items: PortfolioItem[];
  categories: PortfolioCategory[];
}) {
  const [adding, setAdding] = useState<null | "job" | "several">(null);
  const [filter, setFilter] = useState<Filter>("all");

  const known = new Set(categories.map((category) => category.id));
  const groupOf = (item: PortfolioItem) =>
    item.category_id && known.has(item.category_id) ? item.category_id : "none";

  // The filter may point at a category that has just been deleted.
  const activeFilter = filter === "all" || filter === "none" || known.has(filter) ? filter : "all";
  const visible = activeFilter === "all" ? items : items.filter((item) => groupOf(item) === activeFilter);
  const uncategorised = items.filter((item) => groupOf(item) === "none").length;

  // Up/down moves a photo within its own category, so the ends are per group.
  const groups = new Map<string, string[]>();
  for (const item of items) {
    const key = groupOf(item);
    groups.set(key, [...(groups.get(key) ?? []), item.id]);
  }

  // New photos land in whichever category is being looked at.
  const defaultCategory = activeFilter !== "all" && activeFilter !== "none" ? activeFilter : "";

  return (
    <div className="flex flex-col gap-6">
      <CategoryManager categories={categories} items={items} />

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-label uppercase text-ink-subtle">Add photos</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">
              Add several photos to a category in one go, or add a single job. Add a
              &ldquo;before&rdquo; photo to a job and the website shows the two together
              with a slider.
            </p>
          </div>

          {adding === null ? (
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                onClick={() => setAdding("several")}
                icon={<ImagesIcon size={18} />}
              >
                Add several photos
              </Button>
              <Button
                data-help="add-work"
                variant="quiet"
                onClick={() => setAdding("job")}
                icon={<PlusIcon size={18} weight="bold" />}
              >
                Add a job
              </Button>
            </div>
          ) : null}
        </div>

        {adding === "job" ? (
          <div className="mt-5 border-t border-line pt-5">
            <ItemForm
              categories={categories}
              defaultCategory={defaultCategory}
              onDone={() => setAdding(null)}
              onCancel={() => setAdding(null)}
            />
          </div>
        ) : null}

        {adding === "several" ? (
          <div className="mt-5 border-t border-line pt-5">
            <SeveralForm
              categories={categories}
              defaultCategory={defaultCategory}
              onDone={() => setAdding(null)}
              onCancel={() => setAdding(null)}
            />
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
        <>
          {categories.length > 0 ? (
            <div className="flex flex-wrap gap-2" role="group" aria-label="Show photos in">
              <FilterChip active={activeFilter === "all"} onClick={() => setFilter("all")}>
                All ({items.length})
              </FilterChip>
              {categories.map((category) => (
                <FilterChip
                  key={category.id}
                  active={activeFilter === category.id}
                  onClick={() => setFilter(category.id)}
                >
                  {category.name} ({groups.get(category.id)?.length ?? 0})
                </FilterChip>
              ))}
              {uncategorised > 0 ? (
                <FilterChip active={activeFilter === "none"} onClick={() => setFilter("none")}>
                  No category ({uncategorised})
                </FilterChip>
              ) : null}
            </div>
          ) : null}

          {visible.length === 0 ? (
            <EmptyState
              icon={<ImageSquareIcon size={28} weight="duotone" />}
              title="No photos in this category yet"
              description="Use Add several photos above and they go straight into it."
            />
          ) : (
            <ul className="flex flex-col gap-4">
              {visible.map((item) => {
                const group = groups.get(groupOf(item)) ?? [];
                return (
                  <ItemRow
                    key={item.id}
                    item={item}
                    categories={categories}
                    isFirst={group[0] === item.id}
                    isLast={group[group.length - 1] === item.id}
                  />
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "min-h-11 rounded-full border px-4 text-sm font-medium transition-colors duration-200",
        active
          ? "border-ink bg-ink text-ink-inverse"
          : "border-line bg-surface-raised text-ink-muted hover:border-ink-subtle hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

function CategoryManager({
  categories,
  items,
}: {
  categories: PortfolioCategory[];
  items: PortfolioItem[];
}) {
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  function add() {
    setError(null);
    const data = new FormData();
    data.set("name", name);
    startTransition(async () => {
      const result = await createPortfolioCategory(data);
      if (!result.ok) {
        setError(result.errors?.name ?? result.formError ?? "That did not work. Try again.");
        return;
      }
      setName("");
    });
  }

  return (
    <Card>
      <h2 className="text-label uppercase text-ink-subtle">Categories</h2>
      <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">
        The headings photos are grouped under on the website, for example Bathrooms,
        Boilers or Building work. The order here is the order customers see.
      </p>

      {categories.length > 0 ? (
        <ul className="mt-4 flex flex-col divide-y divide-line border-y border-line">
          {categories.map((category, index) => (
            <CategoryRow
              key={category.id}
              category={category}
              count={items.filter((item) => item.category_id === category.id).length}
              isFirst={index === 0}
              isLast={index === categories.length - 1}
            />
          ))}
        </ul>
      ) : null}

      <form
        className="mt-4 flex flex-wrap items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          add();
        }}
      >
        <TextField
          name="new-category"
          label="New category"
          optionalLabel={false}
          placeholder="Bathrooms"
          value={name}
          maxLength={40}
          onChange={(event) => setName(event.target.value)}
          containerClassName="min-w-0 flex-1"
        />
        <Button
          type="submit"
          variant="secondary"
          loading={isPending}
          disabled={name.trim().length < 2}
          icon={<PlusIcon size={18} weight="bold" />}
        >
          Add category
        </Button>
      </form>

      {error ? (
        <div className="mt-3">
          <FormError message={error} />
        </div>
      ) : null}
    </Card>
  );
}

function CategoryRow({
  category,
  count,
  isFirst,
  isLast,
}: {
  category: PortfolioCategory;
  count: number;
  isFirst: boolean;
  isLast: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [mode, setMode] = useState<"view" | "rename" | "delete">("view");
  const [name, setName] = useState(category.name);
  const [error, setError] = useState<string | null>(null);

  function run(
    action: (data: FormData) => Promise<{ ok: boolean; formError?: string; errors?: Record<string, string> }>,
    data: FormData,
    after?: () => void,
  ) {
    setError(null);
    startTransition(async () => {
      const result = await action(data);
      if (!result.ok) {
        setError(result.errors?.name ?? result.formError ?? "That did not work. Try again.");
        return;
      }
      after?.();
    });
  }

  const withId = (extra: Record<string, string> = {}) => {
    const data = new FormData();
    data.set("id", category.id);
    for (const [key, value] of Object.entries(extra)) data.set(key, value);
    return data;
  };

  return (
    <li className="py-2">
      {mode === "rename" ? (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            run(renamePortfolioCategory, withId({ name }), () => setMode("view"));
          }}
        >
          <TextField
            name={`category-${category.id}`}
            label="Category name"
            optionalLabel={false}
            value={name}
            maxLength={40}
            onChange={(event) => setName(event.target.value)}
            containerClassName="min-w-0 flex-1"
            autoFocus
          />
          <Button type="submit" size="sm" loading={isPending} disabled={name.trim().length < 2}>
            Save
          </Button>
          <Button
            size="sm"
            variant="quiet"
            onClick={() => {
              setName(category.name);
              setMode("view");
            }}
          >
            Cancel
          </Button>
        </form>
      ) : (
        <div className="flex items-center gap-2">
          <p className="min-w-0 flex-1 truncate">
            <span className="font-medium text-ink">{category.name}</span>{" "}
            <span className="text-sm text-ink-subtle">
              {count} {count === 1 ? "photo" : "photos"}
            </span>
          </p>
          <IconButton label="Rename" disabled={isPending} onClick={() => setMode("rename")}>
            <PencilSimpleIcon size={17} />
          </IconButton>
          <IconButton
            label="Move earlier"
            disabled={isFirst || isPending}
            onClick={() => run(movePortfolioCategory, withId({ direction: "up" }))}
          >
            <ArrowUpIcon size={17} />
          </IconButton>
          <IconButton
            label="Move later"
            disabled={isLast || isPending}
            onClick={() => run(movePortfolioCategory, withId({ direction: "down" }))}
          >
            <ArrowDownIcon size={17} />
          </IconButton>
          <IconButton
            label="Remove category"
            tone="critical"
            disabled={isPending}
            onClick={() => setMode("delete")}
          >
            <TrashIcon size={17} />
          </IconButton>
        </div>
      )}

      {mode === "delete" ? (
        <div className="mt-2 rounded-lg border border-critical/30 bg-critical-soft p-4">
          <p className="text-[0.9375rem] font-medium text-critical">
            Remove the &ldquo;{category.name}&rdquo; category?
          </p>
          <p className="mt-1 text-sm text-ink-muted">
            {count > 0
              ? `Its ${count} ${count === 1 ? "photo stays" : "photos stay"} on the website under Other work.`
              : "It has no photos in it."}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="destructive"
              loading={isPending}
              onClick={() => run(deletePortfolioCategory, withId())}
            >
              Yes, remove it
            </Button>
            <Button size="sm" variant="quiet" onClick={() => setMode("view")}>
              Keep it
            </Button>
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="mt-2">
          <FormError message={error} />
        </div>
      ) : null}
    </li>
  );
}

function CategorySelect({
  categories,
  value,
  onChange,
  name,
}: {
  categories: PortfolioCategory[];
  value: string;
  onChange: (value: string) => void;
  name: string;
}) {
  return (
    <SelectField
      name={name}
      label="Category"
      hint={categories.length === 0 ? "Add categories at the top of this page." : undefined}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      <option value="">No category (shows under Other work)</option>
      {categories.map((category) => (
        <option key={category.id} value={category.id}>
          {category.name}
        </option>
      ))}
    </SelectField>
  );
}

// ---------------------------------------------------------------------------
// One saved row
// ---------------------------------------------------------------------------

function ItemRow({
  item,
  categories,
  isFirst,
  isLast,
}: {
  item: PortfolioItem;
  categories: PortfolioCategory[];
  isFirst: boolean;
  isLast: boolean;
}) {
  const categoryName = categories.find((category) => category.id === item.category_id)?.name;
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
              <span className="rounded-full bg-surface-sunken px-2 py-0.5 text-xs font-medium text-ink-muted">
                {categoryName ?? "No category"}
              </span>
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
                <ItemForm
                  item={item}
                  categories={categories}
                  onDone={() => setEditing(false)}
                  onCancel={() => setEditing(false)}
                />
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
  categories,
  defaultCategory = "",
  onDone,
  onCancel,
}: {
  item?: PortfolioItem;
  categories: PortfolioCategory[];
  defaultCategory?: string;
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
          categoryId: item.category_id ?? "",
        }
      : { ...EMPTY, categoryId: defaultCategory },
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
    data.set("category_id", draft.categoryId);

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

      <CategorySelect
        name={`category-${item?.id ?? "new"}`}
        categories={categories}
        value={draft.categoryId}
        onChange={(categoryId) => setDraft((d) => ({ ...d, categoryId }))}
      />

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

/** Downscale and upload one photo; returns its storage key or an error. */
async function uploadPortfolioPhoto(
  file: File,
): Promise<{ ok: true; key: string } | { ok: false; error: string }> {
  const prepared = await preparePhoto(file);
  if (!prepared.ok) return { ok: false, error: prepared.error };

  try {
    const supabase = createClient();
    const key = storageKey("portfolio", prepared.photo.file.name);

    const { error } = await supabase.storage.from("portfolio").upload(key, prepared.photo.file, {
      contentType: prepared.photo.file.type,
      upsert: false,
    });

    if (error) {
      console.error("[portfolio] upload failed", error.message);
      return { ok: false, error: `${file.name} did not upload. Check your signal and try again.` };
    }

    return { ok: true, key };
  } finally {
    URL.revokeObjectURL(prepared.photo.previewUrl);
  }
}

const MAX_BATCH = 30;

/**
 * Several photos into one category at once. Each photo becomes its own entry
 * with the shared caption, so any one of them can be hidden or re-captioned
 * later without touching the rest.
 */
function SeveralForm({
  categories,
  defaultCategory,
  onDone,
  onCancel,
}: {
  categories: PortfolioCategory[];
  defaultCategory: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isPending, startTransition] = useTransition();
  const [paths, setPaths] = useState<string[]>([]);
  const [uploading, setUploading] = useState<{ done: number; total: number } | null>(null);
  const [uploadErrors, setUploadErrors] = useState<string[]>([]);
  const [categoryId, setCategoryId] = useState(defaultCategory);
  const [caption, setCaption] = useState("");
  const [location, setLocation] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  async function handleFiles(list: FileList | null) {
    if (!list || list.length === 0) return;

    const room = MAX_BATCH - paths.length;
    const files = Array.from(list).slice(0, Math.max(0, room));
    const problems: string[] = [];
    if (list.length > room) problems.push(`Only ${MAX_BATCH} photos can go in at a time.`);

    setUploadErrors([]);
    setUploading({ done: 0, total: files.length });

    // One at a time: a phone on 4G uploading ten photos in parallel tends to
    // fail all ten rather than finish any.
    for (const file of files) {
      const result = await uploadPortfolioPhoto(file);
      if (result.ok) setPaths((current) => [...current, result.key]);
      else problems.push(result.error);
      setUploading((current) => (current ? { ...current, done: current.done + 1 } : current));
    }

    setUploading(null);
    setUploadErrors(problems);
  }

  function handleSubmit() {
    setErrors({});
    setFormError(null);

    const data = new FormData();
    for (const path of paths) data.append("paths", path);
    data.set("caption", caption);
    data.set("location", location);
    data.set("category_id", categoryId);

    startTransition(async () => {
      const result = await createPortfolioItems(data);
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
      <CategorySelect
        name="several-category"
        categories={categories}
        value={categoryId}
        onChange={setCategoryId}
      />

      <div className="flex flex-col gap-2">
        <span className="font-medium text-ink">Photos</span>
        <p className="text-sm text-ink-muted">
          Pick as many as you like, up to {MAX_BATCH} at a time. Each one shows as its own
          picture on the website.
        </p>

        {paths.length > 0 || uploading ? (
          <ul className="mt-1 grid grid-cols-3 gap-2 sm:grid-cols-5">
            {paths.map((path) => (
              <li
                key={path}
                className="relative aspect-square overflow-hidden rounded-md border border-line bg-surface-sunken"
              >
                <Image src={portfolioImageUrl(path)} alt="" fill sizes="120px" className="object-cover" />
                <button
                  type="button"
                  onClick={() => setPaths((current) => current.filter((p) => p !== path))}
                  className="absolute right-1 top-1 flex size-8 items-center justify-center rounded-full bg-surface-inverse/75 text-ink-inverse"
                  title="Take this one out"
                >
                  <XIcon size={14} weight="bold" aria-hidden="true" />
                  <span className="sr-only">Take this one out</span>
                </button>
              </li>
            ))}
            {uploading
              ? Array.from({ length: uploading.total - uploading.done }, (_, index) => (
                  <li key={`pending-${index}`} className="aspect-square">
                    <Skeleton className="size-full" />
                  </li>
                ))
              : null}
          </ul>
        ) : null}

        <div className="mt-1">
          <Button
            size="sm"
            variant="secondary"
            loading={uploading !== null}
            loadingLabel={
              uploading ? `Uploading ${uploading.done + 1} of ${uploading.total}…` : undefined
            }
            disabled={paths.length >= MAX_BATCH}
            onClick={() => inputRef.current?.click()}
            icon={<UploadSimpleIcon size={16} />}
          >
            {paths.length > 0 ? "Add more photos" : "Choose photos"}
          </Button>
        </div>

        <input
          ref={inputRef}
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
          className="sr-only"
          onChange={(event) => {
            void handleFiles(event.target.files);
            event.target.value = "";
          }}
        />

        {uploadErrors.length > 0 ? (
          <ul role="alert" className="flex flex-col gap-1 text-sm font-medium text-critical">
            {uploadErrors.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        ) : null}
      </div>

      <TextField
        name="several-caption"
        label="What was the job"
        required
        hint="Used as the caption on every photo in this batch. You can change any one later."
        placeholder="Bathroom refit"
        value={caption}
        onChange={(event) => setCaption(event.target.value)}
        error={errors.caption}
      />

      <TextField
        name="several-location"
        label="Where"
        hint="Leave blank if you would rather not say. Only fill this in if it is accurate."
        placeholder="West Bridgford"
        value={location}
        onChange={(event) => setLocation(event.target.value)}
        error={errors.location}
      />

      <FormError message={formError} />

      <div className="flex flex-wrap gap-2">
        <Button
          loading={isPending}
          disabled={paths.length === 0 || uploading !== null || caption.trim().length < 3}
          onClick={handleSubmit}
          icon={<CheckIcon size={18} weight="bold" />}
        >
          {paths.length > 1 ? `Add ${paths.length} photos` : "Add to the gallery"}
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
