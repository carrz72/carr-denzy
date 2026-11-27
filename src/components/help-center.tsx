"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CaretDownIcon, MagnifyingGlassIcon, PlayIcon } from "@phosphor-icons/react/dist/ssr";
import { HELP_ARTICLES, HELP_TOPICS, searchArticles, type HelpArticle } from "@/lib/help";
import { startTour } from "@/components/help-tour";
import { cn } from "@/lib/cn";

/**
 * Help: "How do I…?" questions, searchable, each with the steps written out
 * and a "Show me how" that walks through it on the real screens.
 */
export function HelpCenter() {
  const [query, setQuery] = useState("");
  const results = useMemo(() => searchArticles(query), [query]);
  const searching = query.trim() !== "";

  return (
    <div className="flex flex-col gap-8">
      <label className="relative block">
        <span className="sr-only">Search help</span>
        <MagnifyingGlassIcon
          size={20}
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-ink-subtle"
        />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Try 'invoice', 'materials' or 'holiday'"
          className="min-h-13 w-full rounded-xl border border-line-strong bg-surface-raised pr-4 pl-12 text-base text-ink shadow-subtle placeholder:text-ink-subtle focus:border-accent focus:outline-none"
        />
      </label>

      {searching ? (
        results.length === 0 ? (
          <p className="text-ink-muted">
            Nothing matches &ldquo;{query}&rdquo;. Try a different word. Still stuck? Ask, and the answer will be added here.
          </p>
        ) : (
          <ArticleList articles={results} />
        )
      ) : (
        HELP_TOPICS.map((topic) => {
          const articles = HELP_ARTICLES.filter((article) => article.topic === topic);
          if (articles.length === 0) return null;
          return (
            <section key={topic} aria-labelledby={`help-${topic}`}>
              <h2 id={`help-${topic}`} className="mb-3 text-label uppercase text-ink-subtle">
                {topic}
              </h2>
              <ArticleList articles={articles} />
            </section>
          );
        })
      )}
    </div>
  );
}

function ArticleList({ articles }: { articles: HelpArticle[] }) {
  return (
    <ul className="flex flex-col gap-2">
      {articles.map((article) => (
        <li key={article.id}>
          <Article article={article} />
        </li>
      ))}
    </ul>
  );
}

function Article({ article }: { article: HelpArticle }) {
  const router = useRouter();
  const canShow = article.steps.some((step) => step.target);

  function showMe() {
    startTour(article.id);
    // Go straight to the first screen that has a fixed place; steps that use
    // the menu start from here and highlight it.
    const first = article.steps[0];
    if (first?.path) router.push(first.path);
  }

  return (
    <details className="group rounded-xl border border-line bg-surface-raised shadow-subtle open:border-line-strong">
      <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 flex-1">
          <span className="block font-semibold text-ink">{article.question}</span>
          <span className="mt-0.5 block text-sm text-ink-muted">{article.summary}</span>
        </span>
        <CaretDownIcon
          size={18}
          weight="bold"
          aria-hidden="true"
          className="shrink-0 text-ink-subtle transition-transform duration-200 group-open:rotate-180"
        />
      </summary>

      <div className="border-t border-line px-4 pt-3 pb-4">
        <ol className="flex flex-col gap-2.5">
          {article.steps.map((step, index) => (
            <li key={index} className="flex gap-3">
              <span
                aria-hidden="true"
                className="flex size-6 shrink-0 items-center justify-center rounded-full bg-surface-sunken text-xs font-bold text-ink"
              >
                {index + 1}
              </span>
              <span className="pt-0.5 text-[0.9375rem] leading-relaxed text-ink">{step.text}</span>
            </li>
          ))}
        </ol>

        {canShow ? (
          <button
            type="button"
            onClick={showMe}
            className={cn(
              "mt-4 inline-flex min-h-11 items-center gap-2 rounded-full bg-accent px-5 text-sm font-bold text-white",
              "transition-transform duration-150 active:scale-[0.97]",
            )}
          >
            <PlayIcon size={16} weight="fill" aria-hidden="true" />
            Show me how
          </button>
        ) : null}
      </div>
    </details>
  );
}
