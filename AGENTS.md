# AGENTS.md

GNOME Shell extension (GJS/ESM) for managing rclone profiles. Targets GNOME Shell version (`metadata.json`).

## Build & verify

There is no test suite and no CI. The Makefile is the source of truth:

- `make all` — compile gsettings schema (`glib-compile-schemas --strict`) and all `locale/*/LC_MESSAGES/*.po` → `.mo`
- `make install` — copies `MODULES` to `~/.local/share/gnome-shell/extensions/rclone-manager@germanztz.com/` (runs `all` first)
- `make run` — `install` + `debug.sh` (nested gnome-shell on wayland under `dbus-run-session`)
- `make bundle` — builds `rclone-manager@germanztz.com.zip` for extensions.gnome.org (excludes `*.po`)
- `make update-po-files` — regenerate `rclone-manager.pot` via `xgettext -L Python -k_ -kN_` and `msgmerge` into each locale
- `make vmrun` — Vagrant VM test loop (Ubuntu box in `vm/`)
- `make debug` — tail the installed extension's journald output (`journalctl -g rclone ... /usr/bin/gnome-shell`); the extension must be enabled (`gnome-extensions enable rclone-manager@germanztz.com`) and installed (`make install`)
- `make debug-prefs` — tail the preferences dialog's journald output (`journalctl -f ... /usr/bin/gnome-shell-extension-prefs`)

After touching the schema, rerun `make all`/`make install`; `gschemas.compiled` is gitignored and regenerated.

## Runtime debug

Extension must be enabled: `gnome-extensions enable rclone-manager@germanztz.com`

- Extension log: `make debug`
- Prefs log: `make debug-prefs`

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

## Release

Follow the release checklist in DEVELOP.md:

1. Bump `version` + `shell-version` in `metadata.json`; add a new section to the README.md changelog
2. Package: `make bundle` → `rclone-manager@germanztz.com.zip`
3. Push the branch to GitHub, then open a PR to `master`
4. Create a tag and a GitHub release, attaching the zip
5. Close related issues on GitHub
6. Upload to extensions.gnome.org
