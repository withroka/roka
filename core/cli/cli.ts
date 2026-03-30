/**
 * A library with helpers for CLI applications.
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
 * ### Terminal aware console
 *
 * ```ts
 * import { console } from "@roka/cli/console";
 * import { red } from "@std/fmt/colors";
 *
 * console.log(red("Red in terminal, but not when piped"));
 * ```
 *
 * ### Modules
 *
 *  -  {@link [config]}: Store user configuration
 *  -  {@link [console]}: Terminal aware console
 *
 * @module cli
 */
