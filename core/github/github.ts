/**
 * Objects to interact with GitHub.
 *
 * This module provides, incomplete, opininiated functionality wrapped around
 * {@link https://docs.github.com/en/rest | GitHub REST API}.
 *
 * @todo Support pagination.
 * @todo Provide dates.
 * @todo Provide user.
 * @todo Add `github().issues`.
 * @todo Add `github().gists`.
 * @todo Add `github().projects`.
 * @todo Add `github().projects`.
 * @todo Add `github().labels`.
 * @todo Add `github().comments`.
 * @todo Add `github().teams`.
 * @todo Add `github().organizations`.
 *
 * @module
 */

import type { components } from "@octokit/openapi-types/types";
import { Octokit } from "@octokit/rest";
import { type Git, git as gitRepo } from "@roka/git";
import { assert } from "@std/assert/assert";
import { basename } from "@std/path";

/** GitHub API client. */
export interface GitHub {
  repos: {
    /** Retrieve a repository using local remote URL. */
    get(options?: RepositoryGetOptions): Promise<Repository>;
    /** Retrieve a repository using owner and repository name. */
    get(
      owner: string,
      repo: string,
      options?: RepositoryGetOptions,
    ): Repository;
  };
}

/** A GitHub repository with API operations. */
export interface Repository {
  /** Repository URL. */
  url: string;
  /** Repository owner. */
  owner: string;
  /** Repository name. */
  repo: string;
  /** Local Git repository operations. */
  git: Git;
  /** Operations for manaing pull requests. */
  pulls: {
    /** List pull requests. */
    list(options?: PullRequestListOptions): Promise<PullRequest[]>;
    /** Create a pull request. */
    create(options?: PullRequestCreateOptions): Promise<PullRequest>;
  };
  /** Operations for managing releases. */
  releases: {
    /** List releases. */
    list(options?: ReleaseListOptions): Promise<Release[]>;
    /** Create a release. */
    create(tag: string, options?: ReleaseCreateOptions): Promise<Release>;
  };
}

/** A GitHub pull request with API operations. */
export interface PullRequest {
  /** Pull request repo. */
  repo: Repository;
  /** Pull request URL. */
  url: string;
  /** Pull request number. */
  number: number;
  /** Pull request title. */
  title: string;
  /** Pull request body. */
  body: string;
  /** Pull request base branch. */
  base: string;
  /** Pull request head branch. */
  head: string;
  /** Whether the pull request is a draft. */
  draft: boolean;
  /** Whether the pull requst is closed. */
  closed: boolean;
  /** Whether the pull request is locked */
  locked: boolean;
  /** Update the pull request. */
  update(options?: PullRequestUpdateOptions): Promise<PullRequest>;
}

/** A GitHub release with API operations. */
export interface Release {
  /** Release repo. */
  repo: Repository;
  /** Release URL. */
  url: string;
  /** Release ID. */
  id: number;
  /** Release name. */
  name: string;
  /** Release tag. */
  tag: string;
  /** Release target branch or commit. */
  commit: string;
  /** Release body. */
  body: string;
  /** Whether the release is a draft. */
  draft: boolean;
  /** Whether the release is a prerelease. */
  preRelease: boolean;
  /** Update the release. */
  update(options?: ReleaseUpdateOptions): Promise<Release>;
  /** Delete the release. */
  delete(): Promise<void>;
  /** Operations for managing release assets. */
  assets: {
    /** List release assets. */
    list(): Promise<ReleaseAsset[]>;
    /** Upload an asset to the release. */
    upload(file: string): Promise<ReleaseAsset>;
  };
}

/** A GitHub release asset with API operations. */
export interface ReleaseAsset {
  /** Release of the asset. */
  release: Release;
  /** Release asset download URL. */
  url: string;
  /** Release asset ID. */
  id: number;
  /** Release asset name. */
  name: string;
  /** Release asset size in bytes. */
  size: number;
  /** Release asset download count. */
  downloadCount: number;
  /** Delete the release asset. */
  delete(): Promise<void>;
}

/** Options for creating a GitHub API client. */
export interface GitHubOptions {
  /**
   * GitHub personal access token.
   *
   * If a token is not provided, the client will be unauthenticated.
   */
  token?: string;
}

/** Options for retrieving a repository. */
export interface RepositoryGetOptions {
  /**
   * Local directory for the repository.
   * @default {"."}
   *
   * The client will deduce the owner and repository name from the remote URL.
   * Pull requests will also use the local state, such as the current branch.
   */
  directory?: string;
}

/** Options for listing pull requests. */
export type PullRequestListOptions = Partial<
  Pick<PullRequest, "title" | "head" | "base" | "closed">
>;

/** Options for creating a pull request. */
export type PullRequestCreateOptions = Partial<
  Pick<PullRequest, "title" | "body" | "base" | "head" | "draft">
>;

/** Options for updating a pull request. */
export type PullRequestUpdateOptions = Partial<
  Pick<PullRequest, "title" | "body" | "base" | "closed">
>;

/** Options for listing releases. */
export type ReleaseListOptions = Partial<
  Pick<Release, "name" | "tag" | "draft">
>;

/** Options for creating a release. */
export type ReleaseCreateOptions = Partial<
  Pick<Release, "name" | "body" | "commit" | "draft" | "preRelease">
>;

/** Options for updating a release. */
export type ReleaseUpdateOptions = Partial<
  Pick<Release, "name" | "body" | "tag" | "commit" | "draft" | "preRelease">
>;

/** Creates a GitHub API client. */
export function github(options?: GitHubOptions): GitHub {
  const api = new Octokit({ auth: options?.token });
  return {
    repos: new class {
      get(
        owner: string,
        repo: string,
        options?: RepositoryGetOptions,
      ): Repository;
      get(options?: RepositoryGetOptions): Promise<Repository>;
      get(
        ownerOrOptions?: string | RepositoryGetOptions,
        repo?: string,
        options?: RepositoryGetOptions,
      ): Repository | Promise<Repository> {
        if (typeof ownerOrOptions !== "string") options = ownerOrOptions;
        const git = gitRepo(
          options?.directory !== undefined ? { cwd: options.directory } : {},
        );
        if (typeof ownerOrOptions === "string") {
          assert(repo);
          return repository(git, api, ownerOrOptions, repo);
        }
        return (async () => {
          const remote = await git.remotes.get();
          const { owner, repo } = parseRemote(remote.pushUrl);
          return repository(git, api, owner, repo);
        })();
      }
    }(),
  };
}

function repository(
  git: Git,
  api: Octokit,
  owner: string,
  repo: string,
): Repository {
  const result: Repository = {
    url: `https://github.com/${owner}/${repo}`,
    owner,
    repo,
    git,
    pulls: {
      async list(options) {
        const response = await api.rest.pulls.list({
          repo,
          owner,
          ...options?.head !== undefined && { head: options.head },
          ...options?.base !== undefined && { base: options.base },
          ...options?.closed !== undefined
            ? { state: options.closed ? "closed" : "open" }
            : { state: "all" },
        });
        return response.data
          .map((x) => pullRequest(api, result, x))
          .filter((pr) =>
            options?.title === undefined || pr.title === options.title
          );
      },
      async create(options) {
        const head = options?.head ?? await git.branches.current();
        assert(head, "Cannot determine current branch");
        const base = options?.base ?? await git.remotes.defaultBranch();
        assert(base, "Cannot determine remote base branch");
        const commit = !options?.title
          ? (await git.commits.log({ range: { from: base } })).pop()
          : undefined;
        const title = options?.title ?? commit?.summary;
        const body = options?.body ?? commit?.body;
        const response = await api.rest.pulls.create({
          owner,
          repo,
          head,
          base,
          ...title !== undefined && { title },
          ...body !== undefined && { body },
          ...options?.draft ? { draft: options?.draft } : {},
        });
        return pullRequest(api, result, response.data);
      },
    },
    releases: {
      async list(options) {
        const response = await api.rest.repos.listReleases({
          owner,
          repo,
          per_page: 100,
        });
        return response.data
          .map((x) => release(api, result, x))
          .filter((release) =>
            options?.name === undefined || release.name === options.name
          )
          .filter((release) =>
            options?.tag === undefined || release.tag === options.tag
          )
          .filter((release) =>
            options?.draft === undefined ||
            release.draft === options.draft
          );
      },
      async create(tag, options) {
        const response = await api.rest.repos.createRelease({
          owner,
          repo,
          tag_name: tag,
          ...options?.name !== undefined && { name: options.name },
          ...options?.body !== undefined && { body: options.body },
          ...options?.draft !== undefined && { draft: options?.draft },
          ...options?.preRelease !== undefined &&
            { prerelease: options?.preRelease },
          ...options?.commit !== undefined &&
            { target_commitish: options.commit },
        });
        return release(api, result, response.data);
      },
    },
  };
  return result;
}

function pullRequest(
  api: Octokit,
  repo: Repository,
  data: Partial<
    | components["schemas"]["pull-request"]
    | components["schemas"]["pull-request-simple"]
  >,
): PullRequest {
  assert(data.html_url, "Missing pull request URL");
  assert(data.number, "Missing pull request number");
  assert(data.base?.ref, "Missing pull request base branch");
  assert(data.head?.ref, "Missing pull request head branch");
  const state = data.state;
  const result: PullRequest = {
    repo,
    url: data.html_url,
    number: data.number,
    title: data.title ?? "",
    body: data.body ?? "",
    base: data.base.ref,
    head: data.head.ref,
    draft: data.draft ?? false,
    closed: state === "closed",
    locked: data.locked ?? false,
    async update(options) {
      const response = await api.rest.pulls.update({
        owner: repo.owner,
        repo: repo.repo,
        pull_number: result.number,
        ...options?.title !== undefined && { title: options.title },
        ...options?.body !== undefined && { body: options.body },
        ...options?.base !== undefined && { base: options.base },
        ...options?.closed !== undefined &&
          { state: options.closed ? "closed" : "open" },
      });
      return pullRequest(api, repo, response.data);
    },
  };
  return result;
}

function release(
  api: Octokit,
  repo: Repository,
  data: Partial<components["schemas"]["release"]>,
): Release {
  assert(data.html_url, "Missing release URL");
  assert(data.id, "Missing release ID");
  assert(data.tag_name, "Missing release tag");
  assert(data.target_commitish, "Missing release target commit");
  const result: Release = {
    repo,
    url: data.html_url,
    id: data.id,
    name: data.name ?? "",
    tag: data.tag_name,
    commit: data.target_commitish,
    body: data.body ?? "",
    draft: data.draft ?? false,
    preRelease: data.prerelease ?? false,
    async update(options) {
      const response = await api.rest.repos.updateRelease({
        owner: repo.owner,
        repo: repo.repo,
        release_id: this.id,
        ...options?.name !== undefined && { name: options.name },
        ...options?.body !== undefined && { body: options.body },
        ...options?.tag !== undefined && { tag_name: options.tag },
        ...options?.commit !== undefined &&
          { target_commitish: options.commit },
        ...options?.draft !== undefined && { draft: options?.draft },
        ...options?.preRelease !== undefined &&
          { prerelease: options?.preRelease },
      });
      return release(api, repo, response.data);
    },
    async delete() {
      await api.rest.repos.deleteRelease({
        owner: repo.owner,
        repo: repo.repo,
        release_id: this.id,
      });
    },
    assets: {
      async list() {
        const response = await api.rest.repos.listReleaseAssets({
          owner: repo.owner,
          repo: repo.repo,
          release_id: result.id,
        });
        return response.data.map((x) => releaseAsset(api, result, x));
      },
      async upload(file) {
        const name = basename(file);
        // https://github.com/octokit/octokit.js/discussions/2087
        const data = (await Deno.readFile(file)) as unknown as string;
        const response = await api.rest.repos.uploadReleaseAsset({
          owner: repo.owner,
          repo: repo.repo,
          release_id: result.id,
          name,
          data,
        });
        return releaseAsset(api, result, response.data);
      },
    },
  };
  return result;
}

function releaseAsset(
  api: Octokit,
  release: Release,
  data: Partial<components["schemas"]["release-asset"]>,
): ReleaseAsset {
  assert(data.browser_download_url, "Missing release asset URL");
  assert(data.id, "Missing release asset ID");
  assert(data.size, "Missing release asset size");
  const result: ReleaseAsset = {
    release,
    url: data.browser_download_url,
    id: data.id,
    name: data.name ?? "",
    size: data.size,
    downloadCount: data.download_count ?? 0,
    async delete() {
      await api.rest.repos.deleteReleaseAsset({
        owner: release.repo.owner,
        repo: release.repo.repo,
        asset_id: result.id,
      });
    },
  };
  return result;
}

const REMOTE_URL_PATTERN =
  /^(?<protocol>https:\/\/|git@)(?<host>[^:/]+)[:/](?<owner>[^/]+)\/(?<repo>[^/]+?)(?:\.git)?$/;

/** Gets the owner and repository name from the remote URL. */
function parseRemote(remote: string): { owner: string; repo: string } {
  const match = remote.match(REMOTE_URL_PATTERN);
  if (
    match?.groups?.host !== "github.com" ||
    !match.groups.owner ||
    !match.groups.repo
  ) {
    throw new Error(`Invalid remote URL: ${remote}`);
  }
  return { owner: match.groups.owner, repo: match.groups.repo };
}
