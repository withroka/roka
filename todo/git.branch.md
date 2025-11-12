# Design: Complete Branch Operations

## Summary

Complete the `git().branch` API with missing operations and clarify workflows
for common Git tasks:

**High Priority:**

1. **Merge status filtering** - Extend `RefListOptions` with `merged`/`noMerged`
   for filtering branches and tags by merge status, enabling cleanup workflows
2. **Branch pruning workflow** - Test and document how to handle deleted remote
   branches using existing operations

## Merge status filtering

Extend `RefListOptions` to support filtering branches and tags by merge status.
This enables workflows to identify which branches have been merged (safe to
delete) or remain unmerged (need attention).

### Usage

```ts
import { git } from "@roka/git";

const repo = git();

// Find all branches merged into main
const merged = await repo.branch.list({ merged: "main" });

// Find branches not yet merged
const unmerged = await repo.branch.list({ noMerged: "main" });

// Delete merged feature branches
for (const branch of merged) {
  if (branch.name.startsWith("feature/")) {
    await repo.branch.delete(branch);
  }
}

// Also works with tags
const releaseTags = await repo.tag.list({
  merged: "v2.0.0",
  name: "v1.*",
});
```

### Design

Extend the shared `RefListOptions` interface:

```ts
/**
 * Options common to the {@linkcode BranchOperations.list} and
 * {@linkcode TagOperations.list} functions for ref filtering.
 */
export interface RefListOptions {
  /** Ref selection pattern. The default is all relevant refs. */
  name?: string;
  /** Only refs that contain the specific commit. */
  contains?: Commitish;
  /** Only refs that do not contain the specific commit. */
  noContains?: Commitish;
  /** Only refs that point to the given commit. */
  pointsAt?: Commitish;
  /** Only refs whose tips are reachable from the commit. */
  merged?: Commitish;
  /** Only refs whose tips are not reachable from the commit. */
  noMerged?: Commitish;
}
```

### Implementation

- Update `RefListOptions` interface with `merged` and `noMerged` options
- Add `--merged` flag support to `branch.list()` implementation
- Add `--no-merged` flag support to `branch.list()` implementation
- Add `--merged` flag support to `tag.list()` implementation
- Add `--no-merged` flag support to `tag.list()` implementation
- Add tests for branch merge status filtering
- Add tests for tag merge status filtering
- Add documentation examples for cleanup workflows

## Handle local branches with deleted upstreams

Test and document the workflow for deleting local branches that track remote
branches which have been deleted. This addresses the TODO that was in git.ts:52.

The workflow should compose existing operations:

```sh
git fetch --prune origin
git branch -vv | grep ': gone]' | awk '{print $1}' | xargs git branch -D
```

### Usage

```ts
import { git } from "@roka/git";
const repo = git();
await repo.sync.pull({ remote: "origin", prune: true });
const branches = await repo.branch.list({ merged: "origin/main" }); // or "main"?
for (const branch of branches) {
  if (branch.fetch?.gone) {
    await repo.branch.delete(branch);
  }
}
```

### Design

Consider extending the `Branch` interface to make deleted upstream detection
more explicit:

```ts
/** A branch in a git repository. */
export interface Branch {
  /** Short name of the branch. */
  name: string;
  /**
   * Commit at the tip of the branch, if branch has any commits.
   *
   * This can be unset if the branch is unborn.
   */
  commit?: Commit;
  /** Upstream configuration for the branch, if set. */
  fetch?: {
    /** Name of the fetch branch in remote repository. */
    name: string;
    /** Remote of the upstream fetch branch. */
    remote: Remote;
    /** Remote tracking fetch branch. */
    branch: Branch;
    /** Whether the upstream branch has been deleted. */
    gone?: boolean;
  };
  /** Push configuration for the branch, if set. */
  push?: {
    /** Name of the push branch in remote repository. */
    name: string;
    /** Remote of the push branch. */
    remote: Remote;
    /** Remote tracking push branch. */
    branch: Branch;
    /** Should there be one here? Please, figure it out. */
    gone?: boolean;
  };
}
```

### Implementation

- Test that `branch.list()` correctly handles `': gone]'` status for deleted
  upstream branches
- Add a `gone` boolean to `Branch.fetch` to make detection explicit
- Add a test for branch pruning workflow
- Add documentation example to `git()` function JSDoc
