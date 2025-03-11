/**
 * This module provides utilities to create fake GitHub objects for testing.
 *
 * ```ts
 * import {
 *   fakeRepository,
 *   fakePullRequest,
 *   fakeRelease,
 * } from "@roka/github/testing";
 * const repo = fakeRepository();
 * const pull = fakePullRequest({ repo, title: "title" });
 * const release = fakeRelease({ repo, tag: "tag" });
 * ```
 *
 * @module testing
 */

import { git } from "@roka/git";
import type {
  PullRequest,
  Release,
  ReleaseAsset,
  Repository,
} from "@roka/github";
import { basename } from "@std/path";

/**
 * Creates a repository with fake data and operations.
 *
 * The created repository keeps track of its pull requests and releases.
 *
 * @example Create a repository with a pull request and a release.
 * ```ts
 * import { fakeRepository } from "@roka/github/testing";
 * import { assertEquals } from "@std/assert";
 *
 * const repo = fakeRepository();
 * const pull = await repo.pulls.create({ title: "title" });
 * assertEquals(await repo.pulls.list(), [pull]);
 * const release = await repo.releases.create("tag");
 * assertEquals(await repo.releases.list(), [release]);
 * await release.delete();
 * assertEquals(await repo.releases.list(), []);
 * ```
 */
export function fakeRepository(data?: Partial<Repository>): Repository {
  let nextPull = 1;
  let nextRelease = 1;
  const pulls: PullRequest[] = [];
  const releases: Release[] = [];
  const repo: Repository = {
    url: "url",
    owner: "owner",
    repo: "repo",
    git: git(),
    pulls: {
      list: () => Promise.resolve(pulls),
      create: (options) => {
        const pull = fakePullRequest({
          repo,
          number: nextPull++,
          ...options,
        });
        pulls.push(pull);
        return Promise.resolve(pull);
      },
    },
    releases: {
      list: () => Promise.resolve(releases),
      create: (tag, options) => {
        const release = fakeRelease({
          repo,
          tag,
          id: nextRelease++,
          ...options,
          delete: () => {
            releases.splice(releases.indexOf(release), 1);
            return Promise.resolve();
          },
        });
        releases.push(release);
        return Promise.resolve(release);
      },
    },
    ...data,
  };
  return repo;
}

/**
 * Creates a pull request with fake data and operations.
 *
 * @example Create a pull request with a title.
 * ```ts
 * import { fakePullRequest } from "@roka/github/testing";
 * import { assertEquals } from "@std/assert";
 *
 * const pull = fakePullRequest({ title: "title" });
 * assertEquals(pull.title, "title");
 * await pull.update({ title: "new title" });
 * assertEquals(pull.title, "new title");
 * ```
 */

export function fakePullRequest(data?: Partial<PullRequest>): PullRequest {
  const pull: PullRequest = {
    repo: fakeRepository(),
    url: "url",
    number: 1,
    title: "title",
    body: "body",
    head: "head",
    base: "base",
    draft: false,
    closed: false,
    locked: false,
    update: (options) => {
      Object.assign(pull, options);
      return Promise.resolve(pull);
    },
    ...data,
  };
  return pull;
}

/**
 * Creates a release with fake data and operations.
 *
 * @example Create a release with a tag.
 * ```ts
 * import { fakeRelease } from "@roka/github/testing";
 * import { assertEquals } from "@std/assert";
 *
 * const release = fakeRelease({ tag: "tag" });
 * assertEquals(release.tag, "tag");
 * await release.update({ tag: "new tag" });
 * assertEquals(release.tag, "new tag");
 * const asset = await release.assets.upload("file.txt");
 * assertEquals(await release.assets.list(), [asset]);
 * await asset.delete();
 * assertEquals(await release.assets.list(), []);
 * ```
 */
export function fakeRelease(data?: Partial<Release>): Release {
  let nextAsset = 1;
  const assets: ReleaseAsset[] = [];
  const release: Release = {
    repo: fakeRepository(),
    url: "url",
    id: 1,
    name: "name",
    tag: "tag",
    commit: "commit",
    body: "body",
    draft: false,
    prerelease: false,
    update: (options) => {
      Object.assign(release, options);
      return Promise.resolve(release);
    },
    delete: () => Promise.resolve(),
    assets: {
      list: () => Promise.resolve(assets),
      upload: (file) => {
        const asset = fakeReleaseAsset({
          release,
          name: basename(file),
          id: nextAsset++,
          delete: () => {
            assets.splice(assets.indexOf(asset), 1);
            return Promise.resolve();
          },
        });
        assets.push(asset);
        return Promise.resolve(asset);
      },
    },
    ...data,
  };
  return release;
}

/**
 * Creates a release asset with fake data and operations.
 *
 * @example Create a release asset with a name.
 * ```ts
 * import { fakeReleaseAsset } from "@roka/github/testing";
 * import { assertEquals } from "@std/assert";
 *
 * const asset = fakeReleaseAsset({ name: "name" });
 * assertEquals(asset.name, "name");
 * ```
 */
export function fakeReleaseAsset(data?: Partial<ReleaseAsset>): ReleaseAsset {
  return {
    release: fakeRelease(),
    url: "url",
    id: 2,
    name: "name",
    size: 3,
    downloadCount: 4,
    delete: () => Promise.resolve(),
    ...data,
  };
}
