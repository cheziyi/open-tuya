# Working in this repository

Everything a reader acts on is in [README.md](README.md). A decision that took
an argument to reach goes in [DESIGN.md](DESIGN.md); read it before changing
the code it covers.

## Instructions for agents

- **Put a standing instruction in this file, not in agent memory.** This file
  reaches every agent and every contributor; memory reaches one agent on one
  machine.
- **Write only rules that bind future work.** An instruction given for one task
  is carried out in that task and not recorded here, and so is the history of
  how a rule came about.

## Before you write code

- **Check the dependency's defaults first.** Read what a library or the
  platform already does before writing code to do it.
- **KISS and YAGNI.** Keep it thin. Push test machinery into the test file
  rather than adding an injection point to production code.
- **Delete anything you did not use**, including a folder's `.gitkeep` once the
  folder holds a file.
- **Add a dependency only when it earns more than it replaces.**
- **No configuration value without a reason.** Keep a tool's default unless a
  specific requirement forces the change, and write the reason in a comment
  beside the value. Where the format takes no comment, such as `package.json`,
  record it in `DESIGN.md`.
- **A package never reads the environment.** Nothing under a package's `src/`
  reads `process.env` or picks up configuration on the caller's behalf: the
  caller passes it in, cloud credentials included.

## Sources

Every protocol fact in this repository comes from an open-source Tuya project
listed in [README.md](README.md#credits). A protocol fact is what a device or
the cloud sends or expects: a byte layout, a constant, a command number, a
field name, the order of messages, a limit a device enforces.

- **Decide an implementation choice on engineering grounds, never by counting
  sources.** What this library does with what it receives is its own design:
  its API, what it does with a bad frame, its timeouts, retries and connection
  handling. Weigh it against best practice and this repository's style, and
  record the reason in `DESIGN.md`. The sources show what is possible; they do
  not vote.
- **Credit the source of every protocol fact.** Link the commit or pull
  request that introduced it, as a permalink pinned to a commit SHA: a link to
  a branch moves. The link goes in the commit message and the pull request
  description, beside the code as a `// Source:` comment, and in a catalog
  entry's sources.
- **Build only the protocol facts a source shows.** List anything no source
  pins down in `UNSUPPORTED.md` with what is unknown; never ship a guess.
- **Where sources disagree on a protocol fact, take what most of them agree
  on.** A fork counts
  only for code it changed, and a project that copies another adds nothing. On
  a tie, take the most recent change. Record the choice and the sources on each
  side in `DESIGN.md`.
- **Adapt code only from a source the README lists as MIT.** Add its copyright
  line to the source's row in [README.md](README.md#credits). From any other
  source take only facts: byte layouts, constants, command numbers and message
  order. Write that code fresh; never translate it line by line.
- **Read a source in `reference/`**: `pnpm clone-reference` clones or
  updates every project in [README.md](README.md#credits) there. The folder is
  git-ignored. Cite the source on GitHub, never the local copy.
- **Read `reference/AGENTS.md` as well, when it exists.** It holds notes on
  the reference material on this machine.
- **Add a new source to the README's Credits table**, with its license, before
  citing it: `pnpm clone-reference` reads its list from that table.

## Packages

| Package | Folder | Holds | Depends on |
| --- | --- | --- | --- |
| `@open-tuya/core` | `packages/core/` | The types a caller passes and receives, in the packages' own terms, and the errors | Nothing |
| `@open-tuya/local` | `packages/local/` | The LAN protocol and discovery | `core` |
| `@open-tuya/cloud-developer` | `packages/cloud-developer/` | The Tuya developer platform API, signed in with a project's access ID and secret: device lists with local keys, reading and writing data points | `core` |
| `@open-tuya/cloud-app` | `packages/cloud-app/` | The Tuya cloud as the Smart Life app reaches it, signed in by QR code: device lists with local keys, reading and writing data points | `core` |
| `@open-tuya/devices` | `packages/devices/` | The device catalog: which data point of which product controls what | `core` |
| `@open-tuya/simulators` | `packages/simulators/` | Devices as LAN servers, for tests: how each answers, and what it holds | `core` |
| `open-tuya` | `packages/open-tuya/` | `createTuyaClient`, which reaches a device over the routes the caller sets up, the LAN and either cloud, in the order the caller gives, and names data points from the catalog; it re-exports the other packages | Every package but `simulators` |

- **Import only from a package listed under "Depends on".** Adding a package
  there is a design change: record it in [DESIGN.md](DESIGN.md#packages).
- **Keep wire field names and byte layouts out of `core` and `open-tuya`.**
  Each belongs in the package that speaks that wire.
- **Install a tool every package uses at the root**, and a runtime dependency
  in the package that imports it.

## `@open-tuya/local`

| Folder | Holds | Never holds |
| --- | --- | --- |
| `src/protocol/` | Framing, each version's encryption and session key negotiation, as pure functions | I/O |
| `src/discovery/` | Listening for and decoding UDP broadcasts | A TCP connection |
| `src/` | The TCP connection, and the client that sends commands over it | A byte layout |

## `@open-tuya/simulators`

- **Write a simulator's protocol code fresh, from the sources.** A simulator
  built on `@open-tuya/local` agrees with it even when both are wrong:
  [DESIGN.md](DESIGN.md#simulators) says why.
- **Test encoding against a captured frame** as well, from a source's tests or
  a real device: two implementations written from the same misread source
  still agree.

## `@open-tuya/devices`

| Folder | Holds |
| --- | --- |
| `src/catalog/` | One file per device, generated from tuya-local: the products it matches, each data point and what it controls, and the tuya-local commit it came from |
| `src/` | The type of a catalog entry, and looking an entry up |
| `scripts/` | The script that converts tuya-local's device files into `src/catalog/` |

- **Never edit a file in `src/catalog/` by hand.** Change the import script
  and run it again: the next run overwrites a hand edit.
- **Add a device to tuya-local, not here**, then run the import script: one
  catalog serves both communities.
- **Describe a data point in the vocabulary of the control it drives**:
  `targetTemperatureInC`, not `dp 2`, and not a Home Assistant entity or
  device class.
- **List a device the script cannot convert in `UNSUPPORTED.md`**, with the
  tuya-local feature it uses. Never convert part of a device.

## Dependencies, errors and tests

- **Inject only an I/O seam**, such as a connection or an HTTP client, through
  the constructor as a `private readonly` parameter, and build the real one in
  the `create*` function. A protocol function takes a nonce or an IV as an
  argument. Never inject a clock, a random source or a logger: use fake timers
  in the test.
- **Throw a `TuyaError` with a `code`**, and pass the error it stands for as
  `cause`. Assert the `code` in a test, not the message:
  [DESIGN.md](DESIGN.md#errors) says why.
- **Put a test in `__tests__/` beside the code it tests**, a fake in
  `__tests__/mocks/` and captured bytes in `__tests__/fixtures/`. Fake a seam
  by hand; never `vi.mock` a module of this repository.

## Comments

- **No comments except gotchas and sources.** A comment explains behaviour the
  reader cannot see. A comment that restates the line below it gets deleted.
- **Write a gotcha on an export or its public member as `/** */`, not `//`**:
  a caller's editor shows it. Write it as prose, without `@param` or
  `@returns` tags.
- **State an optional option's default in its `/** */`**, as a sentence:
  `Defaults to 10000.` An option that forwards to another type's field repeats
  the value and links to that field for the rest: a caller's editor shows only
  the comment on the option they hover.
- **Three markers, each with its own meaning.** Capitalise each one, and write
  the text after it as a full sentence.
  - `// Source:` links the commit or pull request a protocol fact comes from, and
    says what it took when the link alone does not.
  - `// TechDebt:` marks a shortcut taken because doing it properly is not worth
    it today. The marker carries its own reasoning, and that reasoning never
    moves to `DESIGN.md`: what was cut short, why that is acceptable now, and
    what pays it back.
  - `// TODO:` is work not yet done, due as a next step.

## Names

- **Abbreviate only where the abbreviation is well known.** `Info`, `Config`,
  `min`, `max`, and an initialism such as `UUID`, `MAC`, `URL` or `IP` are.
  Write any other word in full: `parameters`, not `params`; `options`, not
  `opts`; `dataPoints`, not `dps`. A name Tuya's protocol defines keeps its
  spelling, such as `devId`, `gwId` or `dps`.
- **Name a file for what it exports, and let its folder carry the rest**:
  `cloud/client.ts`, not `cloud/cloudClient.ts`. Keep the name singular unless
  the export's own name is plural.
- **Prefix an export with `Tuya` when its bare name is a word the caller's own
  code would also use**: `TuyaClient`, `TuyaDevice`, `TuyaError`. Leave a name
  that is already specific bare.
- **A function is its verb plus the bare noun**: `discoverDevices`,
  `parseFrame`. Its argument and return types already say `Tuya`.
  `createTuyaClient` is the one exception: it is the package's entry point,
  and `createClient` is a name other libraries export.
- **An implementation puts its variant in front of the interface's full name**:
  `LocalTuyaClient` and `CloudTuyaClient` for `TuyaClient`.
- **An export that holds for one protocol version names the version**:
  `encryptV35Payload`. A caller imports an export by its name alone, so the
  name carries what the folder would.
- **A constant holding several values is plural**, and a list of a type's
  values takes the type's name: `PROTOCOL_VERSIONS` for `ProtocolVersion`.
- **An options type is its function's or class's name plus `Options`**:
  `CreateTuyaClientOptions`.
- **A name carrying a unit spells it after `In`**. Milliseconds abbreviates to
  `Ms` and degrees Celsius to `C`: `timeoutInMs`, `DEFAULT_TIMEOUT_IN_MS`,
  `targetTemperatureInC`.

## Version each package with semver

Add a changeset to each pull request that changes a published package: run
`pnpm changeset`, pick each changed package and its bump, and write one line a
caller would read in the changelog. Never edit a `version` or a `CHANGELOG.md`
by hand: the Version Packages pull request sets them, and merging it publishes.
Pick the bump by what the change does to everyone who installs that package:

| The change | Bump | Example |
| --- | --- | --- |
| A bug fix, a corrected catalog entry, or anything a caller's code survives untouched | Patch | `1.4.2` → `1.4.3` |
| A capability added: a new export, a new optional field, a new catalog entry | Minor | `1.4.2` → `1.5.0` |
| A caller has to be edited: an export removed or renamed, a signature changed, an optional field made required, a catalog entry removed or renamed | Major | `1.4.2` → `2.0.0` |

Before `1.0.0`, a change that makes callers edit their code bumps the minor
(`0.13.0` → `0.14.0`), and everything else bumps the patch.

## Pull requests, commits, and comments

- **Say who does what, in order.** "The socket times out, so the client throws
  a `TuyaError` and retries over the cloud", never "a timeout falls back".
- **Call a thing what the code calls it.** A buzzword or metaphor makes the
  reader translate it before they can act on it. Name the function, the
  command, or the check.
- **A person merges.** Never merge a pull request unless told to merge that
  one, even when it is green and approved. Stop at ready to merge, and say which
  pull request to merge and what it unblocks.
- **Resolve a review thread once its fix is pushed**, with the GraphQL
  `resolveReviewThread` mutation. Leave a thread open only while it is
  unaddressed or waits on a person's decision.

## Documents

- **Say what to do, not what the project is.** Write only what a reader acts
  on: how to install it, how to call it, what it answers, what breaks. Prefer a
  table or a code block to a paragraph, and cut any sentence the reader would
  not miss.
- **The instruction comes first, the reason second.** Open on the imperative
  and put the reason behind a colon or a dash. The reason stays; only its
  position changes.
- **A heading names what is under it.** "Caching", not "What it is careful
  about". A table column is `Holds`, `Meaning`, or `Why`, never `Is`.
- **Delete rather than rephrase** a comment restating the command beside it, an
  example repeating an earlier one, a consequence anyone already knows, an
  aphorism standing where an instruction belongs, and a generic caution in
  place of the specific trap.
- **One fact has one home.** Explain it where it is decided, and link to that
  from everywhere else.
- **Record a decision where it will be read again.** A decision whose
  alternative was weighed and rejected goes in `DESIGN.md`: what was chosen,
  what was rejected, and the fact that decided it. The README links to it in
  one line and carries none of the argument.
