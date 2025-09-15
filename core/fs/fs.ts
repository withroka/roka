/**
 * File system utilities.
 *
 * This package only provides the {@link [temp]} module to work with
 * temporary files and directories.
 *
 * ```ts
 * import { tempDirectory } from "@roka/fs/temp";
 * await using directory = await tempDirectory();
 * await Deno.writeTextFile(directory.path("file.txt"), "Hello, world!");
 * ```
 *
 * ## Modules
 *
 *  -  {@link [temp]}: Work with temporary files and directories.
 *
 * @module fs
 */

export {};
