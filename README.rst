============================
RClone Manager
============================

RClone Manager extension for Gnome-Shell - Adds a rclone indicator to the top panel in roder to manage rclone configurations.

Extension page on e.g.o:
https://extensions.gnome.org/extension/xxx

Debugging

make install && make run 2>&1 | grep RClone

	

To Debug the Extension (extension.js), use this in terminal:
journalctl -f -o cat /usr/bin/gnome-shell

To Debug the Extension Preferences (prefs), use this in terminal:
journalctl -f -o cat /usr/bin/gnome-shell-extension-prefs



Installation
----------------

Installation via git is performed by cloning the repo into your local gnome-shell extensions directory (usually ~/.local/share/gnome-shell/extensions/)::

    $ git clone https://github.com/germanztz/gnome-shell-extension-rclone-manager <extensions-dir>/rclone-manager@daimler.com

After cloning the repo, the extension is practically installed yet disabled. In
order to enable it, you need to use gnome-tweak-tool - find the extension,
titled 'RClone Manager', in the 'Extensions' screen and turn it 'On'.
You may need to restart the shell (Alt+F2 and insert 'r' in the prompt) for the
extension to be listed there.

Doc

https://gjs.guide/

https://gjs-docs.gnome.org

https://wiki.gnome.org/

https://www.codeproject.com/Articles/5271677/How-to-Create-A-GNOME-Extension

https://github.com/julio641742/gnome-shell-extension-reference