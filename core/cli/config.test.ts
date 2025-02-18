import { Config } from "@roka/cli/config";
import { assertEquals } from "@std/assert";

Deno.test("Config stores values", async () => {
  type ConfigType = { foo: string; bar: string };
  using config = new Config<ConfigType>({ path: ":memory:" });
  await config.set({ foo: "value_foo", bar: "value_bar" });
  assertEquals(await config.get(), { foo: "value_foo", bar: "value_bar" });
});

Deno.test("Config sets values partially", async () => {
  type ConfigType = { foo: string; bar: string };
  using config = new Config<ConfigType>({ path: ":memory:" });
  await config.set({ foo: "value_foo" });
  assertEquals(await config.get(), { foo: "value_foo" });
  await config.set({ foo: "value_foo", bar: "value_bar" });
  assertEquals(await config.get(), { foo: "value_foo", bar: "value_bar" });
});

Deno.test("Config isolates multiple configs", async () => {
  type ConfigType = { foo: string; bar: string };
  using config1 = new Config<ConfigType>({ path: ":memory:" });
  using config2 = new Config<ConfigType>({ path: ":memory:" });
  await config1.set({ foo: "value_foo" });
  await config2.set({ bar: "value_bar" });
  assertEquals(await config1.get(), { foo: "value_foo" });
  assertEquals(await config2.get(), { bar: "value_bar" });
});

Deno.test("Config clears values", async () => {
  type ConfigType = { foo: string; bar: string };
  using config = new Config<ConfigType>({ path: ":memory:" });
  await config.set({ foo: "value_foo", bar: "value_bar" });
  await config.clear();
  assertEquals(await config.get(), {});
});

Deno.test("Config stores numbers", async () => {
  type ConfigType = { foo: number };
  using config = new Config<ConfigType>({ path: ":memory:" });
  await config.set({ foo: 5 });
  assertEquals(await config.get(), { foo: 5 });
});

Deno.test("Config stores booleans", async () => {
  type ConfigType = { foo: boolean };
  using config = new Config<ConfigType>({ path: ":memory:" });
  await config.set({ foo: true });
  assertEquals(await config.get(), { foo: true });
});

Deno.test("Config stores objects", async () => {
  type ConfigType = { foo: { bar: { baz: string } } };
  using config = new Config<ConfigType>({ path: ":memory:" });
  await config.set({ foo: { bar: { baz: "value" } } });
  assertEquals(await config.get(), { foo: { bar: { baz: "value" } } });
});
