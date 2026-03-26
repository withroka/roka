/**
 * A library for working with the file system, complementary to the standard
 * {@link https://jsr.io/@std/fs **@std/fs**} library.
 *
 * ### Finding files and directories
 *
 * ```ts
 * import { find } from "@roka/fs/find";
 *
 * const files = find(["."], { name: "*.ts" });
 *
 * for await (const _ of files) {
 *   // ...
 * }
 * ```
 *
 * ### Temporary directories
 *
 * ```ts
 * import { tempDirectory } from "@roka/fs/temp";
 *
 * await using directory = await tempDirectory();
 * await Deno.writeTextFile(directory.path("file.txt"), "Hello, world!");
 * ```
 *
 * ### Modules
 *
 *  - {@link [find]}: Find files and directories with glob patterns
 *  - {@link [temp]}: Work with temporary files and directories
 *
 * @module fs
 */
