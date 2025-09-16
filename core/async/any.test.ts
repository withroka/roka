import { assertEquals, assertRejects } from "@std/assert";
import { any } from "./any.ts";

Deno.test("any() returns the first resolved result", async () => {
  const result = await any([
    Promise.resolve()
      .then(() => Promise.resolve())
      .then(() => "delayed"),
    Promise.resolve()
      .then(() => Promise.resolve("delayed")),
    Promise.resolve("first"),
  ]);
  assertEquals(result, "first");
});

Deno.test("any() ignores rejections with successful result", async () => {
  const result = await any([
    Promise.resolve()
      .then(() => Promise.reject(new Error("rejected"))),
    Promise.reject(new Error("rejected")),
    Promise.resolve("first"),
  ]);
  assertEquals(result, "first");
});

Deno.test("any() rejects when all promises reject", async () => {
  await assertRejects(() =>
    any([
      Promise.reject(new Error("rejected")),
      Promise.reject(new Error("rejected")),
      Promise.reject(new Error("rejected")),
    ]), AggregateError);
});

Deno.test("any() rejects empty array", async () => {
  await assertRejects(() => any([]), AggregateError);
});

Deno.test("any() handles callables", async () => {
  const result = await any([
    Promise.reject("rejected"),
    Promise.resolve()
      .then(() => Promise.resolve("delayed")),
    Promise.resolve("first"),
  ]);
  assertEquals(result, "first");
});

Deno.test("any() rejects all rejecting callables", async () => {
  const array = [
    () => Promise.reject(new Error("rejected")),
    () => Promise.reject(new Error("rejected")),
    () => Promise.reject(new Error("rejected")),
  ];
  await assertRejects(() => any(array), AggregateError);
});

Deno.test("any() handles iterable of promises", async () => {
  function* generator() {
    yield () =>
      Promise.resolve()
        .then(() => Promise.resolve("delayed"));
    yield () => Promise.resolve("first");
  }
  const result = await any(generator());
  assertEquals(result, "first");
});

Deno.test("any() handles iterable to promises map", async () => {
  function* generator() {
    yield "delayed";
    yield "rejected";
    yield "first";
  }
  const result = await any(
    generator(),
    (x) =>
      x === "delayed"
        ? Promise.resolve().then(() => Promise.resolve(x))
        : x === "rejected"
        ? Promise.reject(x)
        : Promise.resolve(x),
  );
  assertEquals(result, "first");
});

Deno.test("any() rejects all rejecting iterable", async () => {
  function* generator() {
    yield "rejected";
    yield "rejected";
    yield "rejected";
  }
  await assertRejects(
    () => any(generator(), (x) => Promise.reject(x)),
    AggregateError,
  );
});
