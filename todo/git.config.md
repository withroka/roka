# Design: Git Configuration Interface

## Summary

Add comprehensive configuration management for Git repositories at both the
global and entity-specific levels:

**High Priority:**

1. **Top-level config interface** - Add `config.get()` and `config.delete()` to
   complement existing `config.set()`, enabling full configuration management
2. **Branch config interface** - Add `branch.config.get()`, `branch.config.set()`,
   and `branch.config.delete()` for managing branch-specific configuration

**Medium Priority:**

3. **Remote config interface** - Consider adding `remote.config.*` for remote-specific
   configuration management

## Top-level config interface

Add `get()` and `delete()` operations to the existing `ConfigOperations`
interface, providing complete control over repository configuration.

### Usage

```ts
import { git } from "@roka/git";

const repo = git();

// Get current config
const config = await repo.config.get();
console.log(config.user?.name); // "John Doe"

// Set config (already exists, shown for completeness)
await repo.config.set({
  user: { name: "Jane Doe", email: "jane@example.com" },
  commit: { gpgsign: true },
});

// Delete specific keys
await repo.config.delete("user.name");

// Delete entire sections
await repo.config.delete("branch.feature");
await repo.config.delete('branch "feature"'); // alternative syntax
```

### Design

Extend the existing `ConfigOperations` interface:

```ts
/** Config operations from {@linkcode Git.config}. */
export interface ConfigOperations {
  /** Returns the repository configuration. */
  get(): Promise<Config>;
  /** Configures repository options. */
  set(config: Config): Promise<void>;
  /**
   * Deletes configuration keys or sections.
   *
   * Supports both dotted notation (`"user.name"`) and section syntax
   * (`'branch "feature"'` or `"branch.feature"`).
   */
  delete(key: string): Promise<void>;
}
```

The existing `Config` interface should remain unchanged:

```ts
/** Configuration for a git repository. */
export interface Config {
  /** Branch configuration. */
  branch?: {
    /** How to setup tracking for new branches. */
    autoSetupMerge?: boolean | "always" | "inherit" | "simple";
  };
  /** Clone configuration. */
  clone?: {
    /** Default remote name. */
    defaultRemoteName?: string;
  };
  /** Commit configuration. */
  commit?: {
    /** Whether to sign commits. */
    gpgsign?: boolean;
  };
  // ... other config sections
  /** User configuration. */
  user?: Partial<User> & {
    /** GPG key for signing commits. */
    signingkey?: string;
  };
}
```

### Implementation

- Add `get()` method to `ConfigOperations` interface
- Implement `config.get()` using `git config --list --local`
- Parse git config output into structured `Config` object
- Add `delete()` method to `ConfigOperations` interface
- Implement `config.delete()` using `git config --unset` or `git config --remove-section`
- Handle both dotted keys and section syntax
- Add tests for reading configuration
- Add tests for deleting configuration keys and sections
- Update documentation with examples

## Branch config interface

Add a dedicated `branch.config` namespace for managing branch-specific
configuration like descriptions, upstream settings, and rebase preferences.

### Usage

```ts
import { git } from "@roka/git";

const repo = git();

// Get branch config
const config = await repo.branch.config.get("feature");
console.log(config.description); // "Add user authentication"
console.log(config.remote); // "origin"
console.log(config.rebase); // true

// Set branch config
await repo.branch.config.set("feature", {
  description: "Add OAuth2 authentication",
  rebase: true,
  pushRemote: "fork",
});

// Delete specific keys
await repo.branch.config.delete("feature", "description");

// Delete all config for a branch
await repo.branch.config.delete("feature");
```

### Design

Add a new `BranchConfigOperations` interface:

```ts
/** Branch config operations from {@linkcode BranchOperations.config}. */
export interface BranchConfigOperations {
  /** Returns the configuration for a branch. */
  get(branch: string | Branch): Promise<BranchConfig>;
  /** Sets configuration for a branch. */
  set(branch: string | Branch, config: BranchConfig): Promise<void>;
  /**
   * Deletes configuration for a branch.
   *
   * If `key` is provided, deletes only that key. Otherwise, deletes all
   * configuration for the branch.
   */
  delete(branch: string | Branch, key?: string): Promise<void>;
}

/** Configuration for a git branch. */
export interface BranchConfig {
  /** Branch description for documentation. */
  description?: string;
  /** Default remote for fetching. */
  remote?: string;
  /** Ref to merge from remote. */
  merge?: string;
  /** Remote for pushing. */
  pushRemote?: string;
  /** Whether to rebase when pulling. */
  rebase?: boolean | "merges" | "interactive";
  /** Allow additional config keys. */
  [key: string]: string | boolean | undefined;
}
```

Update `BranchOperations` to include config:

```ts
/** Branch operations from {@linkcode Git.branch}. */
export interface BranchOperations {
  /** List branches in the repository alphabetically. */
  list(options?: BranchListOptions): Promise<Branch[]>;
  // ... existing operations ...
  /** Deletes a branch. */
  delete(branch: string | Branch, options?: BranchDeleteOptions): Promise<void>;
  /** Branch configuration operations. */
  config: BranchConfigOperations;
}
```

### Implementation

- Add `BranchConfig` interface with known branch config keys
- Add `BranchConfigOperations` interface
- Implement `branch.config.get()` using `git config --get-regexp "^branch\\."`
- Parse branch config into structured object
- Implement `branch.config.set()` using `git config branch.<name>.<key>`
- Implement `branch.config.delete()` with optional key parameter
- Use `git config --unset` for single keys
- Use `git config --remove-section` for entire branch config
- Add tests for all branch config operations
- Add documentation with examples

## Remote config interface

Investigate whether remote-specific configuration management would be useful.
Remote config is typically managed through `remote.add()` and `remote.set()`,
but there may be additional config keys that need management.

### Usage

Potential usage if implemented:

```ts
import { git } from "@roka/git";

const repo = git();

// Get remote config
const config = await repo.remote.config.get("origin");
console.log(config.fetch); // "+refs/heads/*:refs/remotes/origin/*"
console.log(config.pushurl); // "git@github.com:user/repo.git"

// Set remote config
await repo.remote.config.set("origin", {
  fetch: "+refs/heads/*:refs/remotes/origin/*",
  tagopt: "--no-tags",
});
```

### Design

Analyze existing remote operations and git remote config structure:

1. **Review current `RemoteOperations`**:
   - `remote.add()` - sets fetch/push URLs
   - `remote.set()` - updates fetch/push URLs
   - These already handle the primary remote config

2. **Identify gaps**:
   - Are there remote config keys not accessible through current API?
   - Examples: `remote.<name>.tagopt`, `remote.<name>.proxy`, etc.

3. **Decide interface**:
   - If needed, follow `BranchConfigOperations` pattern
   - `remote.config.get()`, `remote.config.set()`, `remote.config.delete()`

### Implementation

- Audit all git remote configuration keys
- Review current `RemoteOperations` coverage
- Identify which config keys are not accessible
- If gaps exist, implement `RemoteConfigOperations` interface
- Follow same pattern as `BranchConfigOperations`
- If no gaps, document that existing operations are sufficient
- Add tests if interface is implemented
