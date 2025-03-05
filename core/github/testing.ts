/**
 * Objects to write tests for GitHub.
 *
 * This module provides utilities to create fake GitHub objects for testing.
 *
 * @example
 * ```ts
 * import { testRepository, testPullRequest, testRelease } from "@roka/github/testing";
 * import { assertEquals } from "@std/assert";
 *
 * const repo = testRepository();
 * const pull = testPullRequest({ repo, title: "title" });
 * const release = testRelease({ repo, tag: "tag" });
 *
 * assertEquals(pull.repo, repo);
 * assertEquals(release.repo, repo);
 * ```
 *
 * @module
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
 * Creates a repository with fake data.
 *
 * The created repository keeps track of its pull requests and releases.
 *
 * @example
 * ```ts
 * import { testRepository } from "@roka/github/testing";
 * import { assertEquals } from "@std/assert";
 *
 * const repo = testRepository();
 *
 * const pull = await repo.pulls.create({ title: "title" });
 * assertEquals(await repo.pulls.list(), [pull]);
 *
 * const release = await repo.releases.create("tag");
 * assertEquals(await repo.releases.list(), [release]);
 * await release.delete();
 * assertEquals(await repo.releases.list(), []);
 * ```
 */
export function testRepository(data?: Partial<Repository>): Repository {
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
        const pull = testPullRequest({
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
        const release = testRelease({
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
 * Creates a pull request with fake data.
 *
 * @example
 * ```ts
 * import { testPullRequest } from "@roka/github/testing";
 * import { assertEquals } from "@std/assert";
 *
 * const pull = testPullRequest({ title: "title" });
 * assertEquals(pull.title, "title");
 *
 * await pull.update({ title: "new title" });
 * assertEquals(pull.title, "new title");
 * ```
 */

export function testPullRequest(data?: Partial<PullRequest>): PullRequest {
  const pull: PullRequest = {
    repo: testRepository(),
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
 * Creates a release with fake data.
 *
 * @example
 * ```ts
 * import { testRelease } from "@roka/github/testing";
 * import { assertEquals } from "@std/assert";
 *
 * const release = testRelease({ tag: "tag" });
 * assertEquals(release.tag, "tag");
 *
 * await release.update({ tag: "new tag" });
 * assertEquals(release.tag, "new tag");
 *
 * const asset = await release.assets.upload("file.txt");
 * assertEquals(await release.assets.list(), [asset]);
 * await asset.delete();
 * assertEquals(await release.assets.list(), []);
 * ```
 */
export function testRelease(data?: Partial<Release>): Release {
  let nextAsset = 1;
  const assets: ReleaseAsset[] = [];
  const release: Release = {
    repo: testRepository(),
    url: "url",
    id: 1,
    name: "name",
    tag: "tag",
    commit: "commit",
    body: "body",
    draft: false,
    preRelease: false,
    update: (options) => {
      Object.assign(release, options);
      return Promise.resolve(release);
    },
    delete: () => Promise.resolve(),
    assets: {
      list: () => Promise.resolve(assets),
      upload: (file) => {
        const asset = testReleaseAsset({
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
 * Creates a release asset with fake data.
 *
 * @example
 * ```ts
 * import { testReleaseAsset } from "@roka/github/testing";
 * import { assertEquals } from "@std/assert";
 *
 * const asset = testReleaseAsset({ name: "name" });
 * assertEquals(asset.name, "name");
 * ```
 */
export function testReleaseAsset(data?: Partial<ReleaseAsset>): ReleaseAsset {
  return {
    release: testRelease(),
    url: "url",
    id: 2,
    name: "name",
    size: 3,
    downloadCount: 4,
    delete: () => Promise.resolve(),
    ...data,
  };
}
