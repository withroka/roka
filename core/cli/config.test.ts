import { config } from "@roka/cli/config";
import { assertEquals } from "@std/assert";

Deno.test("config() stores values", async () => {
  type ConfigType = { foo: string; bar: string };
  using cfg = config<ConfigType>({ path: ":memory:" });
  await cfg.set({ foo: "value_foo", bar: "value_bar" });
  assertEquals(await cfg.get(), { foo: "value_foo", bar: "value_bar" });
});

Deno.test("config() sets values partially", async () => {
  type ConfigType = { foo: string; bar: string };
  using cfg = config<ConfigType>({ path: ":memory:" });
  await cfg.set({ foo: "value_foo" });
  assertEquals(await cfg.get(), { foo: "value_foo" });
  await cfg.set({ foo: "value_foo", bar: "value_bar" });
  assertEquals(await cfg.get(), { foo: "value_foo", bar: "value_bar" });
});

Deno.test("config() isolates multiple configs", async () => {
  type ConfigType = { foo: string; bar: string };
  using cfg1 = config<ConfigType>({ path: ":memory:" });
  using cfg2 = config<ConfigType>({ path: ":memory:" });
  await cfg1.set({ foo: "value_foo" });
  await cfg2.set({ bar: "value_bar" });
  assertEquals(await cfg1.get(), { foo: "value_foo" });
  assertEquals(await cfg2.get(), { bar: "value_bar" });
});

Deno.test("config() clears values", async () => {
  type ConfigType = { foo: string; bar: string };
  using cfg = config<ConfigType>({ path: ":memory:" });
  await cfg.set({ foo: "value_foo", bar: "value_bar" });
  await cfg.clear();
  assertEquals(await cfg.get(), {});
});

Deno.test("config() stores numbers", async () => {
  type ConfigType = { foo: number };
  using cfg = config<ConfigType>({ path: ":memory:" });
  await cfg.set({ foo: 5 });
  assertEquals(await cfg.get(), { foo: 5 });
});

Deno.test("config() stores booleans", async () => {
  type ConfigType = { foo: boolean };
  using cfg = config<ConfigType>({ path: ":memory:" });
  await cfg.set({ foo: true });
  assertEquals(await cfg.get(), { foo: true });
});

Deno.test("config() stores objects", async () => {
  type ConfigType = { foo: { bar: { baz: string } } };
  using cfg = config<ConfigType>({ path: ":memory:" });
  await cfg.set({ foo: { bar: { baz: "value" } } });
  assertEquals(await cfg.get(), { foo: { bar: { baz: "value" } } });
});
