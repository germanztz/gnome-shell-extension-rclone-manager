MODULES = extension.js confirmDialog.js locale/ metadata.json stylesheet.css LICENSE.rst README.md prefs.js schemas/  fileMonitorHelper.js
INSTALLPATH=~/.local/share/gnome-shell/extensions/rclone-manager@germanztz.com/
VM_NAME = rclone

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

debug:
	journalctl --no-pager --no-hostname -g rclone -o cat /usr/bin/gnome-shell

debug-prefs:
	journalctl -f -o cat /usr/bin/gnome-shell-extension-prefs

vmrun: bundle

	@VBoxManage guestcontrol "$(VM_NAME)" run --username vagrant --password vagrant -- \
		/bin/bash -c "echo vagrant | sudo -S apt install -y gnome-shell-extension-manager rclone" 

	@VBoxManage guestcontrol "$(VM_NAME)" run --username vagrant --password vagrant -- \
	    /bin/bash -c "echo vagrant | sudo -S sed -i 's/^# *AutomaticLoginEnable = true/AutomaticLoginEnable = true/' /etc/gdm3/custom.conf"

	@VBoxManage guestcontrol "$(VM_NAME)" run --username vagrant --password vagrant -- \
	    /bin/bash -c "echo vagrant | sudo -S sed -i 's/^# *AutomaticLogin = user1/AutomaticLogin = vagrant/' /etc/gdm3/custom.conf"

	@VBoxManage guestcontrol "$(VM_NAME)" copyto --username vagrant --password vagrant \
		--target-directory /tmp/rclone-manager@germanztz.com.zip \
		${PWD}/rclone-manager@germanztz.com.zip

	@VBoxManage guestcontrol "$(VM_NAME)" run --username vagrant --password vagrant -- \
		/bin/bash -c "rm -Rf $(INSTALLPATH) \
		&& mkdir -p $(INSTALLPATH) \
		&& mkdir -p /home/vagrant/.config/rclone \
		&& unzip -o /tmp/rclone-manager@germanztz.com.zip -d $(INSTALLPATH) \
		&& export DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1000/bus \
		&& gsettings set org.gnome.shell disable-user-extensions false \
		&& gnome-extensions enable rclone-manager@germanztz.com"

	@VBoxManage guestcontrol "$(VM_NAME)" copyto --username vagrant --password vagrant \
		--target-directory /home/vagrant/.config/rclone/rclone.conf \
		${HOME}/.config/rclone/rclone.conf

	@VBoxManage guestcontrol "$(VM_NAME)" run --username vagrant --password vagrant -- \
		/bin/bash -c "echo vagrant | sudo -S systemctl restart gdm"

	@VBoxManage guestcontrol "$(VM_NAME)" run --username vagrant --password vagrant -- \
		/usr/bin/journalctl --no-pager --no-hostname -f --since "1 minute ago" -b -g rclone -o cat /usr/bin/gnome-shell