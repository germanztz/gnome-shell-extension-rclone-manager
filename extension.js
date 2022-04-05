const Config     = imports.misc.config;
const GLib       = imports.gi.GLib;
const Lang       = imports.lang;
const St         = imports.gi.St;
const Util       = imports.misc.util;
const MessageTray = imports.ui.messageTray;
const Main      = imports.ui.main;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;
const Gettext = imports.gettext;
const _ = Gettext.domain('rclone-manager').gettext;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Prefs = Me.imports.prefs;

const fmh = Me.imports.fileMonitorHelper;
const ConfirmDialog = Me.imports.confirmDialog;

const INDICATOR_ICON = 'drive-multidisk-symbolic';
const PROFILE_IDLE_ICON = 'radio-symbolic';
const PROFILE_WATCHED_ICON = 'folder-saved-search-symbolic';
const PROFILE_MOUNTED_ICON = 'folder-remote-symbolic';
const PROFILE_BUSSY_ICON = 'system-run-symbolic';
const PROFILE_ERROR_ICON = 'dialog-warning-symbolic';

let PREF_AUTOSYNC = true;

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
    'Delete': 'user-trash-symbolic',
    'Error': 'dialog-warning-symbolic',
    'Log': 'dialog-warning-symbolic',
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
        this._configs = fmh.listremotes();
        this._mounts = fmh.getMounts();
        this._buildMenu(this._configs);
        Object.entries(this._registry).forEach( registryProfile => 
            this._initProfile(registryProfile[0], registryProfile[1]));
    },

    _loadSettings: function () {
        this._settings = Prefs.Settings;
        this._settingsChangedId = this._settings.connect('changed',
            Lang.bind(this, this._onSettingsChange));

        this._onSettingsChange();
    },

    _onSettingsChange: function () {

        fmh.PREF_RCONFIG_FILE_PATH      = this._settings.get_string(Prefs.Fields.PREFKEY_RCONFIG_FILE_PATH);
        fmh.PREF_BASE_MOUNT_PATH        = this._settings.get_string(Prefs.Fields.PREFKEY_BASE_MOUNT_PATH);
        fmh.PREF_IGNORE_PATTERNS        = this._settings.get_string(Prefs.Fields.PREFKEY_IGNORE_PATTERNS);
        fmh.PREF_EXTERNAL_TERMINAL      = this._settings.get_string(Prefs.Fields.PREFKEY_EXTERNAL_TERMINAL);
        fmh.PREF_EXTERNAL_FILE_BROWSER  = this._settings.get_string(Prefs.Fields.PREFKEY_EXTERNAL_FILE_BROWSER);
        PREF_AUTOSYNC                   = this._settings.get_boolean(Prefs.Fields.PREFKEY_AUTOSYNC);
        fmh.PREF_RC_CREATE_DIR 	        = this._settings.get_string(Prefs.Fields.PREFKEY_RC_CREATE_DIR);
        fmh.PREF_RC_DELETE_DIR 	        = this._settings.get_string(Prefs.Fields.PREFKEY_RC_DELETE_DIR);
        fmh.PREF_RC_DELETE_FILE 	    = this._settings.get_string(Prefs.Fields.PREFKEY_RC_DELETE_FILE);
        fmh.PREF_RC_MOUNT 		        = this._settings.get_string(Prefs.Fields.PREFKEY_RC_MOUNT);
        fmh.PREF_RC_SYNC  		        = this._settings.get_string(Prefs.Fields.PREFKEY_RC_SYNC);
        this._registry                  = this._readRegistry(this._settings.get_string(Prefs.Fields.HIDDENKEY_PROFILE_REGISTRY));
        
        
        fmh.PREF_BASE_MOUNT_PATH = fmh.PREF_BASE_MOUNT_PATH.replace('~',GLib.get_home_dir());
		if(!fmh.PREF_BASE_MOUNT_PATH.endsWith('/')) fmh.PREF_BASE_MOUNT_PATH = fmh.PREF_BASE_MOUNT_PATH+'/';

        fmh.PREF_RCONFIG_FILE_PATH = fmh.PREF_RCONFIG_FILE_PATH.replace('~',GLib.get_home_dir());
    },

    _initProfile: function(profile, regProf){
        log('_initProfile', profile, JSON.stringify(regProf))
        const that = this;
        if(regProf['syncType'] === 'Watch'){

            if(PREF_AUTOSYNC) {
                that._onProfileStatusChanged(profile, fmh.ProfileStatus.BUSSY);
                fmh.sync(profile, function (profile, status, message){
                    fmh.init_filemonitor(profile, 
                        function (profile, status, message){that._onProfileStatusChanged(profile, status, message);});
                });
            } else {
                fmh.init_filemonitor(profile, 
                    function (profile, status, message){that._onProfileStatusChanged(profile, status, message);});
            }
        } else if(this._mounts.includes(profile)){
            //if is already mounted just leave it
            this._onProfileStatusChanged(profile, fmh.ProfileStatus.MOUNTED, profile + _(' was already mounted'));

        } else if(regProf['syncType'] === 'Mount'){
            fmh.mount(profile, 
                function (profile, status, message){that._onProfileStatusChanged(profile, status, message);});
        }

    },

    _buildMenu: function (profiles) {
        //clean menu
        this.menu._getMenuItems().forEach(function (i) { i.destroy(); });

        // for (let profile in Object.entries(profiles)){
        Object.entries(profiles).forEach(entry => {
            this.menu.addMenuItem(this._buildMenuItem(entry[0], fmh.getStatus(entry[0])));
        });
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

        if(this._configs[profile].hasOwnProperty('log')){
            menuItem.menu.addMenuItem(this._buildSubMenuItem('Log', profile));
        }
    },

    _buildSubMenuItem: function(action, profile){
        let subMenuItem = new PopupMenu.PopupImageMenuItem(_(action),submenus[action]);
        subMenuItem.profile = profile;
        subMenuItem.action = action;
        subMenuItem.connect('activate', Lang.bind(this, this._onSubMenuActivated));
        return subMenuItem;
    },

    _onSubMenuActivated: function (menuItem){
        log('_onSubMenuActivated', menuItem.profile, menuItem.action);
        if(['Watch', 'Unwatch', 'Mount', 'Umount', 'Sync'].includes(menuItem.action))
            this._onProfileStatusChanged(menuItem.profile, fmh.ProfileStatus.BUSSY);

        switch (menuItem.action) {
            case 'Watch':
                fmh.init_filemonitor(menuItem.profile,  
                    (profile, status, message) => {this._onProfileStatusChanged(profile, status, message);});
            break;
            case 'Unwatch':
                fmh.remove_filemonitor(menuItem.profile,
                    (profile, status, message) => {this._onProfileStatusChanged(profile, status, message);});
            break;
            case 'Mount':
                fmh.mount(menuItem.profile,
                    (profile, status, message) => {this._onProfileStatusChanged(profile, status, message);});
            break;
            case 'Umount':
                fmh.umount(menuItem.profile, 
                    (profile, status, message) => {this._onProfileStatusChanged(profile, status, message);});
            break;
            case 'Sync':
                fmh.sync(menuItem.profile,
                    (profile, status, message) => {this._onProfileStatusChanged(profile, status, message);});
            break;
            case 'Open':
                fmh.open(menuItem.profile);
            break;
            case 'Backup':
                fmh.backup(menuItem.profile);
            break;
            case 'Restore':
                fmh.restore(menuItem.profile);
            break;
            case 'Reconnect':
                fmh.reconnect(menuItem.profile);
            break;
            case 'Delete':
                let that = this;
                ConfirmDialog.openConfirmDialog( _("Delete?"), 
                    _("Are you sure you want to delete?"), 
                    "This action cannot be undone", 
                    _("Confirm"), _("Cancel"), 
                    function() {
                        fmh.deleteConfig(menuItem.profile, 
                            (profile, status, message) => {that._onProfileStatusChanged(profile, status, message);});
                    }
                );
            break;
            case 'Log':
                ConfirmDialog.openConfirmDialog( _("Log Detail"), menuItem.profile, this._configs[menuItem.profile].log, _("Ok"), null, function(){} )
            break;

            default:
                break;
        }
        this.menu.toggle();
    },

    _readRegistry: function(registry){
        log('_readRegistry', registry);
        try {
            return JSON.parse(registry);
        }
        catch (e) {
            logError(e, 'rclone-manager Error on read registry');
            return {};
        }

    },

    _updateRegistry: function(key, value){
        this._registry[key]=value;
        log('_updateRegistry',JSON.stringify(this._registry));
        this._settings.set_string(Prefs.Fields.HIDDENKEY_PROFILE_REGISTRY, JSON.stringify(this._registry));
    },

    _openRemote: function (autoSet) {
        var that = this;
        log(autoSet);
    },

    _restoreConfig: function() { 

    },

    _addConfig: function() { 
        fmh.addConfig();
    },

    _onProfileStatusChanged: function(profile, status, message){
        log('_onProfileStatusChanged', profile, status, message);
        let mItem = this._findProfileMenu(profile);
        let that = this;
        switch (status) {
        case fmh.ProfileStatus.DELETED:
            mItem.destroy();
            return;

        case fmh.ProfileStatus.ERROR:
            this.icon.icon_name=PROFILE_ERROR_ICON;
            this._showNotification(profile + ' error: '+message , n => {
                n.addAction(_('Details'), Lang.bind(that, function() {
                    ConfirmDialog.openConfirmDialog( _("Log detail"), profile, _(message), _("Ok"), null, function(){} )
                }));
            });
            break;

        case fmh.ProfileStatus.BUSSY:
            this.icon.icon_name=PROFILE_BUSSY_ICON;
            break;
            
        case fmh.ProfileStatus.MOUNTED:
        case fmh.ProfileStatus.WATCHED:
        case fmh.ProfileStatus.DISCONNECTED:
            this._updateRegistry(profile, { syncType: status});
        default:
            this.icon.icon_name=INDICATOR_ICON;
            break;
        }
        if(message) {this.addLog(profile, message)}
        this._setMenuIcon(mItem, status);
        this._buildSubmenu(mItem, profile, fmh.getStatus(profile));

    },

    addLog: function(profile, message){
        if(this._configs[profile].hasOwnProperty('log')){
            this._configs[profile].log = this._configs[profile].log + '\n' + message;
        } else{
            this._configs[profile].log = message;
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
            case fmh.ProfileStatus.DELETED:                        
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
