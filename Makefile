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

run: install
	./debug.sh
# 2>1 | grep -v 'Meta.Rectangle'

vmrun: bundle
	ps -ef | grep -v grep | grep -e 'virtualbox.*rclone-manager' || vagrant up 
# 	vagrant ssh -c '\
# gsettings set org.gnome.shell disable-user-extensions false && \
# gnome-extensions install --force ~/rclone-manager@germanztz.com/rclone-manager@germanztz.com.zip && \
# gnome-extensions enable rclone-manager@germanztz.com && \
# journalctl -f --no-hostname -b /usr/bin/gnome-shell'
	vagrant ssh -c 'gsettings set org.gnome.shell disable-user-extensions false'
	vagrant ssh -c 'gnome-extensions install --force ~/rclone-manager@germanztz.com/rclone-manager@germanztz.com.zip'
	vagrant ssh -c 'sudo init 3'
	vagrant ssh -c 'sudo init 5'
	sleep 3
	vagrant ssh -c 'sudo init 3'
	vagrant ssh -c 'sudo init 5'
	vagrant ssh -c 'gnome-extensions enable rclone-manager@germanztz.com'
	vagrant ssh -c 'journalctl -f --no-hostname -b /usr/bin/gnome-shell'


