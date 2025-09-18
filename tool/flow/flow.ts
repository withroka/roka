// deno-lint-ignore-file no-console
import { Command, ValidationError } from "@cliffy/command";
import { pool } from "@roka/async/pool";
import { version } from "@roka/forge/version";
import { tempDirectory } from "@roka/fs/temp";

export async function flow(): Promise<number> {
  let verbose = false;
  const cmd = new Command()
    .name("flow")
    .version(await version({ release: true, target: true }))
    .meta("deno", Deno.version.deno)
    .meta("v8", Deno.version.v8)
    .meta("typescript", Deno.version.typescript)
    .description("Format code blocks in JSDoc.")
    // .example("forge", "List all packages.")
    // .usage("<command> [options] [packages...]")
    .option("--verbose", "Print additional information.", {
      hidden: true,
      global: true,
      action: () => verbose = true,
    })
    .arguments("[files...:file]")
    .action(async (_, ...files) => {
      await pool(files, formatFile, { concurrency: 8 });
    });
  try {
    await cmd.parse();
  } catch (e: unknown) {
    if (e instanceof ValidationError) {
      cmd.showHelp();
      console.error(`❌ ${e.message}`);
      Deno.exit(1);
    }
    const errors = (e instanceof AggregateError) ? e.errors : [e];
    for (const error of errors) {
      console.error(`❌ ${error.message}`);
      if (verbose) console.error(error);
      else if (error["cause"] && error["cause"]["error"]) {
        console.error(error.cause.error);
      }
    }
    return 2;
  }
  return 0;
}

async function formatFile(file: string) {
  const original = await Deno.readTextFile(file);
  let result = "";
  let contents = original;
  let match: RegExpMatchArray | null = null;
  do {
    if (match?.index !== undefined) {
      contents = contents.slice(match.index + match[0].length);
    }
    match = contents
      .match(
        /(?<=\n)(?<indent>\s*(?:\*|\/\/)\s*)```(?<lang>.*)\n(?<lines>[\s\S]*)\n\s*(?:\*|\/\/)\s*```/,
      );
    if (match !== null) {
      const { indent = "", lang = "ts", lines = "" } = { ...match?.groups };
      // deno-lint-ignore no-await-in-loop
      const formatted = await formatBlock(indent, lang, lines);
      result += contents.slice(0, match.index) + formatted;
    } else {
      result += contents;
    }
  } while (match?.index !== undefined);
  if (result !== original) {
    await Deno.writeTextFile(file, result);
    console.log(file);
  }
}

async function formatBlock(
  indent: string,
  lang: string,
  lines: string,
): Promise<string> {
  await using temp = await tempDirectory();
  lines = lines
    .split("\n").map((line) => line.replaceAll(/(^|\n)\s*(?:\*|\/\/)\s*/g, ""))
    .join("\n");
  const path = temp.path(`block.${lang}`);
  await Deno.writeTextFile(path, lines);
  const command = new Deno.Command("deno", {
    args: ["fmt", "--quiet", path],
    stdout: "piped",
    stderr: "piped",
  });
  const { code, stderr } = await command.output();
  if (code !== 0) {
    throw new Error(
      `Failed to format code block: ${new TextDecoder().decode(stderr)}`,
      { cause: { error: new TextDecoder().decode(stderr) } },
    );
  }
  lines = await Deno.readTextFile(path);
  lines = lines.trimEnd().split("\n").map((line) => indent + line).join("\n");
  lines = `${indent}\`\`\`${lang}\n${lines}\n${indent}\`\`\``;
  return lines;
}

if (import.meta.main) Deno.exit(await flow());
