RClone Manager
==============

![The icon](docs/icon.png) 

Is like Dropbox sync client but for more than 30 services, adds an indicator to the top panel so you can manage the rclone profiles configured in your system, perform operations such as mount as remote, watch for file modifications, sync with remote storage, navigate it's main folder. Also, it shows the status of each profile so you can supervise the operations, and provides an easy access log of events. Backup and restore the rclone configuration file, so you won't have to configure all your devices one by one

![The menu](docs/menu.png)

Extension page on Gnome Extensions [RClone Manager](https://extensions.gnome.org/extension/5006/rclone-manager)

# Features 

- Does not track your data like Dropbox, Google or Microsoft's clients will do, plain functionality
- Adds an indicator in the system tray to check and manage rclone configurations
- Works with rclone
- Two modes of work: **watch files** ![watch](docs/watch%20icon.png) and **mount remote** ![mount](docs/mount%20icon.png)  service
- Customizable rclone commands
- Customizable list os file extensions to be ignored
- Backup and restore the rclone configuration file, so you won't have to configure all your devices one by one
![settings](docs/settings.png)
- Easy access log of events 
- It has been tested on Dropbox, Gdrive, GooglePhotos, Mega, WebDAV (NextCloud), ftp and OneDrive. Other compatible cloud services may (not) work (see [rclone documentation](https://rclone.org/overview/)), hope you enjoy trying them
- Potentially compatible with those cloud services: 

|||||||
|--|--|--|--|--|--|
1Fichier| Akamai Netstorage| Alibaba Cloud (Aliyun) Object Storage System (OSS)| Amazon Drive (See note)| Amazon S3| Backblaze B2| Box| Ceph| Citrix ShareFile| 
C14| DigitalOcean Spaces| Digi Storage| Dreamhost| Dropbox| Enterprise File Fabric| 
FTP| Google Cloud Storage| Google Drive|Google Photos| HDFS| HTTP| 
Hubic| Jottacloud| IBM COS S3| Koofr| Mail.ru Cloud| Memset Memstore| 
Mega| Memory| Microsoft Azure Blob Storage| Microsoft OneDrive| Minio| Nextcloud| OVH| 
OpenDrive| OpenStack Swift| Oracle Cloud Storage| ownCloud| pCloud| premiumize.me| 
put.io| QingStor| Rackspace Cloud Files| rsync.net| Scaleway| Seafile| 
Seagate Lyve Cloud| SeaweedFS| SFTP| Sia| StackPath| Storj| 
SugarSync| Tencent Cloud Object Storage (COS)| Uptobox| Wasabi| WebDAV| Yandex Disk| 
Zoho WorkDrive| The local filesystem 

#### ![watch](docs/watch%20icon.png) Features of watch mode 

![watch menu](docs/watch%20menu.png)

- Synchronizes file downstream from cloud on start (see rclone sync documentation)
- Does monitor local files and keeps them in sync with cloud storage
- Files are stored locally, you will be able to access them offline (offline changes will be lost on manual sync)
- System tray icon show the sync status for easy check, system notifications show eventual errors
- One click sync repository
- No loops or CPU consumption when idle

#### ![mount](docs/mount%20icon.png) Features of mount mode

![mount menu](docs/mount%20menu.png)

- Updates files with remote modifications, no sync needed
- Will not consume local disk space

# Limitations

#### ![watch](docs/watch%20icon.png) Limitations of watch Mode

- Does not monitor cloud services, and will not update local files with remote modifications "live", manual sync is needed
- local offline changes will be lost on manual sync, always check your changes have synched successfully
- May not delete local files on manually sync if files were deleted in the cloud

#### ![mount](docs/mount%20icon.png) Limitations of mount model

- Files are not stored locally, internet connection needed
- It is slow to work with files in this mode

# **_DISCLAIMER_**

- **Files backup is strongly advised**
- **Absolutely no warranty**

# Develop and extend
## Installation

Installation via git is performed by cloning the repo into your local gnome-shell extensions directory

    $ git clone https://github.com/germanztz/gnome-shell-extension-rclone-manager ~/.local/share/gnome-shell/rclone-manager@germanztz.com

After cloning the repo, the extension is practically installed yet disabled. 

    $ gnome-extensions enable rclone-manager@germanztz.com

## Bug reports

To Debug the installed Extension (extension.js), use this in terminal:

    $ journalctl --no-pager --no-hostname --since "1 days ago" -b -g rclone -o cat /usr/bin/gnome-shell

To Debug the Extension Preferences (prefs), use this in terminal:

    $ journalctl -f -o cat /usr/bin/gnome-shell-extension-prefs

Please, send the resulting report in an issue in github

    $ https://github.com/germanztz/gnome-shell-extension-rclone-manager/issues

## Debugging and testing

From your extension local directory

    $ clean && make install && make run 2>&1 | grep -i -e rclone

## Doc

https://gjs.guide/

https://gjs-docs.gnome.org

https://wiki.gnome.org/

https://www.codeproject.com/Articles/5271677/How-to-Create-A-GNOME-Extension

https://github.com/julio641742/gnome-shell-extension-reference

https://rclone.org

# ChangeLog

## v1.0

- [x] Fix create basedir if not exist on mount
- [x] Fix show actual status when mount fails
- [x] Add notification dialog with details
- [x] Fix open action
- [x] Add reset button in setting
- [x] Fix config persistence
- [x] Add about button in setting
- [x] Fix menu update after add config
- [x] Fix permanent busy on mount
- [x] Add log to file
- [x] Translate spanish

## v1.1

- [x] Add function backup config
- [x] Add function restore config

## TODO list
- [ ] Fix show permanent notification
- [ ] add function check: Checks the files in the source and destination match.
- [ ] add function cleanup: Clean up the remote if possible.
- [ ] add function size: Prints the total size and number of objects in remote:path.

