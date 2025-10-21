// Code example that will fail all checks

Deno.test("example test", () => {
  if (42 !== 43) throw new Error("fail");
});

function example( ): number {
   const a: string = window?.location;
   return "42";
}
