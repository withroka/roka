## http@0.2.2

- 🐛 export `gql` of `urlq` from `graphql/client` (#220)

## forge@0.1.5

- 🐛 sort commits by importance in changelogs (#217)
- 🐛 add commit hash when there is no pull request number (#215)

## forge@0.1.4

- 🐛 do not try to release package at version 0.0.0 (#212)
- 🐛 pad single width emoji on tty (#211)

## forge@0.1.3

- 🐛 determine JSR version from stack trace (#205)

## forge@0.1.2

- 🐛 use JSR version when running from JSR (#200)
- 🐛 rename `[default]` module to `(default)` (#199)

## forge@0.1.1

- 🐛 `deno fmt` changelog files (#197)
- 🐛 mention version number in title if bumping a single package (#196)
- 🐛 use full commit summaries in bump commits (#194)
- 🐛 create pull requests published by default (#193)

## http@0.2.1

- 🐛 revert back to the intended export map (#190)

## forge@0.1.0

- 🐛 rename `Package.module` to `Package.name` (#103) 💥
- 🐛 do not export the upload symbol (#101) 💥
- ♻️ rename `app` module to `version` to match its exported symbol (#105) 💥
- ✨ cleaner release warning (#172)
- ✨ add description text to `forge --help` (#163)
- ✨ refined workflows (#150)
- ✨ add support for target architectures in compile config (#146)
- ✨ `testing` objects can initialize their git repositories (#141)
- ✨ better support for simple repos (#140)
- ✨ cleaner error output (#138)
- ✨ prune release flow (#131)
- ✨ changelog generation (#130)
- ✨ simplify `forge` interfaces (#126)
- ✨ add examples to CLI help (#109)
- ✨ install message (#102)
- ✨ `forge list --modules` (#87)
- ✨ add filtering to `workspace()` (#78)
- ✨ options for `version` (#67)
- ✨ allow permission prompts (#66)
- ✨ expose listing as a separate command (#65)
- ✨ combine all scripts into one (#29)
- 🐛 relative imports for peer dependencies (#187)
- 🐛 fix module name in docs (#186)
- 🐛 nicer output for `forge list` (#167)
- 🐛 `version()` returns single line string (#165)
- 🐛 branch hygiene for bump (#155)
- 🐛 handle pre-releases (#144)
- 🐛 fail early for invalid package version (#142)
- 🐛 simpler error messages with `cause` (#136)
- 🐛 skip commit types that are not fixes or features (#127)
- 🐛 simplify `workspace()` options to use a single directory parameter (#77)
- 🐛 `workspace()` returns leaf packages only (#76)
- 🐛 filter packages to release (#63)

## http@0.2.0

- 🐛 never re-export symbols (#95) 💥
- ♻️ move exported symbols for json and graphql clients their respective
  submodule paths (#108) 💥
- ♻️ rename json and graphql client methods (#97) 💥
- ✨ option to ignore headers in `fetchMock` (#90)
- ✨ improved interfaces (#42)
- 🐛 try re-exporting `request` from default module (#184)
- 🐛 simpler http export map (#182)
- 🐛 make `RequestError.status` optional (#119)

## async@0.2.0

- 🐛 refine `pool` interface (#81) 💥
- ✨ add `pooled` function to `pool` module (#83)
- ✨ simplified pool (#38)

## cli@0.2.0

- 🐛 fix main module export (#96) 💥
- ✨ `version()` (#53)
- ✨ simplified config interface (#45)

## git@0.2.0

- ✨ show git command on error (#153)
- ✨ support pre-releases in version sort (#143)
- ✨ make `conventional()` more lenient (#139)
- ✨ more branch operations (#69)
- ✨ testing submodule (#50)
- ✨ add git().head() (#46)
- 🐛 simpler error messages with `cause` (#136)
- 🐛 accept empty cwd (#129)
- 🐛 make `log()` ignore empty revision range (#128)
- 🐛 filter out detached state from branch list (#74)
- 🐛 fix race condition when configuring git (#71)
- 🐛 skip network during git.remotes.get (#59)
- 🐛 rename `tempRepo()` to `tempoRepository` (#56)
- 🐛 rename `git().addRemote()` to `git.remoteAdd()` (#54)
- 🐛 implement `conventional` to spec (#52)
- 🐛 remove `Git.directory` (#51)

## github@0.2.0

- ♻️ rename test objects to "fake" (#100) 💥
- ✨ prune release flow (#131)
- ✨ add `testing` submodule (#68)
- 🐛 simplify interfaces (#60)

## testing@0.2.0

- 🐛 never re-export symbols (#95) 💥
- ✨ formatted output from `FakeConsole` (#164)
- ✨ snapshot like options for mocks (#33)
- ✨ snapshot like status output for fetchMock (#32)
- 🐛 `mock()` explains when it lacks write permission (#178)
- 🐛 handle newlines in `FakeConsole` output trim (#166)
- 🐛 support async revert for `mock` (#112)
- 🐛 support all types of `BodyInit` (#57)
- 🐛 tempDirectory().path() as function (#47)
- 🐛 show remove status only when updating mock file (#41)
- 🐛 fix mock error handling (#39)
- 🐛 dynamic import for mocks with file URL (#35)
- 🐛 cleaner stack trace on SuppressedError with mockFetch (#34)
- 🐛 generate formatted mocks (#31)

## forge@0.0.2

- 🐛 remove versions (#26)
- 🐛 fix import from package (#25)

## http@0.1.1

- 🐛 fix export map (#24)

## forge@0.0.1

- ♻️ split build package into a library and a tool (#21)

## package@0.1.0

- ♻️ split build package into a library and a tool (#21)

## async@0.1.0

- ✨ add async package (#11)

## cli@0.1.0

- ✨ add cli package (#10)

## git@0.1.0

- ✨ add git package (#6)
- 🐛 remove manual text escape (#17)

## github@0.1.0

- ✨ add github package (#8)

## http@0.1.0

- ✨ add http package (#9)

## testing@0.1.0

- ✨ add testing package (#2)
