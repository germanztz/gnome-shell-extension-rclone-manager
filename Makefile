MODULES = extension.js confirmDialog.js locale/ metadata.json stylesheet.css LICENSE.rst README.md prefs.js schemas/  fileMonitorHelper.js
INSTALLPATH=~/.local/share/gnome-shell/extensions/rclone-manager@germanztz.com/

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
	zip -r rclone-manager@germanztz.com.zip $(MODULES) -x "*.po"

run:
	dbus-run-session -- gnome-shell --nested --wayland

vmrun:
	ps -ef | grep -v grep | grep testvm || vagrant up
	vagrant ssh -c 'cd /vagrant_data && make install && sudo service gdm3 restart && journalctl -f --no-hostname -b /usr/bin/gnome-shell' testvm	

