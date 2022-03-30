MODULES = extension.js confirmDialog.js locale/ metadata.json stylesheet.css LICENSE.rst README.md prefs.js schemas/  utils.js fileMonitorHelper.js
INSTALLPATH=~/.local/share/gnome-shell/extensions/rclone-manager@daimler.com/

all: compile-locales compile-settings

compile-settings:
	glib-compile-schemas --strict --targetdir=schemas/ schemas

compile-locales:
	$(foreach file, $(wildcard locale/*/LC_MESSAGES/*.po), \
		msgfmt $(file) -o $(subst .po,.mo,$(file));)

update-po-files:
	xgettext -L Python --from-code=UTF-8 -k_ -kN_ -o rclone-manager.pot *.js
	$(foreach file, $(wildcard locale/*/LC_MESSAGES/*.po), \
		msgmerge $(file) rclone-manager.pot -o $(file);)

install: all
	rm -rf $(INSTALLPATH)
	mkdir -p $(INSTALLPATH)
	cp -r $(MODULES) $(INSTALLPATH)/

bundle: all
	zip -r bundle.zip $(MODULES)

run:
	dbus-run-session -- gnome-shell --nested --wayland
