import { assertEquals } from "@std/assert";
import { plain } from "./html.ts";

Deno.test("plain() empty string", () => {
  assertEquals(plain(""), "");
});

Deno.test("plain() removes HTML tags", () => {
  const input = "<p>Hello, <b>World</b>!</p>";
  const output = plain(input);
  assertEquals(output, "Hello, World!");
});

Deno.test("plain() handles nested tags", () => {
  const input = "<div><span>Hello,</span> <strong>World!</strong></div>";
  assertEquals(plain(input), "Hello, World!");
});

Deno.test("plain() removes head content", () => {
  const input = "<head><title>Hi!</title></head><body>Hello, World!</body>";
  assertEquals(plain(input), "Hello, World!");
});

Deno.test("plain() removes script and style content", () => {
  const input =
    "<script>\nalert('x')\n</script>Hello, World!<style>body{}</style>";
  assertEquals(plain(input), "Hello, World!");
});

Deno.test("plain() handles nested script tags", () => {
  const input =
    "<script>if (a < b) { console.log('<script>'); }</script>Hello, World!";
  assertEquals(plain(input), "Hello, World!");
});

Deno.test("plain() strips comments", () => {
  const input = "Hello,<!-- this is a comment --> World!";
  assertEquals(plain(input), "Hello, World!");
});

Deno.test("plain() handles broken tags", () => {
  const input = "<div>Hello<span>, World!";
  assertEquals(plain(input), "Hello, World!");
});

Deno.test("plain() keeps special characters", () => {
  const input = "Hello World & Mars!";
  assertEquals(plain(input), "Hello World & Mars!");
});

Deno.test("plain() unescapes special characters", () => {
  const input = "Hello, World &amp; Mars!";
  assertEquals(plain(input), "Hello, World & Mars!");
});

Deno.test("plain() keeps special characters when removing tags", () => {
  const input = "<p>Hello, <b>World</b> & Mars!</p>";
  const output = plain(input);
  assertEquals(output, "Hello, World & Mars!");
});

Deno.test("plain() keeps non-tag angle bracket text", () => {
  const input = "Math: 1 &lt; 3 &gt; 2";
  assertEquals(plain(input), "Math: 1 < 3 > 2");
});

Deno.test("plain() removes directional formatting marks", () => {
  const input = `\u200EHello\u200F, World!`; // contains LRM and RLM
  assertEquals(plain(input), "Hello, World!");
});

Deno.test("plain() collapses whitespace", () => {
  const input = "Hello,\n\n\n   World!  \n";
  assertEquals(plain(input), "Hello, World!");
});

Deno.test("plain() trims leading and trailing whitespace", () => {
  const input = "   Hello, World!   ";
  assertEquals(plain(input), "Hello, World!");
});

Deno.test("plain() handles self-closing tags", () => {
  const input = "Hello,<br/> World<hr/>!";
  assertEquals(plain(input), "Hello, World!");
});

Deno.test("plain() handles tags with attributes", () => {
  const input = '<a href="url">Hello</a>, <b class="title">World!</b>';
  assertEquals(plain(input), "Hello, World!");
});

Deno.test("plain() handles attributes with angle brackets", () => {
  const input = '<div data-x="1 > 0">Hello, World!</div>';
  assertEquals(plain(input), "Hello, World!");
});

Deno.test("plain() handles tags with newlines and spaces", () => {
  const input = "<div>\n  <p>Hello,</p>\n  <p>World!</p>\n</div>";
  assertEquals(plain(input), "Hello, World!");
});

Deno.test("plain() handles tables", () => {
  const input = "<table>\n" +
    "<tr><th>Header1</th><th>Header2</th></tr>" +
    "<tr><td>Cell1</td><td>Cell2</td></tr>" +
    "<tr><td>Cell3</td><td>Cell4</td></tr>" +
    "</table>";
  assertEquals(plain(input), "Header1Header2Cell1Cell2Cell3Cell4");
});

Deno.test("plain() decodes basic entities before final escaping", () => {
  const input = "Hello, &lt;World&gt; &amp; &apos;Mars&apos;!";
  assertEquals(plain(input), "Hello, <World> & 'Mars'!");
});

Deno.test("plain() handles emoji and non-Latin characters", () => {
  const input = "<p>😊 Hello, 世界!</p>";
  assertEquals(plain(input), "😊 Hello, 世界!");
});

Deno.test("plain() is idempotent", () => {
  const once = plain("<p>Hello, World &amp; <b>Mars!</b></p>");
  const twice = plain(once);
  assertEquals(twice, once);
});
