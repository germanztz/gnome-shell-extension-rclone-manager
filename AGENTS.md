# AGENTS.md

GNOME Shell extension (GJS/ESM) for managing rclone profiles. Targets GNOME Shell 48/49 (`metadata.json`); current dev branch is `v49`. This is **not** a Node app — `package.json` exists only to pin eslint tooling.

## Build & verify

There is no test suite and no CI. The Makefile is the source of truth:

- `make all` — compile gsettings schema (`glib-compile-schemas --strict`) and all `locale/*/LC_MESSAGES/*.po` → `.mo`
- `make install` — copies `MODULES` to `~/.local/share/gnome-shell/extensions/rclone-manager@germanztz.com/` (runs `all` first)
- `make run` — `install` + `debug.sh` (nested gnome-shell on wayland under `dbus-run-session`)
- `make bundle` — builds `rclone-manager@germanztz.com.zip` for extensions.gnome.org (excludes `*.po`)
- `make update-po-files` — regenerate `rclone-manager.pot` via `xgettext -L Python -k_ -kN_` and `msgmerge` into each locale
- `make vmrun` — Vagrant VM test loop (Ubuntu box in `vm/`)

After touching the schema, rerun `make all`/`make install`; `gschemas.compiled` is gitignored and regenerated. Lint with `npx eslint .` (`.eslintrc.json` extends `standard`; there are no npm scripts).

## Runtime debug

- Extension: `journalctl --no-pager --no-hostname -g rclone -o cat /usr/bin/gnome-shell`
- Prefs: `journalctl -f -o cat /usr/bin/gnome-shell-extension-prefs`
- Extension must be enabled: `gnome-extensions enable rclone-manager@germanztz.com`

## Architecture

- `extension.js` — entrypoint; `RcloneManager extends Extension`, builds the top-panel indicator/menu
- `prefs.js` — settings dialog (`RcloneManagerPreferences`); shares state logic
- `fileMonitorHelper.js` — **shared logic** used by both extension and prefs: exports `FileMonitorHelper`, `PrefsFields` (gsettings key names), `ProfileStatus`; runs all rclone commands via GLib spawn
- `confirmDialog.js` — modal dialog helper
- `schemas/org.gnome.shell.extensions.rclone-manager.gschema.xml` — all settings
- `libsecretHelper.js` — dead/unwired stub (not imported anywhere); don't rely on it

GJS specifics: ESM imports use `gi://` and `resource:///org/gnome/shell/...` URIs, not npm. Files start with `/* eslint-disable no-undef */` etc. because GJS globals aren't known to eslint. Debug output goes through `log()` (journalctl).

## Conventions

- gsettings keys are named `prefkeyNNN-name` (or `hiddenkeyNNN-...`) and must be registered in three places: the gschema XML, `PrefsFields` in `fileMonitorHelper.js`, and `prefs.js`.
- Version lives in `metadata.json` (`version`, `shell-version`); bump it plus the README changelog for each release (see DEVELOP.md release checklist).
- Translations: gettext domain `rclone-manager`; edit `.po` files, not `.mo` (gitignored).
- `.eslintignore` ignores all dotfiles and `build/`, `dist/`, `bundle.js`.
