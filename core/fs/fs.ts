/**
 * A library for working with the file system.
 *
 * This package only provides the {@link [temp]} module to work with
 * temporary files and directories.
 *
 * ```ts
 * import { tempDirectory } from "@roka/fs/temp";
 * await using dir = await tempDirectory();
 * await Deno.writeTextFile(dir.path("file.txt"), "Hello, world!");
 * ```
 *
 * ## Modules
 *
 *  -  {@link [find]}: Find files and directories with glob patterns.
 *  -  {@link [temp]}: Work with temporary files and directories.
 *
 * @module fs
 */
