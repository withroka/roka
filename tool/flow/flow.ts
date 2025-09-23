// deno-lint-ignore-file no-console
import { Command } from "@cliffy/command";
import { version } from "@roka/forge/version";
import { find } from "@roka/fs/find";
import { tempDirectory } from "@roka/fs/temp";
import { maybe } from "@roka/maybe";
import { bold } from "@std/fmt/colors";

const DESCRIPTION = `
  ${bold("🍃 flow")}

  An assistant tool to eliminate chore work in your Deno projects. Current
  functionality is limited to extending "deno fmt".
`;

export async function flow(): Promise<number> {
  let verbose = false;
  const cmd = new Command()
    .name("flow")
    .version(await version({ release: true, target: true }))
    .meta("deno", Deno.version.deno)
    .meta("v8", Deno.version.v8)
    .meta("typescript", Deno.version.typescript)
    .description(DESCRIPTION)
    .example("flow", "TODO")
    .example("forge fmt", "Format code, including code blocks in JSDoc.")
    .usage("<command> [options]")
    .option("--verbose", "Print additional information.", {
      hidden: true,
      global: true,
      action: () => verbose = true,
    })
    .command("fmt", fmtCommand());
  const { errors } = await maybe(() => cmd.parse());
  for (const error of errors ?? []) {
    console.error(`❌ ${error.message}`);
    if (verbose) console.error(error);
  }
  return errors ? 1 : 0;
}

function fmtCommand() {
  return new Command()
    .description("Format code, including code blocks in JSDoc.")
    .example("forge fmt", "Format all files.")
    .example("forge fmt **/*.ts", "Format all TypeScript files.")
    .arguments("[paths...:file]")
    .action(async (_, ...paths) => {
      for await (const path of find(paths, { type: "file" })) {
        await formatFile(path);
      }
    });
}

const INDENT = /(?<=^|\n)[ \t]*(?:\*)[ \t]*/;
const DELIMITER = /```/;
const LINE = new RegExp(
  `${INDENT.source}[^\n]*?(?=${DELIMITER.source}|\n)`,
  "g",
);
console.log(LINE.source);
const CODE = new RegExp(
  `(?<indent>${INDENT.source})${DELIMITER.source}(?<lang>\\w+)[ \t]*\n` +
    `(?<lines>(?:${LINE.source}\n)*?${LINE.source})` +
    `(?<tail>(?:\n${INDENT.source})?${DELIMITER.source})`,
  // "g",
);
console.log(CODE.source);

async function formatFile(path: string) {
  const original = await Deno.readTextFile(path);
  let result = "";
  let contents = original;
  let match: RegExpMatchArray | null = null;
  // console.log("line", Array.from(contents.matchAll(LINE))?.map((x) => x[0]));
  // console.log("code", contents.match(CODE)?.groups);
  do {
    if (match?.index !== undefined) {
      contents = contents.slice(match.index + match[0].length);
    }
    match = contents.match(CODE);
    if (match?.index !== undefined) {
      const { indent = "", lang = "ts", lines = "" } = { ...match?.groups };
      // deno-lint-ignore no-await-in-loop
      console.log({ match });
      const formatted = await formatBlock(path, indent, lang, lines);
      console.log({ formatted });
      result += contents.slice(0, match.index) + formatted;
    } else {
      result += contents;
    }
  } while (match?.index !== undefined);
  if (result !== original) {
    console.log({ path, original, result });
    // await Deno.writeTextFile(path, result);
  }
}

async function formatBlock(
  path: string,
  indent: string,
  lang: string,
  lines: string,
): Promise<string> {
  await using temp = await tempDirectory();
  lines = lines
    .split("\n")
    .map((line) => line.replace(INDENT, ""))
    .join("\n");
  console.log(lines);
  const block = temp.path(`block.${lang}`);
  await Deno.writeTextFile(block, lines);
  console.log(lines);
  const command = new Deno.Command("deno", {
    args: ["fmt", "--quiet", block],
    stdout: "piped",
    stderr: "piped",
  });
  const { code, stderr } = await command.output();
  if (code !== 0) {
    throw new Error(
      `Failed to format code block in ${path} (code: ${code}): ${
        new TextDecoder().decode(stderr)
      }`,
      { cause: { error: new TextDecoder().decode(stderr) } },
    );
  }
  lines = await Deno.readTextFile(block);
  lines = lines.trimEnd().split("\n").map((line) => indent + line).join("\n");
  lines = `${indent}\`\`\`${lang}\n${lines}\n${indent}\`\`\``;
  return lines;
}

if (import.meta.main) Deno.exit(await flow());
