# Develop and extend
## Installation

Installation via git is performed by cloning the repo into your local gnome-shell extensions directory

    $ git clone https://github.com/germanztz/gnome-shell-extension-rclone-manager ~/.local/share/gnome-shell/rclone-manager@germanztz.com   

After cloning the repo, the extension is practically installed yet disabled. 

    $ gnome-extensions enable rclone-manager@germanztz.com

## Debug

To Debug the installed Extension (extension.js), use this in terminal:

    $ journalctl --no-pager --no-hostname --since "1 days ago" -b -g rclone -o cat /usr/bin/gnome-shell

To Debug the Extension Preferences (prefs), use this in terminal:

    $ journalctl -f -o cat /usr/bin/gnome-shell-extension-prefs

Please, send the resulting report in an issue in github

    $ https://github.com/germanztz/gnome-shell-extension-rclone-manager/issues

## Debugging and testing locally

From your extension local directory

    $ clean && make install && make run 2>&1 | grep -i -e rclone

## Prepare Virtual dev environment

    $ wget -O- https://apt.releases.hashicorp.com/gpg | gpg --dearmor | sudo tee /usr/share/keyrings/hashicorp-archive-keyring.gpg
    $ echo "deb [signed-by=/usr/share/keyrings/hashicorp-archive-keyring.gpg] https://apt.releases.hashicorp.com $(lsb_release -cs) main" | sudo tee /etc/apt/sources.list.d/hashicorp.list
    $ sudo apt update && sudo apt install vagrant gettext

## Debugging and testing in Virtual dev environment

Launch in vm Ubuntu

    $ make vmrun

## My Release checklist protocol

- [x] Update version in extension.js 
- [x] Update changelog from README.md
- [x] package
- [x] Push to branch on github
- [x] Pull request to master on github
- [x] create tag and release on github
- [x] close issues on github
- [x] Upload to gnome extensions


## Doc

https://gjs.guide/

https://gjs-docs.gnome.org

https://wiki.gnome.org/

https://www.codeproject.com/Articles/5271677/How-to-Create-A-GNOME-Extension

https://github.com/julio641742/gnome-shell-extension-reference

https://rclone.org

https://gitlab.gnome.org/GNOME/gnome-shell/-/blob/main/js/extensions/prefs.js