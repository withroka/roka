/**
 * A library with helpers for CLI applications.
 *
 * This package only provides the {@link [config]} module to manage a local
 * file system user configuration.
 *
 * ### Storing user configuration in a local file system
 *
 * ```ts
 * import { config } from "@roka/cli/config";
 *
 * type AppConfig = { username: string };
 *
 * (async () => {
 *   using cfg = config<AppConfig>();
 *   const data = await cfg.get();
 *   await cfg.set({ ...data, username: "USER" });
 * });
 * ```
 *
 * ### Modules
 *
 *  -  {@link [config]}: Store user configuration
 *
 * @module cli
 */
