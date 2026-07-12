---
name: new-product-repo
description: Set up a new ergarcade product repo built on pm5-base (repo creation, submodule, topics, README stub). Use when asked to start/create a new PM5 application/tool/repo, e.g. "we're going to make a new application, call it <name>". Covers only the mechanical repo scaffolding -- NOT the app itself (its display, logic, tests, or deploy workflow), which is a separate design conversation once this is done.
---

# Setting up a new ergarcade product repo

This is the mechanical half of starting a new PM5 app, extracted so it isn't
re-derived each time — see `README.md`'s "Setting up a new ergarcade product
repo" section for the same checklist in narrative form. `ergarcade/recorder`
and `ergarcade/virtual-monitor` are the worked examples.

**Stop at the end of this checklist.** Scaffolding the actual app —
`index.html`/`app.js`, display logic, tests, the `deploy-pages.yml` workflow,
making the repo public — is a separate design conversation with the user, not
part of this skill. This only gets a repo into a state where that
conversation can start.

## 0. Ask two things first

- **One-line purpose** — what the app does. Used for `gh repo create
  --description` and the README's opening line.
- **Visibility and license** — default to private + MIT (matches every prior
  repo) unless told otherwise.

Don't guess the product name — use exactly what the user said to call it.

## 1. Create the repo

```
gh repo create ergarcade/<name> --private --license mit --add-readme --clone \
  --description "<one-line purpose>"
```

Keep whatever default branch `gh` assigns (e.g. `main`) rather than renaming
it to match older repos. Don't use a `pm5-` prefix — that's legacy from the
pre-submodule `pm5-overlay`/`pm5-detail`/`pm5-dump` repos being phased out.

## 2. Add pm5-base as a submodule

```
cd <name>
git submodule add -b master https://github.com/ergarcade/pm5-base.git pm5-base
```

Tracks `master`, not a pinned commit — future `git submodule update --remote
pm5-base` pulls in library updates.

## 3. Set topics

```
gh api -X PUT repos/ergarcade/<name>/topics \
  -f 'names[]=concept2' -f 'names[]=pm5' -f 'names[]=<name>'
```

## 4. Write the README submodule-boilerplate section

Replace the auto-generated `--add-readme` stub with something like:

```markdown
# <name>

<one-line purpose>, built on [pm5-base](https://github.com/ergarcade/pm5-base).

No build step, no package manager, no framework — plain HTML/CSS/JS.

## Getting the code

This repo pulls in `pm5-base` as a git submodule, so clone with:

​```
git clone --recurse-submodules https://github.com/ergarcade/<name>.git
​```

If you already cloned without that flag:

​```
git submodule update --init
​```

## Updating the pm5-base submodule

​```
git submodule update --remote pm5-base
git add pm5-base
git commit -m "Update pm5-base submodule"
​```
```

Leave "Running it" / "Architecture" / "Tests" sections out for now — those
depend on the app that doesn't exist yet, and get written during that later
conversation.

## 5. Commit and push

Follow this workspace's standing git rule: show the commit message, get
explicit confirmation, before committing. Something like `Add pm5-base
submodule, README` is enough — there's no app code yet to describe.

## 6. Hand off

Tell the user the repo is scaffolded and ready — then the actual app design
(what it displays, its file layout, tests) is a fresh plan-and-build
conversation, not a continuation of this checklist. When that conversation
gets to `index.html`, point at `pm5-base/README.md`'s "Shared header UI:
ui/info-modal.js" section (and `pm5-base/example/` as the reference wiring)
for the standard header: app name top left, transport controls top right, an
"i" button next to the title opening a `<dialog id="info-modal">` describing
the app and how Mock works.
