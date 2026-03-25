/**
 * This module provides the {@linkcode changelog} function to generate a
 * changelog for a package using
 * {@link https://www.conventionalcommits.org Conventional Commits}.
 *
 * ```ts
 * import { changelog } from "@roka/forge/changelog";
 * import { packageInfo } from "@roka/forge/workspace";
 * (async () => {
 *   const pkg = await packageInfo();
 *   const log = changelog(pkg.changes ?? []);
 *   return { log };
 * });
 * ```
 *
 * @module changelog
 * @internal
 */

import type { Commit } from "@roka/git";
import { conventional, type ConventionalCommit } from "@roka/git/conventional";
import { assertExists } from "@std/assert";
import { unicodeWidth } from "@std/cli";

/** Options for the {@linkcode changelog} function. */
export interface ChangelogOptions {
  /** Options for controlling what is included in the changelog. */
  content?: {
    /**
     * Title to display at the beginning of the changelog text.
     *
     * If not defined, a title will not be added to the changelog.
     */
    title?: string;
    /** Adds a list of items to the end of the changelog text, like URLs. */
    footer?: {
      /** Title of the footer section */
      title: string;
      /** List of items to include in the footer. */
      items: string[];
    };
  };
  /** Options for controlling how commits are formatted in the changelog. */
  commit?: {
    /**
     * Sorts commits in the generated changelog.
     *
     * If set to `importance`, the commits are sorted by their
     * {@link https://www.conventionalcommits.org Conventional Commits} details.
     * Breaking changes are followed by features, and then fixes. Commits of
     * other types come last and they are grouped by their type.
     */
    sort?: "importance";
    /**
     * Uses emoji in commit subjects.
     * @default {false}
     */
    emoji?: boolean;
    /**
     * Generates changelog lines optimized for terminal output.
     *
     * Pads emojis with spaces for terminal display, if emojis are enabled.
     * This option is ignored if emojis are not enabled.
     *
     * @default {false}
     */
    terminal?: boolean;
    /**
     * Includes short commit hash in commit subjects, when a pull request number
     * is not available.
     *
     * This is useful for generating links to commits that were not merged with
     * a pull request.
     *
     * @default {false}
     */
    hash?: boolean;
    /**
     * List only pull request numbers as commit subjects.
     *
     * This provides a nicely formatted changelog for GitHub pull requests, and
     * avoids listing commit titles twice.
     *
     * Changelogs for releases and Markdown files should not use this option,
     * because GitHub does not provide the pull request title in those contexts.
     *
     * @default {false}
     */
    github?: boolean;
  };
  /** Options for controlling the Markdown syntax. */
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
}

/**
 * Generate Markdown text for a package changelog.
 *
 * @example Generate a Markdown changelog.
 * ```ts
 * import { changelog } from "@roka/forge/changelog";
 * import { packageInfo } from "@roka/forge/workspace";
 * import { assertExists } from "@std/assert";
 * (async () => {
 *   const pkg = await packageInfo();
 *   assertExists(pkg.changes);
 *   const log = changelog(pkg.changes, {
 *     content: { title: "Changelog" },
 *     markdown: { heading: "# ", bullet: "* " },
 *   });
 *   return { log };
 * });
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
  const title = options?.content?.title;
  const markdown = {
    heading: "## ",
    subheading: "### ",
    bullet: "- ",
    ...options?.markdown,
  };
  const footer = options?.content?.footer
    ? [
      `${markdown.subheading}${options.content.footer.title}`,
      options.content.footer.items
        .map((x) => `${markdown.bullet}${x}`).join("\n"),
    ]
    : [];
  let log = commits.map((c) => conventional(c));
  if (options?.commit?.sort === "importance") log = sorted(log, byImportance);
  const blocks = [
    ...title ? [`${markdown.heading}${title}`] : [],
    log.map((c) => `${markdown.bullet}${subject(c, options)}`).join("\n") ?? [],
    footer,
  ].flat();
  return `${blocks.join("\n\n")}\n`;
}

function sorted(
  commits: ConventionalCommit[],
  compare: (a: ConventionalCommit, b: ConventionalCommit) => number,
): ConventionalCommit[] {
  return commits
    .map((commit, index) => ({ commit, index }))
    .toSorted((a, b) => compare(a.commit, b.commit) || a.index - b.index)
    .map(({ commit }) => commit);
}

function byImportance(a: ConventionalCommit, b: ConventionalCommit) {
  if (a.breaking && !b.breaking) return -1;
  if (!a.breaking && b.breaking) return 1;
  if (a.type === "feat" && b.type !== "feat") return -1;
  if (a.type !== "feat" && b.type === "feat") return 1;
  if (a.type === "fix" && b.type !== "fix") return -1;
  if (a.type !== "fix" && b.type === "fix") return 1;
  if (a.type && b.type) { if (b.type) return a.type < b.type ? -1 : 1; }
  if (a.type) return -1;
  if (b.type) return 1;
  return 0;
}

function subject(
  commit: ConventionalCommit,
  options: ChangelogOptions | undefined,
): string {
  const prPattern = /^.*\((#\d+)\)$/;
  let subject = options?.commit?.emoji ? commit.description : commit.subject;
  if (options?.commit?.hash && !subject.match(prPattern)) {
    subject = `${subject} (${commit.short})`;
  }
  if (options?.commit?.github) subject = subject.replace(prPattern, "$1");
  if (options?.commit?.emoji) subject = emoji(commit, subject, options);
  return subject;
}

function emoji(
  commit: ConventionalCommit,
  description: string,
  options: ChangelogOptions | undefined,
): string {
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
    breaking: "💥",
    unknown: "🔖",
  };
  const emoji = emojis[commit.type ?? "unknown"] ?? emojis["unknown"];
  assertExists(emoji);
  const padding = options?.commit?.terminal
    ? "".padEnd(2 - unicodeWidth(emoji), " ")
    : "";
  return [
    `${emoji}${padding}`,
    description,
    ...commit.breaking ? ["💥"] : [],
  ].join(" ");
}
