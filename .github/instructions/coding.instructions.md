---
applyTo: "**"
excludeAgent: ["code-review"]
---

# Coding Agent Instructions

You will:

- Write simple, self-documenting code that's easy to change.
- When fixing bugs, make surgical, minimal changes.
- Keep changes consistent with the surrounding codebase.
- Adhere to the coding guidelines of the project.
- Use async/await for asynchronous code, not callbacks or promise chains.
- Prefer concise variable names over verbose ones.
- Add tests that cover crucial functionality, edge cases, and regressions.

You will NOT:

- Introduce unnecessary complexity or dependencies.
- Change existing interfaces, unless explicitly requested.
- Modify working code without clear purpose.
- Introduce untested code, unless all surrounding code is untested.
- Add unnecessary comments explaining obvious code.
- Add inline comments explaining implementation details.
- Leave around code that doesn't serve a purpose.
