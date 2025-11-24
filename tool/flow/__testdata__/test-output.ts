// Code example that generates output

console.log("pre-test output");
Deno.test("test1", () => {});
Deno.test("test2", () => { console.log("test output"); });
Deno.test("test3", () => {});
addEventListener("unload", () => { console.log("post-test output"); });
