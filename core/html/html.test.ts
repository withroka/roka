import { assertEquals } from "@std/assert";
import { plain } from "./html.ts";

Deno.test("plain() empty string", () => {
  assertEquals(plain(""), "");
});

Deno.test("plain() removes HTML tags", () => {
  const input = "<p>Hello, <b>world</b>!</p>";
  const output = plain(input);
  assertEquals(output, "Hello, world!");
});

Deno.test("plain() handles nested tags", () => {
  const input = "<div><span>one</span> <strong>two</strong></div>";
  assertEquals(plain(input), "one two");
});

Deno.test("plain() removes head content", () => {
  const input = "<head><title>title</title></head><body>content</body>";
  assertEquals(plain(input), "content");
});

Deno.test("plain() removes script and style content", () => {
  const input = "<script>\nalert('x')\n</script>text<style>body{}</style>";
  assertEquals(plain(input), "text");
});

Deno.test("plain() strips comments", () => {
  const input = "text<!-- this is a comment -->more text";
  assertEquals(plain(input), "textmore text");
});

Deno.test("plain() handles broken tags", () => {
  const input = "<div><span>text";
  assertEquals(plain(input), "text");
});

Deno.test("plain() keeps special characters", () => {
  const input = "one & two";
  assertEquals(plain(input), "one & two");
});

Deno.test("plain() unescapes special characters", () => {
  const input = "one &amp; two";
  assertEquals(plain(input), "one & two");
});

Deno.test("plain() keeps special characters when removing tags", () => {
  const input = "<p>Hello, <b>world</b> & everyone!</p>";
  const output = plain(input);
  assertEquals(output, "Hello, world & everyone!");
});

Deno.test("plain() keeps non-tag angle bracket text", () => {
  const input = "Math: 1 &lt; 3 &gt; 2";
  assertEquals(plain(input), "Math: 1 < 3 > 2");
});

Deno.test("plain() removes directional formatting marks", () => {
  const input = `\u200EHello\u200F World`; // Contains LRM and RLM
  assertEquals(plain(input), "Hello World");
});

Deno.test("plain() collapses whitespace", () => {
  const input = "Hello,\n\n\n   World!  \n";
  assertEquals(plain(input), "Hello,\nWorld!");
});

Deno.test("plain() trims leading and trailing whitespace", () => {
  const input = "   Hello, World!   ";
  assertEquals(plain(input), "Hello, World!");
});

Deno.test("plain() handles multiple line breaks", () => {
  const input = "Line 1<br>Line 2<p>Line 3</p> <div>Line 4</div>";
  assertEquals(plain(input), "Line 1\nLine 2\nLine 3\nLine 4");
});

Deno.test("plain() handles self-closing tags", () => {
  const input = "Hello<br/>World<hr/>!";
  assertEquals(plain(input), "Hello\nWorld\n!");
});

Deno.test("plain() handles tags with attributes", () => {
  const input = '<a href="url">one</a> <b class="title">two</b>';
  assertEquals(plain(input), "one two");
});

Deno.test.ignore("plain() handles attributes with angle brackets", () => {
  const input = '<div data-x="1 > 0">text</div>';
  assertEquals(plain(input), "text");
});

Deno.test("plain() handles tags with newlines and spaces", () => {
  const input = "<div>\n  <p>Hello</p>\n  <p>World</p>\n</div>";
  assertEquals(plain(input), "Hello\nWorld");
});

Deno.test("plain() handles tables", () => {
  const input = "<table>\n" +
    "<tr><th>Header1</th><th>Header2</th></tr>" +
    "<tr><td>Cell 1</td><td>Cell 2</td></tr>" +
    "<tr><td>Cell 3</td><td>Cell 4</td></tr>" +
    "</table>";
  assertEquals(plain(input), "Header1 Header2\nCell 1 Cell 2\nCell 3 Cell 4");
});

Deno.test("plain() decodes basic entities before final escaping", () => {
  const input = "Tom &amp; Jerry &lt;Cartoon&gt; &apos;Classic&apos;";
  assertEquals(plain(input), "Tom & Jerry <Cartoon> 'Classic'");
});

Deno.test("plain() handles emoji and non-Latin characters", () => {
  const input = "<p>😊 Hello, 世界!</p>";
  assertEquals(plain(input), "😊 Hello, 世界!");
});

Deno.test("plain() is idempotent", () => {
  const once = plain("<p>one & two &amp; three</p>");
  const twice = plain(once);
  assertEquals(twice, once);
});
