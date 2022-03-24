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

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Prefs = Me.imports.prefs;

const fmh = Me.imports.fileMonitorHelper;
const Utils = Me.imports.utils;
const ConfirmDialog = Me.imports.confirmDialog;

const INDICATOR_ICON = 'drive-multidisk-symbolic';
const PROFILE_IDLE_ICON = 'radio-symbolic';
const PROFILE_WATCHED_ICON = 'folder-saved-search-symbolic';
const PROFILE_MOUNTED_ICON = 'folder-remote-symbolic';
const PROFILE_BUSSY_ICON = 'system-run-symbolic';
const PROFILE_ERROR_ICON = 'dialog-warning-symbolic';

let RCONFIG_FILE_PATH     = "~/.config/rclone/rclone.conf";
let BASE_MOUNT_PATH       = "~/";
let IGNORE_PATTERNS      = '.remmina.,~lock,.tmp,.log';
let EXTERNAL_TERMINAL    = 'gnome-terminal --window -- ';
let EXTERNAL_FILE_BROWSER = 'nautilus';
let EXTERNAL_TEXT_EDITOR      = 'gedit';
// let MOUNT_FLAGS          = '--file-perms 0777 --allow-non-empty --allow-other --write-back-cache --no-modtime';
let AUTOSYNC            = true;
let RC_LIST_REMOTES 	= 'rclone listremotes'
let RC_CREATE_DIR 	    = 'rclone copy %source %profile:%destination --create-empty-src-dirs';
let RC_DELETE_DIR 	    = 'rclone purge %profile:%destination --ignore-errors';
let RC_DELETE_FILE 	    = 'rclone delete %profile:%destination --ignore-errors';
let RC_MOUNT 			= 'rclone mount %profile:%source --volname %profile --file-perms 0777 --allow-non-empty --allow-other --write-back-cache --no-modtime';
let RC_SYNC  			= 'rclone sync %profile: %source --create-empty-src-dirs';
let RC_COPYTO  		    = 'rclone copyto %profile:%destination %source';
let RC_ADDCONFIG 		= 'rclone config';
let RC_DELETE 		    = 'rclone config delete %profile';
let RC_RECONNECT  	    = 'rclone config reconnect %profile: %flags';
let RC_UMOUNT 		    = 'umount %source';
let RC_GETMOUNTS 		= 'mount';

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

const RcloneManager = Lang.Class({
    Name: 'RcloneManager',
    Extends: PanelMenu.Button,

    _settingsChangedId: null,
    _clipboardTimeoutId: null,
    _selectionOwnerChangedId: null,
    _historyLabelTimeoutId: null,
    _historyLabel: null,
    _disableDownArrow: null,
    _configs: [],
    _mounts: [],
    _registry: {},

    _init: function() {
        this.parent(0.0, "RcloneManager");
        this._shortcutsBindingIds = [];
        this.clipItemsRadioGroup = [];

        let hbox = new St.BoxLayout({ style_class: 'panel-status-menu-box rclone-manager-hbox' });
        this.icon = new St.Icon({ icon_name: INDICATOR_ICON,
            style_class: 'system-status-icon rclone-manager-icon' });
        hbox.add_child(this.icon);
        this.add_child(hbox);

        this._loadSettings();
        this._configs = fmh.listremotes(RC_LIST_REMOTES);
        this._mounts = fmh.getMounts(RC_GETMOUNTS);
        this._buildMenu(this._configs);
        const that = this;
        Utils.readRegistry(function (registry) {
            that._registry = registry;
            Object.entries(that._registry).forEach( registryProfile => 
                that._initProfile(registryProfile[0], registryProfile[1]));
        });
    },

    _loadSettings: function () {
        this._settings = Prefs.SettingsSchema;
        this._settingsChangedId = this._settings.connect('changed',
            Lang.bind(this, this._onSettingsChange));

        this._onSettingsChange();
    },

    _onSettingsChange: function () {
        RCONFIG_FILE_PATH = this._settings.get_string(Prefs.Fields.RCONFIG_FILE_PATH);
        BASE_MOUNT_PATH = this._settings.get_string(Prefs.Fields.BASE_MOUNT_PATH);
        IGNORE_PATTERNS = this._settings.get_string(Prefs.Fields.IGNORE_PATTERNS);
        EXTERNAL_TERMINAL = this._settings.get_string(Prefs.Fields.EXTERNAL_TERMINAL);
        EXTERNAL_FILE_BROWSER = this._settings.get_string(Prefs.Fields.EXTERNAL_FILE_BROWSER);
        EXTERNAL_TEXT_EDITOR = this._settings.get_string(Prefs.Fields.EXTERNAL_TEXT_EDITOR);
        // MOUNT_FLAGS = this._settings.get_string(Prefs.Fields.MOUNT_FLAGS);
        AUTOSYNC = this._settings.get_boolean(Prefs.Fields.AUTOSYNC);
        RC_LIST_REMOTES = this._settings.get_string(Prefs.Fields.RC_LIST_REMOTES);
        RC_CREATE_DIR 	= this._settings.get_string(Prefs.Fields.RC_CREATE_DIR);
        RC_DELETE_DIR 	= this._settings.get_string(Prefs.Fields.RC_DELETE_DIR);
        RC_DELETE_FILE 	= this._settings.get_string(Prefs.Fields.RC_DELETE_FILE);
        RC_MOUNT 		= this._settings.get_string(Prefs.Fields.RC_MOUNT);
        RC_SYNC  		= this._settings.get_string(Prefs.Fields.RC_SYNC);
        RC_COPYTO  		= this._settings.get_string(Prefs.Fields.RC_COPYTO);
        RC_ADDCONFIG 	= this._settings.get_string(Prefs.Fields.RC_ADDCONFIG);
        RC_DELETE 		= this._settings.get_string(Prefs.Fields.RC_DELETE);
        RC_RECONNECT  	= this._settings.get_string(Prefs.Fields.RC_RECONNECT);
        RC_UMOUNT 		= this._settings.get_string(Prefs.Fields.RC_UMOUNT);
        RC_GETMOUNTS 	= this._settings.get_string(Prefs.Fields.RC_GETMOUNTS);
        
        BASE_MOUNT_PATH = BASE_MOUNT_PATH.replace('~',GLib.get_home_dir());
		if(!BASE_MOUNT_PATH.endsWith('/')) BASE_MOUNT_PATH = BASE_MOUNT_PATH+'/';

        RCONFIG_FILE_PATH = RCONFIG_FILE_PATH.replace('~',GLib.get_home_dir());
    },

    _initProfile: function(profile, regProf){
        log('_initProfile', profile, JSON.stringify(regProf))
        const that = this;
        if(regProf['syncType'] === 'Watch'){

            if(AUTOSYNC) {
                that._onProfileStatusChanged(profile, fmh.ProfileStatus.BUSSY);
                fmh.sync(RC_SYNC, profile, BASE_MOUNT_PATH, function (profile, status, message){
                    fmh.init_filemonitor(profile, IGNORE_PATTERNS, BASE_MOUNT_PATH, 
                        function (profile, status, message){that._onProfileStatusChanged(profile, status, message);});
                });
            } else {
                fmh.init_filemonitor(profile, IGNORE_PATTERNS, BASE_MOUNT_PATH, 
                    function (profile, status, message){that._onProfileStatusChanged(profile, status, message);});
            }
        } else if(regProf['syncType'] === 'Mount'){
            fmh.mount(RC_MOUNT, regProf, BASE_MOUNT_PATH, 
                function (profile, status, message){that._onProfileStatusChanged(profile, status, message);});
        }

    },

    _buildMenu: function (profiles) {
        //clean menu
        this.menu._getMenuItems().forEach(function (i) { i.destroy(); });

        for (let profile in profiles){
            this.menu.addMenuItem(this._buildMenuItem(profiles[profile], fmh.getStatus(profiles[profile])));
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
    _buildMenuItem(profile, status){
		let menuItem = new PopupMenu.PopupSubMenuMenuItem(profile, true);
        menuItem.profile = profile;
        this._setMenuIcon(menuItem, status)
        this._buildSubmenu(menuItem, profile, status);
        return menuItem
    },

    _buildSubmenu: function(menuItem, profile, status){

        //clean submenu
        menuItem.menu._getMenuItems().forEach(function (i) { i.destroy(); });

        menuItem.menu.box.style_class = 'menuitem-menu-box';

        if(status == fmh.ProfileStatus.MOUNTED){
            menuItem.menu.addMenuItem(this._buildSubMenuItem('Umount', profile));
        } else if (status == fmh.ProfileStatus.WATCHED) {
            menuItem.menu.addMenuItem(this._buildSubMenuItem('Unwatch', profile));
        }
        else{
            menuItem.menu.addMenuItem(this._buildSubMenuItem('Mount', profile));
            menuItem.menu.addMenuItem(this._buildSubMenuItem('Watch', profile));
            menuItem.menu.addMenuItem(this._buildSubMenuItem('Reconnect', profile));
        }

        if (status == fmh.ProfileStatus.MOUNTED || status == fmh.ProfileStatus.WATCHED){
            menuItem.menu.addMenuItem(this._buildSubMenuItem('Open', profile));
            menuItem.menu.addMenuItem(this._buildSubMenuItem('Backup', profile));
        }

        menuItem.menu.addMenuItem(this._buildSubMenuItem('Sync', profile));
        menuItem.menu.addMenuItem(this._buildSubMenuItem('Delete', profile));
    },

    _buildSubMenuItem: function(action, profile){
        let subMenuItem = new PopupMenu.PopupImageMenuItem(_(action),submenus[action]);
        subMenuItem.profile = profile;
        subMenuItem.action = action;
        subMenuItem.connect('activate', Lang.bind(this, this._onSubMenuActivated));
        return subMenuItem;
    },

    _buildSubMenuItemOld: function(action, profile){
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

        subMenuItem.connect('activate', this._onSubMenuActivated);
        return subMenuItem;
    },

    _onSubMenuActivated: function (menuItem){
        log('_onSubMenuActivated', menuItem.profile, menuItem.action);
        switch (menuItem.action) {
            case 'Watch':
                this._updateRegistry(menuItem.profile, { syncType:menuItem.action});
                fmh.init_filemonitor(menuItem.profile, IGNORE_PATTERNS, BASE_MOUNT_PATH, 
                    (profile, status, message) => {this._onProfileStatusChanged(profile, status, message);});
            break;
            case 'Unwatch':
                this._updateRegistry(menuItem.profile, { syncType:menuItem.action});
                fmh.remove_filemonitor(menuItem.profile,
                    (profile, status, message) => {this._onProfileStatusChanged(profile, status, message);});
            break;
            case 'Mount':
                this._updateRegistry(menuItem.profile, { syncType:menuItem.action});
                fmh.mount(RC_MOUNT, menuItem.profile, BASE_MOUNT_PATH,
                    (profile, status, message) => {this._onProfileStatusChanged(profile, status, message);});
            break;
            case 'Umount':
                this._updateRegistry(menuItem.profile, { syncType:menuItem.action});
                fmh.umount(RC_UMOUNT, menuItem.profile, BASE_MOUNT_PATH, 
                    (profile, status, message) => {this._onProfileStatusChanged(profile, status, message);});
            break;
            case 'Open':

            break;
            case 'Backup':
                fmh.backup(RC_COPYTO, RCONFIG_FILE_PATH, menuItem.profile);
            break;
            case 'Restore':
                fmh.restore(menuItem.profile);
            break;
            case 'Reconnect':
                fmh.reconnect(EXTERNAL_TERMINAL, RC_RECONNECT, menuItem.profile);
            break;
            case 'Sync':
                this._onProfileStatusChanged(menuItem.profile, fmh.ProfileStatus.BUSSY);
                fmh.sync(RC_SYNC, menuItem.profile, BASE_MOUNT_PATH,
                    (profile, status, message) => {this._onProfileStatusChanged(profile, status, message);});
            break;
            case 'Delete':
                ConfirmDialog.openConfirmDialog( _("Delete?"), 
                    _("Are you sure you want to delete?"), 
                    _("This action cannot be undone"), 
                    _("Confirm"), _("Cancel"), 
                    function() {
                        fmh.deleteConfig(RC_DELETE, menuItem.profile, BASE_MOUNT_PATH, 
                            (profile, status, message) => {this._onProfileStatusChanged(profile, status, message);});
                    }
                );
            break;

            default:
                break;
        }
        this.menu.toggle();
    },

    _updateRegistry: function(key, value){
        this._registry[key]=value;
        Utils.writeRegistry(this._registry);
    },

    _openRemote: function (autoSet) {
        var that = this;
        log(autoSet);
    },

    _restoreConfig: function() { 

    },

    _editConfig: function() { 

    },

    _addConfig: function() { 
        fmh.addConfig(EXTERNAL_TERMINAL, RC_ADDCONFIG);
    },

    _onProfileStatusChanged: function(profile, status, message){
        log('_onProfileStatusChanged', profile, status, message);
        let mItem = this._findProfileMenu(profile);
        let that = this;
        switch (status) {
        case fmh.ProfileStatus.DELETED:
            mItem.destroy();
        break;
        case fmh.ProfileStatus.ERROR:
            this.icon.icon_name=PROFILE_ERROR_ICON;
            this._showNotification(profile + ' error: '+message /*, n => {
                n.addAction(_('Details'), Lang.bind(that, ConfirmDialog.openConfirmDialog( _("Error Detail"), 
                    profile, message, _("Ok"), _("Cancel"), function(){} )));
            }*/);
            this._setMenuIcon(mItem, status);
            this._buildSubmenu(mItem, profile, fmh.getStatus(profile));
            break;
        case fmh.ProfileStatus.BUSSY:
            this.icon.icon_name=PROFILE_BUSSY_ICON;
            this._setMenuIcon(mItem, status);
            this._buildSubmenu(mItem, profile, fmh.getStatus(profile));
            break;
        default:
            this.icon.icon_name=INDICATOR_ICON;
            this._setMenuIcon(mItem, status);
            this._buildSubmenu(mItem, profile, status);
        break;
        }

    },

    _findProfileMenu: function(profile){
        let retItem = null;
        this.menu._getMenuItems().forEach(function (mItem, i, menuItems){
            if (mItem.profile && mItem.profile == profile){
                retItem = mItem;
            }
        });
        return retItem;
    },

    _setMenuIcon: function(menuItem, status){
        log('_setMenuIcon', menuItem.profile, status);
        switch (status) {
            case fmh.ProfileStatus.MOUNTED:                        
                menuItem.icon.icon_name = PROFILE_MOUNTED_ICON
            break;
            case fmh.ProfileStatus.WATCHED:                        
                menuItem.icon.icon_name = PROFILE_WATCHED_ICON
            break;
            case fmh.ProfileStatus.BUSSY:                        
                menuItem.icon.icon_name = PROFILE_BUSSY_ICON
            break;
            case fmh.ProfileStatus.ERROR:                        
                menuItem.icon.icon_name = PROFILE_ERROR_ICON
            break;
            default:
                menuItem.icon.icon_name = PROFILE_IDLE_ICON
            break;
        }
    },

    _openSettings: function () {
        if (typeof ExtensionUtils.openPrefs === 'function') {
            log(' openPrefs');
            ExtensionUtils.openPrefs();
        } else {
            Util.spawn(["gnome-shell-extension-prefs",Me.uuid]);
            log(' Util.spawn');
        }
    },


    _initNotifSource: function () {
        if (!this._notifSource) {
            this._notifSource = new MessageTray.Source('RcloneManager', INDICATOR_ICON);
            this._notifSource.connect('destroy', Lang.bind(this, function() {
                this._notifSource = null;
            }));
            Main.messageTray.add(this._notifSource);
        }
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
        if (Config.PACKAGE_VERSION < '3.36')
            this._notifSource.notify(notification);
        else
            this._notifSource.showNotification(notification);
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
