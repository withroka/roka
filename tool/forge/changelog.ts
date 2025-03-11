/**
 * This module provides the {@linkcode commits} function to generate a
 * changelog for a package using
 * {@link https://www.conventionalcommits.org | Conventional Commits}.
 *
 * ```ts
 * import { changelog } from "@roka/forge/changelog";
 * import { packageInfo } from "@roka/forge/package";
 * async function usage() {
 *   const pkg = await packageInfo();
 *   console.log(changelog(pkg.changes ?? []));
 * }
 * ```
 *
 * @module changelog
 */

import type { Commit } from "@roka/git";
import { conventional, type ConventionalCommit } from "@roka/git/conventional";

/** Options for the {@linkcode changelog} function. */
export interface ChangelogOptions {
  /**
   * Title to display at the beginning of the changelog text.
   *
   * If not defined, a title will not be added to the changelog.
   */
  title?: string;
  /** Add a list of items to the end of the changelog text, like URLs. */
  footer?: {
    /** Title of the footer section */
    title: string;
    /** List of items to include in the footer. */
    items: string[];
  };
  /** Markdown options to control the output. */
  markdown?: {
    /**
     * Markdown heading to use for the version title.
     * @default {"## "}
     */
    heading?: string;
    /**
     * Markdown subheading to use for the footer.
     * @default {"### "}
     */
    subheading?: string;
    /**
     * Markdown bullet to use for lists.
     * @default {"- "}
     */
    bullet?: string;
  };
  /** Use emoji in commit summaries. */
  emoji?: boolean;
}

/**
 * Generate Markdown text for a package changelog.
 *
 * @example Generate a Markdown changelog.
 * ```ts
 * import { changelog } from "@roka/forge/changelog";
 * import { packageInfo } from "@roka/forge/package";
 * import { assertExists } from "@std/assert";
 *
 * async function usage() {
 *   const pkg = await packageInfo();
 *   assertExists(pkg.changes);
 *   console.log(changelog(pkg.changes, {
 *     title: "Changelog",
 *     markdown: { heading: "# ", bullet: "* " },
 *   }));
 * }
 * ```
 *
 * @param commits Commits that are used to generate the changelog.
 * @param options Options for generating the changelog.
 * @returns Markdown text.
 */
export function changelog(
  commits: Commit[],
  options?: ChangelogOptions,
): string {
  const title = options?.title;
  const markdown = {
    heading: "## ",
    subheading: "### ",
    bullet: "- ",
    ...options?.markdown,
  };
  const footer = options?.footer
    ? [
      `${markdown.subheading}${options.footer.title}`,
      options.footer.items.map((x) => `${markdown.bullet}${x}`).join("\n"),
    ]
    : [];
  const commit: (c: ConventionalCommit) => string = options?.emoji
    ? emoji
    : (c) => c.summary;
  const blocks = [
    ...title ? [`${markdown.heading}${title}`] : [],
    commits
      .map(conventional)
      .map((c) => `${markdown.bullet}${commit(c)}`)
      .join("\n") ?? [],
    footer,
  ].flat();
  return `${blocks.join("\n\n")}\n`;
}

function emoji(commit: ConventionalCommit): string {
  const emojis: Record<string, string> = {
    build: "🔧",
    chore: "🧹",
    ci: "👷",
    docs: "📝",
    feat: "✨",
    fix: "🐛",
    perf: "⚡️",
    refactor: "♻️",
    revert: "⏪",
    style: "🎨",
    test: "🧪",
    unknown: "🔖",
  };
  return [
    emojis[commit.type ?? "unknown"] ?? emojis["unknown"],
    commit.description,
    ...commit.breaking ? ["💥"] : [],
  ].join(" ");
}
