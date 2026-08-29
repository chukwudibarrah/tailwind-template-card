# Changelog

Notable changes to **tailwind-template-card**.

This project is a fork of [usernein/tailwindcss-template-card](https://github.com/usernein/tailwindcss-template-card),
whose last release was v3.1.1 in November 2023. Entries from v4.0.0 onwards are
this fork's; upstream's generated history is kept at the bottom for reference.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and
this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [4.1.2] - 2026-08-29

### Fixed

- Typing in the config editor no longer loses characters or jumps the caret to
  the start of the document. Config updates are debounced, so the `content`
  prop always trails the keystrokes; the effect mirroring it back into the
  editor fired with a stale value, replaced the whole document and reset the
  caret. Typing a class produced `d<div class="ro">` from
  `<div class="rounded-3xl">`. The editor now owns its content while focus is
  inside it, and adopts the prop only when focus is elsewhere.

## [4.1.1] - 2026-08-29

### Changed

- Closing a tag immediately before existing content now moves that content onto
  its own line at the current indent, instead of leaving it butted against the
  closing tag (`</div><div class=...`).

## [4.1.0] - 2026-08-29

### Added

- HTML tag handling in the config editor, restoring what the old Ace editor did.
  Typing `>` after an opening tag closes it and leaves the caret in the middle;
  Enter between `>` and `</` opens the element out and indents the caret. Void
  elements, self-closing tags and a `>` inside an attribute value are left to
  CodeMirror. Home Assistant's editor ships only the `yaml` and `jinja2`
  languages, so this is layered on the editor already loaded — transactions are
  dispatched as plain objects, avoiding a second CodeMirror in the bundle.

### Fixed

- The Bindings and Actions panels no longer float over the code. `ha-code-editor`
  styles its host with `display: block` only and lets CodeMirror size itself, so
  with real content it grew past its container and painted over its siblings. The
  editor is now capped and scrolls, with the panels in normal flow beneath it.
- Removed the daisyUI `collapse` wrapper around the content editor; being
  grid-based with `overflow: hidden` it fought the editor's height rather than
  containing it.
- Dropped `scrollbar-*` classes left behind by `tailwind-scrollbar`, which has no
  Tailwind v4 build and had been inert since it was removed.

### Changed

- Workflow actions moved off the deprecated Node 20 runtime.

## [4.0.1] - 2026-08-29

### Fixed

- Gradients, transforms, scale and shadow utilities rendered as nothing. Tailwind
  v4 implements them with registered custom properties, and browsers ignore
  `@property` when it arrives inside a shadow root's adopted stylesheets. Those
  rules are now registered once on the document and shared across cards.
- `npm ci` failed on a peer conflict between `eslint` and `@eslint/js`; local
  installs had been using `--legacy-peer-deps` and never surfaced it.

## [4.0.0] - 2026-08-29

First release of the fork. The card type is unchanged in effect — the upstream
`custom:tailwindcss-template-card` is registered as an alias, so existing
configurations and community examples keep working.

### Changed

- **Renamed** to `tailwind-template-card`, so it is not mistaken for the
  original.
- **Replaced Twind with real Tailwind CSS v4**, compiled in the browser. Twind
  was a Tailwind v3 reimplementation whose last npm publish was January 2023.
  The stock `@tailwindcss/browser` build only scans `document` and never shadow
  roots, so the card feeds candidates from the HTML it is about to render
  straight to Tailwind's `compile()` API.
- **daisyUI 5 is compiled in** as a Tailwind plugin and tree-shaken, replacing a
  3.2 MB fetch from a public CDN on every dashboard load.
- **The config editor uses Home Assistant's own `ha-code-editor`**, gaining entity
  autocompletion and the active theme, and dropping ~600 kB of bundled Ace.
- Replaced Headless UI's combobox — React-only, and its typings do not resolve
  under Preact — with a native Preact entity picker.
- Toolchain: Vite 4 to 8, TypeScript 5.9, ESLint 9 flat config,
  `custom-card-helpers` 2.0. Dropped lodash, axios, postcss and 100+ other
  packages. `preact/debug` no longer ships to production.
- Bundle: 976 kB (290 kB gzipped) to 790 kB (163 kB gzipped).

### Added

- `moreInfo()` in action scope, opening Home Assistant's entity dialog
  ([upstream #9](https://github.com/usernein/tailwindcss-template-card/issues/9)).
- `hold` (a press of 500 ms or more, suppressing the click that follows) and
  `contextmenu` action types.
- A browser-driven test suite.

### Fixed

- **The `render_template` subscription leak**
  ([upstream #11](https://github.com/usernein/tailwindcss-template-card/issues/11)).
  Upstream re-subscribed on every state update and never unsubscribed, so
  subscriptions accumulated for as long as a dashboard stayed open. There is now
  one subscription per template, closed on teardown.
- Entity tracking uses the dependency list Home Assistant reports for the
  template, replacing a scan of the whole state machine that silently missed
  entities used only in `actions`.
- Cards no longer copy every `<style>` from the document head into their shadow
  root, which duplicated Home Assistant's stylesheet per card and let its rules
  fight the user's utility classes
  ([upstream #6](https://github.com/usernein/tailwindcss-template-card/issues/6),
  [#8](https://github.com/usernein/tailwindcss-template-card/issues/8)).
- Action selectors match with `closest()`, so an action bound to a tile fires
  when a child element is tapped.
- Classes introduced by bindings (`type: class`, or markup injected via
  `type: html`) are compiled, via a second pass over the rendered DOM.

[4.1.2]: https://github.com/chukwudibarrah/tailwind-template-card/releases/tag/v4.1.2
[4.1.1]: https://github.com/chukwudibarrah/tailwind-template-card/releases/tag/v4.1.1
[4.1.0]: https://github.com/chukwudibarrah/tailwind-template-card/releases/tag/v4.1.0
[4.0.1]: https://github.com/chukwudibarrah/tailwind-template-card/releases/tag/v4.0.1
[4.0.0]: https://github.com/chukwudibarrah/tailwind-template-card/releases/tag/v4.0.0

---

# Upstream history

Kept verbatim from `usernein/tailwindcss-template-card`. It was generated by
`git-changelog-command-line` and stops at v2.1.0-1 — upstream never regenerated
it for v2.2 through its final release, v3.1.1. For anything after v2.1.0-1, see
[upstream's releases](https://github.com/usernein/tailwindcss-template-card/releases).

## v2.1.0-1 (2023-06-26)

### Features

-  add range to set debounceChangePeriod ([60472](https://github.com/usernein/tailwindcss-template-card/commit/60472ee31bb8672) Pauxis)  
-  change default theme to dark ([5709a](https://github.com/usernein/tailwindcss-template-card/commit/5709a0c8870d4c1) Pauxis)  

### Other changes

**v2.1.0-1**


[b81e8](https://github.com/usernein/tailwindcss-template-card/commit/b81e8f9ef6f4979) Pauxis *2023-06-26 05:12:44*


## v2.1.0-0 (2023-06-26)

### Other changes

**v2.1.0-0**


[1eaa9](https://github.com/usernein/tailwindcss-template-card/commit/1eaa9a51a537884) Pauxis *2023-06-26 04:22:42*


## v2.0.4-0 (2023-06-26)

### Features

-  add memoizer util and debounce everything ([18ccb](https://github.com/usernein/tailwindcss-template-card/commit/18ccb7225924249) Pauxis)  
-  add debounce utils ([6b8b6](https://github.com/usernein/tailwindcss-template-card/commit/6b8b6b238fc4d22) Pauxis)  
-  make bindings inputs functional ([98746](https://github.com/usernein/tailwindcss-template-card/commit/98746a424f1308c) Pauxis)  
-  customize scrollbar ([c8a21](https://github.com/usernein/tailwindcss-template-card/commit/c8a21a8bd0c0c37) Pauxis)  
-  use real tailwindcss ([31527](https://github.com/usernein/tailwindcss-template-card/commit/31527428f190855) Pauxis)  
-  add alert label and improve bindings latout ([92296](https://github.com/usernein/tailwindcss-template-card/commit/92296767654ace7) Pauxis)  
-  fix base colors and imrpove bindings layout ([4679a](https://github.com/usernein/tailwindcss-template-card/commit/4679a4170c5cb2a) Pauxis)  
-  make bindings functional ([1ba9b](https://github.com/usernein/tailwindcss-template-card/commit/1ba9bc2bbcb25a2) Pauxis)  
-  inherit theme from hass ([00e9b](https://github.com/usernein/tailwindcss-template-card/commit/00e9bd105bcff44) Pauxis)  
-  improve config and hide about from tabs ([6ef39](https://github.com/usernein/tailwindcss-template-card/commit/6ef39adfdd08231) Pauxis)  
-  add padding to textarea ([32e43](https://github.com/usernein/tailwindcss-template-card/commit/32e43853abca9fd) Pauxis)  
-  make the test for dev features case insensitive ([f6945](https://github.com/usernein/tailwindcss-template-card/commit/f69457be0bf5f3e) Pauxis)  
-  add code mirror as hidden option ([aa5c0](https://github.com/usernein/tailwindcss-template-card/commit/aa5c0d7f3bd1435) Pauxis)  
-  adding tabs ([caa00](https://github.com/usernein/tailwindcss-template-card/commit/caa0076512b81b0) Pauxis)  

### Bug Fixes

-  organize types into single file ([6a8d5](https://github.com/usernein/tailwindcss-template-card/commit/6a8d5ddbb5441f6) Pauxis)  
-  remove console.log ([54fc8](https://github.com/usernein/tailwindcss-template-card/commit/54fc88f7ab1dc0f) Pauxis)  
-  fix color and alignment ([40e38](https://github.com/usernein/tailwindcss-template-card/commit/40e383ae194f2f7) Pauxis)  
-  **mobile**  Stop using workers ([afbd7](https://github.com/usernein/tailwindcss-template-card/commit/afbd73e6eede84b) Pauxis)  

### Other changes

**v2.0.4-0**


[4d46a](https://github.com/usernein/tailwindcss-template-card/commit/4d46a0ec63d9972) Pauxis *2023-06-26 04:22:20*

**Add debounce to inputs and improve live testing with vite**


[2e696](https://github.com/usernein/tailwindcss-template-card/commit/2e6960735e40d88) Pauxis *2023-06-23 14:16:36*


## v2.0.3 (2023-06-21)

### Other changes

**v2.0.3**


[b553c](https://github.com/usernein/tailwindcss-template-card/commit/b553cc3ab339950) Pauxis *2023-06-21 11:03:57*


## v2.0.2 (2023-06-21)

### Bug Fixes

-  Fix import AceEditor ([e97d2](https://github.com/usernein/tailwindcss-template-card/commit/e97d28bd0cc40a9) Pauxis)  

### Other changes

**2.0.2**


[a20c9](https://github.com/usernein/tailwindcss-template-card/commit/a20c98bb815ce77) Pauxis *2023-06-21 06:01:22*


## v2.0.1 (2023-06-21)

### Other changes

**v2.0.1**


[fc1be](https://github.com/usernein/tailwindcss-template-card/commit/fc1be1c8b409f5a) Pauxis *2023-06-21 05:54:52*


## v2.0.1-1 (2023-06-21)

### Other changes

**v2.0.1-1**


[4550f](https://github.com/usernein/tailwindcss-template-card/commit/4550f0d56410c04) Pauxis *2023-06-21 05:51:37*


## v2.0.1-0 (2023-06-21)

### Features

-  **typing**  Turn template renderer into an abstract class ([d29fa](https://github.com/usernein/tailwindcss-template-card/commit/d29fa1d15524e50) Pauxis)  
-  **typing**  Reduce usage of Partial<ConfigState> ([ddc37](https://github.com/usernein/tailwindcss-template-card/commit/ddc371224c303c1) Pauxis)  
-  **config**  Use Ace Editor and fulfill config with defaults ([d9b65](https://github.com/usernein/tailwindcss-template-card/commit/d9b65e4faeb1a6d) Pauxis)  
-  **rendering**  Make the hass setter also inject the styles ([f2c1b](https://github.com/usernein/tailwindcss-template-card/commit/f2c1b1132e2e6d9) Pauxis)  
-  **rendering**  Add out-of-box support to latest DaisyUI ([e4082](https://github.com/usernein/tailwindcss-template-card/commit/e40824269be04c5) Pauxis)  
-  **rendering**  Make hass a global variable ([ff79b](https://github.com/usernein/tailwindcss-template-card/commit/ff79bc280bde00b) Pauxis)  

### Bug Fixes

-  Fix AceEditor issue with JSX ([c0f7c](https://github.com/usernein/tailwindcss-template-card/commit/c0f7c92fb8f3c7c) Pauxis)  
-  **rendering**  Fix conditions to inject stylesheets ([0c9cd](https://github.com/usernein/tailwindcss-template-card/commit/0c9cd3838c02685) Pauxis)  
-  **rendering**  Force card to update when the config is changed ([85d0c](https://github.com/usernein/tailwindcss-template-card/commit/85d0c1146a9a68d) Pauxis)  
-  **rendering**  Fix condition when the styles should be reinjected ([c613c](https://github.com/usernein/tailwindcss-template-card/commit/c613c9dbb777ca9) Pauxis)  
-  **rendering**  Use "auto" as default DaisyUI theme when undefined ([9e36a](https://github.com/usernein/tailwindcss-template-card/commit/9e36a4aba29c7c8) Pauxis)  

### Other changes

**v2.0.1-0**


[47aca](https://github.com/usernein/tailwindcss-template-card/commit/47aca37aa0b42ce) Pauxis *2023-06-21 05:48:40*

**v2.0.0**


[c8915](https://github.com/usernein/tailwindcss-template-card/commit/c8915afebd1e985) Pauxis *2023-06-21 05:31:52*

**v1.5.1-0**


[8c6b3](https://github.com/usernein/tailwindcss-template-card/commit/8c6b3e8fa8b1bbe) Pauxis *2023-06-21 02:34:24*

**Load ace editor's html worker inline**


[b57b6](https://github.com/usernein/tailwindcss-template-card/commit/b57b69638e23541) Pauxis *2023-06-21 02:33:35*

**v1.5.0**


[f5c44](https://github.com/usernein/tailwindcss-template-card/commit/f5c4421fbdfb509) Pauxis *2023-06-21 02:33:03*

**v1.4.1**


[d6680](https://github.com/usernein/tailwindcss-template-card/commit/d668051ee5e49bb) Pauxis *2023-06-21 02:32:42*

**v1.4.1-3**


[b04af](https://github.com/usernein/tailwindcss-template-card/commit/b04afd6b8d47edb) Pauxis *2023-06-21 02:31:54*

**v1.4.1-2**


[ef146](https://github.com/usernein/tailwindcss-template-card/commit/ef1466581581690) Pauxis *2023-06-21 02:31:09*

**v1.4.0**


[b3542](https://github.com/usernein/tailwindcss-template-card/commit/b35420177cca9d0) Pauxis *2023-06-21 02:29:34*

**v1.3.0**


[99278](https://github.com/usernein/tailwindcss-template-card/commit/992786e781a6312) Pauxis *2023-06-21 02:29:34*

**v1.4.1-1**


[8e380](https://github.com/usernein/tailwindcss-template-card/commit/8e3801c38b97dcb) Pauxis *2023-06-21 02:29:34*

**v1.2.0**


[48e2a](https://github.com/usernein/tailwindcss-template-card/commit/48e2adbb93dad8d) Pauxis *2023-06-21 02:27:42*

**v1.1.0**


[b7953](https://github.com/usernein/tailwindcss-template-card/commit/b795364750ff7b5) Pauxis *2023-06-21 02:19:48*

**v1.0.1**


[86086](https://github.com/usernein/tailwindcss-template-card/commit/86086a13bf80826) Pauxis *2023-05-28 01:48:51*

**v1.0.0**


[62096](https://github.com/usernein/tailwindcss-template-card/commit/62096af3b59c349) Pauxis *2023-05-28 01:45:12*


