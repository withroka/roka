## http@0.3.1

- 🐛 return last response on max retry attempts (#651)

## testing@0.3.1

- 🐛 determine mock mode once (#649)

## cli@0.3.0

- ✨ add terminal-aware `console` module (#644)
- 🐛 don't create a config file if config is in-memory (#261)
- 🐛 make types not disposable, but functions return disposable (#248)

## forge@0.2.1

- 🐛 fix broken changelog URLs for new packages (#638)

## assert@0.1.0

- ✨ `assertSameElements` function to compare arrays without order (#287)
- ✨ add `assertArrayObjectMatch` function (#236)
- 🐛 export interface types (#294)
- 🐛 handle reoccurring elements in `assertSameElements` (#289)

## async@0.3.0

- ✨ implement `any()` function to return first resolved result (#266)
- 🐛 validate `concurrency` as positive integer (#627)
- 🐛 validate number options (#345)
- 🐛 remove pool of async generators (#284)

## config@0.1.0

- ✨ support file URLs (#599)

## deno@0.1.0

- ✨ support file URLs (#599)
- ✨ test name filter (#485)
- ✨ deno command interface for various operations (#340)
- 🐛 treat empty coverage report as non-fatal (#622)
- 🐛 handle intermittent coverage failures (#614)
- 🐛 disable permission prompts on compile (#583)
- 🐛 disable Rust backtrace (#553)
- 🐛 make compile args to work with or without "--" (#529)
- 🐛 handle stacked type-check errors (#526)
- 🐛 remove temp files after use (#499)
- 🐛 filesystem hygiene (#498)
- 🐛 handle nested code blocks (#497)
- 🐛 return line number on fmt reports (#496)
- 🐛 fix test flakiness due to coverage logs (#495)
- 🐛 report file errors instead of throwing (#489)
- 🐛 report missing files instead of throwing (#487)
- 🐛 more robust location shifts (#467)
- 🐛 report coverage generation errors (#381)
- 🐛 ensure `Deno` path is always absolute (#360)
- 🐛 structured args in error messages (#353)

## fs@0.1.0

- ✨ support file URLs (#599)
- ✨ `ignore` option for `find` to ignore paths (#325)
- ✨ `find()` files and directories recursively (#307)
- ✨ add tempDirectory({ chdir: true }) to switch to the created directory until
  disposal (#285)
- ✨ move `tempDirectory` from testing to fs (#260)
- 🐛 validate number options (#345)
- 🐛 use std library instead of `node:path` (#322)
- 🐛 make `find()` return all files when not filtering by type (#313)

## git@0.4.0

- ✨ use `Remote` objects for all relevant operations (#410) 💥
- 🐛 rename `commit` to `target` as tag creation target (#366) 💥
- 🐛 create a new directory with `clone()`, much like standard git (#358) 💥
- ♻️ rename `git({ cwd })` option to `git({ directory })` (#595) 💥
- ♻️ merge `git().diff.status` and `git.index.status()` (#514) 💥
- ♻️ updated `Git` interface (#388) 💥
- ✨ `git().tag.list({ reverse })` (#631)
- ✨ `conventional()` commit details from only commit message (#611)
- ✨ date sorting for `git().tag.list()` (#607)
- ✨ `git().log({ sort })` and `git().log({ reverse })` (#606)
- ✨ add date configuration (#605)
- ✨ `since` and `until` for `git().log()` (#604)
- ✨ `rebase.onto({ dates })` (#603)
- ✨ support `shallow-since` for fetch, pull, and clone (#602)
- ✨ expose timezones in attribution (#601)
- ✨ allow setting all commit and tag attribution fields (#600)
- ✨ support file URLs (#599)
- ✨ expose commit and tag dates (#596)
- ✨ support BREAKING commit type (#582)
- ✨ `git.file.text()` and `git.file.json()` (#577)
- ✨ `git.merge.base()` (#562)
- ✨ config validation (#557)
- ✨ add follow option to commit.log() (#556)
- ✨ add `mainline` option to cherry-pick and revert (#546)
- ✨ add `empty` and `reapplyCherryPicks` options to rebase (#545)
- ✨ revert config and test (#543)
- ✨ `git().revert.*` (#542)
- ✨ `git().cherrypick.*` (#540)
- ✨ `git().rebase.*` (#537)
- ✨ rename `unified` to `context` for diff operations (#533)
- ✨ rename `git().commit.log({ maxCount })` to `limit` (#532)
- ✨ `git().merge.*` (#531)
- ✨ diff stats (#524)
- ✨ add target option for config operations (#509)
- ✨ types for `branch.<name>.*` and `remote.<name>.*` configs (#507)
- ✨ extended config schema (#506)
- ✨ `git().branch.delete({ type: "remote" })` (#505)
- ✨ schema-based config with flat string keys (#502)
- ✨ `git().tag.get()` (#476)
- ✨ merge filtering for `branch.list()` and `tag.list()` (#471)
- ✨ `path` option commit `create()` and `amend()` (#461)
- ✨ `pickaxe` option for diff and commit log filtering (#460)
- ✨ split `remote` into `remote`, `sync`, and `admin` (#458)
- ✨ simplify remote crud (#457)
- ✨ remote branch pruning (#455)
- ✨ `git().remote.push({ delete })` (#454)
- ✨ accept multiple tags with `git().remote.push({ tag })` (#453)
- ✨ `git().remote.push({ force: "with-lease" })` (#451)
- ✨ `git.remote.push({ tags: "follow" })` (#447)
- ✨ simplified `push()` interface that can also push tags (#445)
- ✨ allow `fetch()`, `pull()`, and `push()` by URL (#441)
- ✨ `git().remote.fetch({ shallow })` (#440)
- ✨ add upstream tracking for fetch and pull (#439)
- ✨ multiple remote support for fetch() and pull() (#438)
- ✨ `git().remote.unshallow()` (#437)
- ✨ `git().remote.fetch({ filter })` (#436)
- ✨ `git().remote.fetch({ shallow })` (#435)
- ✨ `Remote.filter` to expose filter for partial clones (#434)
- ✨ `--separate-git-dir` for init and clone (#429)
- ✨ accept `Remote` in `git().remote.clone()` (#430)
- ✨ additional `git().init()` flags (#431)
- ✨ `git().remote.clone({ tags })` (#432)
- ✨ `git().remote.clone({ filter })` (#424)
- ✨ `git().remote.clone({ shallow })` (#422)
- ✨ no checkout mode for `git().remote.clone({ branch })` (#420)
- ✨ `git().branch.switch({ orphan })` (#421)
- ✨ more options for `git().remote.clone({ local })` (#419)
- ✨ expose commit graph with `Commit.parent` (#418)
- ✨ `tempRepository({ remote })` (#409)
- ✨ `tempRepository({ branch })` (#408)
- ✨ `git().init({ config })` (#407)
- ✨ `git.init({ directory })` (#403)
- ✨ `git().index.restore()` (#398)
- ✨ `git().branch.reset()` (#400)
- ✨ `git().commit.get()` (#399)
- ✨ `git().branch.switch()` (#394)
- ✨ add `git().remote.fetch()` (#393)
- ✨ `git().tag.delete()` (#391)
- ✨ `git().commit.amend()` (#390)
- ✨ `git().remote.remove()` (#389)
- ✨ upstream tracking for branches (#387)
- ✨ `git().branches.copy()` (#386)
- ✨ `git().branches.move()` (#385)
- ✨ return `Branch` object from branch methods (#384)
- ✨ include `status`, `mode` and rename/copy information in `Patch` (#376)
- ✨ support file type changes in `git().index` and `git().diff` (#375)
- ✨ copy detection for `git().index` and `git().diff` (#373)
- ✨ `git().index.move()` (#372)
- ✨ `DiffOptions.rename` to disable rename detection (#371)
- ✨ `chdir` option for `tempRepository` (#369)
- ✨ `git diff` operations with `git().diff` (#367)
- ✨ `Branch` object type (#362)
- ✨ add `matching` option to `ignore.check` for non-matching paths (#323)
- ✨ add `git().ignore.check()` to check paths against gitignore patterns (#320)
- 🐛 handle `"unmerged"` status (#558)
- 🐛 make `git()` work for older git versions (#549)
- 🐛 make commit parents array (#530)
- 🐛 handle custom column configuration (#521)
- 🐛 normalize config keys to camelCase (#510)
- 🐛 make init shared test environment-independent (#477)
- 🐛 prevent nested tags by peeling tag targets to commits (#479)
- 🐛 detect deleted upstream branches (#474)
- 🐛 fix regex whitespace pattern in conventional commit parser (#470)
- 🐛 support conflicting local and remote branch names (#469)
- 🐛 allow `all` flag to be any boolean for `fetch()` and `pull()` (#450)
- 🐛 accept string URLs (#433)
- 🐛 make `git().branch.reset()` work on detached head (#415)
- 🐛 ignore missing output with `git().remote.clone({ directory })` (#413)
- 🐛 correct command on error (#411)
- 🐛 disable colors for all commands that support it (#405)
- 🐛 pass paths after flag separator (#404)
- 🐛 ensure `Git` path is always absolute (#359)
- 🐛 consistent pluralization of `path` options (#357)
- 🐛 structured args in error messages (#353)

## github@0.3.0

- ♻️ use URL objects for url fields (#593) 💥
- ✨ support file URLs (#599)

## html@0.1.0

- ✨ `plain()` function to return plain text from HTML (#263)
- 🐛 fix export of `plain` (#278)

## http@0.3.0

- ♻️ export from `http/json` directly (#328) 💥
- ♻️ remove graphql module and urql dependencies (#327) 💥
- ✨ implement `RequestOptions` for JSON client (#240)
- ✨ implement cache headers for `request()` (#238)
- 🐛 omit output headers when headers are ignored (#244)
- 🐛 add types to queries (#243)
- 🐛 make `client()` accept `URL` (#242)

## maybe@0.1.0

- ✨ `maybe()` ensures `errors` is is not empty on error (#281)
- ✨ serve `AggregateError` causes as multiple errors (#280)
- ✨ add the `maybe()` function (#251)

## testing@0.3.0

- ✨ support file URLs (#599)
- ✨ negate color and ansi stripping options in `fakeConsole()` (#336)
- ✨ ignore ANSI codes in `fakeConsole()` with option to not ignore (#334)
- ✨ `fakeCommand` for testing process spawns (#316)
- ✨ `fakeArgs()` to provide script arguments for testing (#273)
- ✨ `fakeEnv()` to provide environment variables in tests (#272)
- ✨ move `tempDirectory` from testing to fs (#260)
- 🐛 mimic console output for non-string input with `fakeConsole` (#363)
- 🐛 make sure fake objects are not recursively stubbed (#274)
- 🐛 make `FakeConsole` not `Disposable` (#271)
- 🐛 disable color in `fakeConsole()` by default (#250)
- 🐛 test `mock()` writes mocks on `unload` event (#249)
- 🐛 make types not disposable, but functions return disposable (#248)

## flow@0.1.0

- ✨ make test output stand out (#492)
- ✨ print test output (#486)
- ✨ test name filter (#485)
- ✨ stdin formatting (#468)
- ✨ `flow --doc` to control doc linting (#448)
- ✨ check only changes since main by default (#368)
- ✨ fast feedback development tool (#333)
- 🐛 cleaner CLI outputs (#591)
- 🐛 diff against common ancestor with main (#559)
- 🐛 proper cursor handling (#504)
- 🐛 tidy debug output (#491)
- 🐛 keep cursor at last printed character (#490)
- 🐛 prevent no file errors when running all checks (#382)

## forge@0.2.0

- ✨ support file URLs (#599)
- ✨ read versions beyond the first tag (#579)
- ✨ title checking for PRs (#568)
- ✨ support wildcard scopes in commit matching (#564)
- ✨ use permissions from standard Deno config (#256)
- ✨ support submodules and `unstable` in scopes (#234)
- 🐛 migration releases (#635)
- 🐛 show relative paths for modules in list output (#613)
- 🐛 cleaner CLI outputs (#591)
- 🐛 allow empty matches (#589)
- 🐛 handle empty matches (#588)
- 🐛 check standalone version before local version (#587)
- 🐛 validate compile config (#586)
- 🐛 determine config version with best effort (#585)
- 🐛 skip git calls if run permission not given (#584)
- 🐛 mark unreleased changelog entries (#581)
- 🐛 reject bump if deno.json is dirty (#576)
- 🐛 use head hash for pre-release versions (#573)
- 🐛 fail if no packages are matched (#571)
- 🐛 compact output for packages without exports (#570)
- 🐛 fix `release` not working from outside the repo (#377)
- 🐛 validate number options (#345)
- 🐛 support workspace path patterns (#230)

## git@0.3.1

- 🐛 skip ignored files by default in `git().index.status()` (#225)

## git@0.3.0

- ✨ `git().index.status()` (#223)

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
