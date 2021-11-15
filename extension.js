const Clutter    = imports.gi.Clutter;
const Config     = imports.misc.config;
const Gio        = imports.gi.Gio;
const GLib       = imports.gi.GLib;
const Lang       = imports.lang;
const Mainloop   = imports.mainloop;
const Meta       = imports.gi.Meta;
const Shell      = imports.gi.Shell;
const St         = imports.gi.St;
const PolicyType = imports.gi.Gtk.PolicyType;
const Util       = imports.misc.util;
const MessageTray = imports.ui.messageTray;

const Main      = imports.ui.main;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;
const CheckBox  = imports.ui.checkBox.CheckBox;

const Gettext = imports.gettext;
const _ = Gettext.domain('rclone-manager').gettext;

const Clipboard = St.Clipboard.get_default();
const CLIPBOARD_TYPE = St.ClipboardType.CLIPBOARD;

const INDICATOR_ICON = 'drive-multidisk-symbolic';
const PROFILE_IDLE_ICON = 'radio-symbolic';
const PROFILE_WATCHED_ICON = 'folder-saved-search-symbolic';
const PROFILE_MOUNTED_ICON = 'folder-remote-symbolic';
const PROFILE_BUSSY_ICON = 'system-run-symbolic';
const PROFILE_ERROR_ICON = 'dialog-warning-symbolic';

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Utils = Me.imports.utils;
const ConfirmDialog = Me.imports.confirmDialog;
const Prefs = Me.imports.prefs;
const prettyPrint = Utils.prettyPrint;
const writeRegistry = Utils.writeRegistry;
const readRegistry = Utils.readRegistry;

const FileMonitorHelper = Me.imports.fileMonitorHelper;

let rconfigFilePath = "~/.config/rclone/rclone.conf";
let baseMountPath = "~/";
let ignorePatterns = '.remmina.,~lock,.tmp,.log';
let externalTerminal = 'gnome-terminal --window -- ';
let externalFileBrowser = 'nautilus';
let externalEditor = 'gedit';
let mountFlags = '--file-perms 0777 --allow-non-empty --allow-other --write-back-cache --no-modtime';
let autosync = true;

const submenus = {
    'Watch': 'folder-saved-search-symbolic',
    'Unwatch': 'image-zoom-out-symbolic',
    'Mount': 'folder-remote-symbolic',
    'Umount': 'image-zoom-out-symbolic',
    'Open': 'window-new-symbolic',
    'Backup': 'backups-app-symbolic',
    'Restore': 'aptdaemon-download-symbolic',
    'Reconnect': 'gnome-dev-ethernet',
    'Sync': 'mail-send-receive-symbolic',
    'Delete': 'user-trash-symbolic'
};

let TIMEOUT_MS           = 1000;
let MAX_REGISTRY_LENGTH  = 15;
let MAX_ENTRY_LENGTH     = 50;
let CACHE_ONLY_FAVORITE  = false;
let DELETE_ENABLED       = true;
let MOVE_ITEM_FIRST      = false;
let ENABLE_KEYBINDING    = true;
let PRIVATEMODE          = false;
let NOTIFY_ON_COPY       = true;
let CONFIRM_ON_CLEAR     = true;
let MAX_TOPBAR_LENGTH    = 15;
let TOPBAR_DISPLAY_MODE  = 1; //0 - only icon, 1 - only clipbord content, 2 - both
let DISABLE_DOWN_ARROW   = false;
let STRIP_TEXT           = false;

const RcloneManager = Lang.Class({
    Name: 'RcloneManager',
    Extends: PanelMenu.Button,

    _settingsChangedId: null,
    _clipboardTimeoutId: null,
    _selectionOwnerChangedId: null,
    _historyLabelTimeoutId: null,
    _historyLabel: null,
    _disableDownArrow: null,
    _mounts: [],

    _init: function() {
        this.parent(0.0, "RcloneManager");
        this._shortcutsBindingIds = [];
        this.clipItemsRadioGroup = [];

        let hbox = new St.BoxLayout({ style_class: 'panel-status-menu-box rclone-manager-hbox' });
        this.icon = new St.Icon({ icon_name: INDICATOR_ICON,
            style_class: 'system-status-icon rclone-manager-icon' });
        hbox.add_child(this.icon);
        this.add_child(hbox);

        this._mounts = FileMonitorHelper.getMounts();
        this._loadSettings();
    },

    _loadSettings: function () {
        this._settings = Prefs.SettingsSchema;
        this._settingsChangedId = this._settings.connect('changed',
            Lang.bind(this, this._onSettingsChange));

        this._onSettingsChange();
    },

    _onSettingsChange: function () {
        rconfigFilePath = this._settings.get_string(Prefs.Fields.RCONFIG_FILE_PATH);
        baseMountPath = this._settings.get_string(Prefs.Fields.BASE_MOUNT_PATH);
        ignorePatterns = this._settings.get_string(Prefs.Fields.IGNORE_PATTERNS);
        externalTerminal = this._settings.get_string(Prefs.Fields.EXTERNAL_TERMINAL);
        externalFileBrowser = this._settings.get_string(Prefs.Fields.EXTERNAL_FILE_BROWSER);
        externalEditor = this._settings.get_string(Prefs.Fields.EXTERNAL_TEXT_EDITOR);
        mountFlags = this._settings.get_string(Prefs.Fields.MOUNT_FLAGS);
        autosync = this._settings.get_string(Prefs.Fields.AUTOSYNC);

        baseMountPath = baseMountPath.replace('~',GLib.get_home_dir());
		if(!baseMountPath.endsWith('/')) baseMountPath = baseMountPath+'/';

        rconfigFilePath = rconfigFilePath.replace('~',GLib.get_home_dir());

        FileMonitorHelper.parseConfigFile(rconfigFilePath);
        this._buildMenu();
        FileMonitorHelper.automount(ignorePatterns, baseMountPath, mountFlags, this._onProfileStatusChanged);
    },

    _buildMenu: function () {
        //clean menu
        this.menu._getMenuItems().forEach(function (i) { i.destroy(); });

        for (let profile in FileMonitorHelper.getConfigs()){
            this.menu.addMenuItem(this._createMenuItem(profile));
        }
        // Add separator
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());


        // Add 'Add config' button which adds new config to rclone
        let addMenuItem = new PopupMenu.PopupImageMenuItem(_('Add config'),'folder-new-symbolic');
        this.menu.addMenuItem(addMenuItem);
        addMenuItem.connect('activate', Lang.bind(this, this._addConfig));

        // // Add 'Restore config' button which restores rclonefile from a mount
        // let retoreMenuItem = new PopupMenu.PopupMenuItem(_('Restore config'));
        // this.menu.addMenuItem(retoreMenuItem);
        // retoreMenuItem.connect('activate', Lang.bind(this, this._restoreConfig));

        // Add 'Edit config' button which edits an existing rclone config
        let editMenuItem = new PopupMenu.PopupImageMenuItem(_('Edit config'),'gedit-symbolic');
        this.menu.addMenuItem(editMenuItem);
        editMenuItem.connect('activate', Lang.bind(this, this._editConfig));

        // Add 'Settings' menu item to open settings
        let settingsMenuItem = new PopupMenu.PopupImageMenuItem(_('Settings'),'gnome-tweak-tool-symbolic');
        this.menu.addMenuItem(settingsMenuItem);
        settingsMenuItem.connect('activate', Lang.bind(this, this._openSettings));
    },
    
    /**
     * https://github.com/julio641742/gnome-shell-extension-reference/blob/master/tutorials/POPUPMENU-EXTENSION.md
     * @param {string} profile
     * @returns {PopupSubMenuMenuItem}
     */
    _createMenuItem(profile){
        let isMounted = this._mounts.some(item => item == profile);
		let menuItem = new PopupMenu.PopupSubMenuMenuItem(profile, true);
        menuItem.icon.icon_name = 'radio-symbolic';
        this._createSubmenu(menuItem, profile, isMounted, false);
        // menuItem.menu._getMenuItems().forEach(function (mItem, i, menuItems){});
        // menuItem.menu._getMenuItems().filter(item => item.clipContents === text)[0];
        return menuItem
    },

    _createSubmenu: function(menuItem, profile, isMounted, isInotify){

		menuItem.menu.box.style_class = 'menuitem-menu-box';

        if(isMounted){
            menuItem.menu.addMenuItem(this._createSubMenuItem('Umount', profile));
        } else if (isInotify) {
            menuItem.menu.addMenuItem(this._createSubMenuItem('Unwatch', profile));
        }
        else{
            menuItem.menu.addMenuItem(this._createSubMenuItem('Mount', profile));
            menuItem.menu.addMenuItem(this._createSubMenuItem('Watch', profile));
            menuItem.menu.addMenuItem(this._createSubMenuItem('Reconnect', profile));
        }

        if (isInotify || isMounted){
            menuItem.menu.addMenuItem(this._createSubMenuItem('Open', profile));
            menuItem.menu.addMenuItem(this._createSubMenuItem('Backup', profile));
        }

        menuItem.menu.addMenuItem(this._createSubMenuItem('Sync', profile));
        menuItem.menu.addMenuItem(this._createSubMenuItem('Delete', profile));
    },

    _createSubMenuItem(action, profile){
        let subMenuItem = new PopupMenu.PopupImageMenuItem(_(action),submenus[action]);
        subMenuItem.profile = profile;
        subMenuItem.action = action;
        subMenuItem.connect('activate', this._subMenuActivated);
        return subMenuItem;
    },

    _createSubMenuItemOld(action, profile){
        let subMenuItem = new PopupMenu.PopupMenuItem(action);
        subMenuItem.profile = profile;
        subMenuItem.action = action;
        subMenuItem.style_class = 'sub-menu-item';
        let icon = new St.Icon({
            icon_name: submenus[action],
            style_class: 'system-status-icon'
        });

        let icoBtn = new St.Button({
            style_class: 'ci-action-btn',
            can_focus: true,
            child: icon,
            x_align: Clutter.ActorAlign.END,
            x_expand: true,
            y_expand: true
        });

        subMenuItem.actor.add_child(icoBtn);
        // subMenuItem.icoBtn = icoBtn;

        subMenuItem.connect('activate', this._subMenuActivated);
        return subMenuItem;
    },

    _subMenuActivated: function (menuItem){
        print(menuItem.profile, menuItem.action);
        const that = this;
        switch (menuItem.action) {
            case 'Watch':
                FileMonitorHelper.init_filemonitor(menuItem.profile);
            break;
            case 'Unwatch':
                FileMonitorHelper.remove_filemonitor(menuItem.profile);
            break;
            case 'Mount':
                FileMonitorHelper.mount(menuItem.profile, mountFlags, function(profile, profileStatus, stderrLines){
                    print('rclone profile',profile);
                    print('rclone profileStatus',profileStatus);
                    print('rclone stderrLines',stderrLines);
                });
            break;
            case 'Umount':
                FileMonitorHelper.umount(menuItem.profile);
            break;
            case 'Open':

            break;
            case 'Backup':
                FileMonitorHelper.backup(rconfigFilePath, menuItem.profile);
            break;
            case 'Restore':
                FileMonitorHelper.restore(menuItem.profile);
            break;
            case 'Reconnect':
                FileMonitorHelper.reconnect(externalTerminal, menuItem.profile);
            break;
            case 'Sync':
                FileMonitorHelper.sync(menuItem.profile);
            break;
            case 'Delete':
                ConfirmDialog.openConfirmDialog( _("Delete?"), 
                    _("Are you sure you want to delte?"), 
                    _("This action cannot be undone"), 
                    _("Confirm"), _("Cancel"), 
                    function() {
                        FileMonitorHelper.deleteConfig(menuItem.profile, 
                            function(){
                                that._buildMenu();
                        })
                    }
                );
            break;

            default:
                break;
        }
    },

    _openRemote: function (autoSet) {
        var that = this;
        print(autoSet);
    },

    _restoreConfig: function() { 

    },

    _editConfig: function() { 

    },

    _addConfig: function() { 
        FileMonitorHelper.addConfig(externalTerminal);
    },

    _onProfileStatusChanged: function(status, profile, action){
        
    },

    _openSettings: function () {
        if (typeof ExtensionUtils.openPrefs === 'function') {
            print('rclone openPrefs');
            ExtensionUtils.openPrefs();
        } else {
            Util.spawn(["gnome-shell-extension-prefs",Me.uuid]);
            print('rclone Util.spawn');
        }
    },

    destroy: function () {

        // Call parent
        this.parent();
    },

/*
    _updateCache: function () {
        let registry = this.clipItemsRadioGroup.map(function (menuItem) {
            return {
                      "contents" : menuItem.clipContents,
                      "favorite" : menuItem.clipFavorite
                   };
        });

        writeRegistry(registry.filter(function (menuItem) {
            if (CACHE_ONLY_FAVORITE) {
                if (menuItem["favorite"]) {
                    return menuItem;
                }
            } else {
                return menuItem;
            }
        }));
    },



    _setupListener () {
        const metaDisplay = Shell.Global.get().get_display();

        if (typeof metaDisplay.get_selection === 'function') {
            const selection = metaDisplay.get_selection();
            this._setupSelectionTracking(selection);
        }
        else {
            this._setupTimeout();
        }
    },

    _setupSelectionTracking (selection) {
        this.selection = selection;
        this._selectionOwnerChangedId = selection.connect('owner-changed', (selection, selectionType, selectionSource) => {
            this._onSelectionChange(selection, selectionType, selectionSource);
        });
    },

    _setupTimeout: function (reiterate) {
        let that = this;
        reiterate = typeof reiterate === 'boolean' ? reiterate : true;

        this._clipboardTimeoutId = Mainloop.timeout_add(TIMEOUT_MS, function () {
            that._refreshIndicator();

            // If the timeout handler returns `false`, the source is
            // automatically removed, so we reset the timeout-id so it won't
            // be removed on `.destroy()`
            if (reiterate === false)
                that._clipboardTimeoutId = null;

            // As long as the timeout handler returns `true`, the handler
            // will be invoked again and again as an interval
            return reiterate;
        });
    },

    _initNotifSource: function () {
        if (!this._notifSource) {
            this._notifSource = new MessageTray.Source('RcloneManager',
                                    INDICATOR_ICON);
            this._notifSource.connect('destroy', Lang.bind(this, function() {
                this._notifSource = null;
            }));
            Main.messageTray.add(this._notifSource);
        }
    },

    _cancelNotification: function() {
        if (this.clipItemsRadioGroup.length >= 2) {
            let clipSecond = this.clipItemsRadioGroup.length - 2;
            let previousClip = this.clipItemsRadioGroup[clipSecond];
            Clipboard.set_text(CLIPBOARD_TYPE, previousClip.clipContents);
            previousClip.setOrnament(PopupMenu.Ornament.DOT);
            previousClip.icoBtn.visible = false;
            previousClip.currentlySelected = true;
        } else {
            Clipboard.set_text(CLIPBOARD_TYPE, "");
        }
        let clipFirst = this.clipItemsRadioGroup.length - 1;
        this._removeEntry(this.clipItemsRadioGroup[clipFirst]);
    },

    _showNotification: function (message, transformFn) {
        let notification = null;

        this._initNotifSource();

        if (this._notifSource.count === 0) {
            notification = new MessageTray.Notification(this._notifSource, message);
        }
        else {
            notification = this._notifSource.notifications[0];
            notification.update(message, '', { clear: true });
        }

        if (typeof transformFn === 'function') {
            transformFn(notification);
        }

        notification.setTransient(true);
        if (Config.PACKAGE_VERSION < '3.38')
            this._notifSource.notify(notification);
        else
            this._notifSource.showNotification(notification);
    },


    _previousEntry: function() {
        let that = this;

        that._clearDelayedSelectionTimeout();

        this._getAllIMenuItems().some(function (mItem, i, menuItems){
            if (mItem.currentlySelected) {
                i--;                                 //get the previous index
                if (i < 0) i = menuItems.length - 1; //cycle if out of bound
                let index = i + 1;                   //index to be displayed
                that._showNotification(index + ' / ' + menuItems.length + ': ' + menuItems[i].label.text);
                if (MOVE_ITEM_FIRST) {
                    that._selectEntryWithDelay(menuItems[i]);
                }
                else {
                    that._selectMenuItem(menuItems[i]);
                }
                return true;
            }
            return false;
        });
    },

    _nextEntry: function() {
        let that = this;

        that._clearDelayedSelectionTimeout();

        this._getAllIMenuItems().some(function (mItem, i, menuItems){
            if (mItem.currentlySelected) {
                i++;                                 //get the next index
                if (i === menuItems.length) i = 0;   //cycle if out of bound
                let index = i + 1;                     //index to be displayed
                that._showNotification(index + ' / ' + menuItems.length + ': ' + menuItems[i].label.text);
                if (MOVE_ITEM_FIRST) {
                    that._selectEntryWithDelay(menuItems[i]);
                }
                else {
                    that._selectMenuItem(menuItems[i]);
                }
                return true;
            }
            return false;
        });
    },

    _toggleMenu: function(){
        this.menu.toggle();
    },

*/

});


function init () {
    let localeDir = Me.dir.get_child('locale');
    Gettext.bindtextdomain('rclone-manager', localeDir.get_path());
}

let rcloneManager;
function enable () {
    rcloneManager = new RcloneManager();
    Main.panel.addToStatusArea('rcloneManager', rcloneManager, 1);
}

function disable () {
    rcloneManager.destroy();
}
