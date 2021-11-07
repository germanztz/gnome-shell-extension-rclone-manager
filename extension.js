const Clutter    = imports.gi.Clutter;
const Config     = imports.misc.config;
const Gio        = imports.gi.Gio;
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

const SETTING_KEY_CLEAR_HISTORY = "clear-history";
const SETTING_KEY_PREV_ENTRY = "prev-entry";
const SETTING_KEY_NEXT_ENTRY = "next-entry";
const SETTING_KEY_TOGGLE_MENU = "toggle-menu";
const INDICATOR_ICON = 'folder-remote-symbolic';

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Utils = Me.imports.utils;
const ConfirmDialog = Me.imports.confirmDialog;
const Prefs = Me.imports.prefs;
const prettyPrint = Utils.prettyPrint;
const writeRegistry = Utils.writeRegistry;
const readRegistry = Utils.readRegistry;

const FileMonitorHelper = Me.imports.fileMonitorHelper;

let RCONFIG_FILE_PATH    = "~/.config/rclone/rclone.conf";
let BASE_MOUNT_PATH    = "~";
let IGNORE_PATTERNS      = '.remmina.,~lock,.tmp,.log';

const submenus = {
    'Watch': 'folder-saved-search-symbolic',
    'Unwatch': 'image-zoom-out-symbolic',
    'Mount': 'folder-remote-symbolic',
    'Umount': 'image-zoom-out-symbolic',
    'Open': 'window-new-symbolic',
    'Backup': 'mail-outbox-symbolic',
    'Restore': 'object-rotate-left-symbolic',
    'Reconnect': 'mail-send-receive-symbolic',
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
    _rconfig: null,
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
        RCONFIG_FILE_PATH = this._settings.get_string(Prefs.Fields.RCONFIG_FILE_PATH);
        BASE_MOUNT_PATH = this._settings.get_string(Prefs.Fields.BASE_MOUNT_PATH);
        IGNORE_PATTERNS = this._settings.get_string(Prefs.Fields.IGNORE_PATTERNS);

        this._loadConfigs();
        this._buildMenu();
        FileMonitorHelper.automount(this._rconfig, this._onProfileStatusChanged);
    },

    _loadConfigs: function() {
        this._rconfig = Utils.parseConfigFile(RCONFIG_FILE_PATH);
    },
    
    _buildMenu: function () {
        //clean menu
        this.menu._getMenuItems().forEach(function (i) { i.destroy(); });

        for (let profile in this._rconfig){
            this.menu.addMenuItem(this._getMenuItem(profile, this._rconfig[profile]));
        }
        // Add separator
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());


        // Add 'Add config' button which adds new config to rclone
        let addMenuItem = new PopupMenu.PopupMenuItem(_('Add config'));
        this.menu.addMenuItem(addMenuItem);
        addMenuItem.connect('activate', Lang.bind(this, this._addConfig));

        // // Add 'Restore config' button which restores rclonefile from a mount
        // let retoreMenuItem = new PopupMenu.PopupMenuItem(_('Restore config'));
        // this.menu.addMenuItem(retoreMenuItem);
        // retoreMenuItem.connect('activate', Lang.bind(this, this._restoreConfig));

        // Add 'Edit config' button which edits an existing rclone config
        let editMenuItem = new PopupMenu.PopupMenuItem(_('Edit config'));
        this.menu.addMenuItem(editMenuItem);
        editMenuItem.connect('activate', Lang.bind(this, this._editConfig));

        // Add 'Settings' menu item to open settings
        let settingsMenuItem = new PopupMenu.PopupMenuItem(_('Settings'));
        this.menu.addMenuItem(settingsMenuItem);
        settingsMenuItem.connect('activate', Lang.bind(this, this._openSettings));
    },
    
    /**
     * https://github.com/julio641742/gnome-shell-extension-reference/blob/master/tutorials/POPUPMENU-EXTENSION.md
     * @param {string} profile
     * @param {Array} rconfig
     * @returns {PopupSubMenuMenuItem}
     */
    _getMenuItem(profile, rconfig){
        isMounted = this._mounts.some(item => item == profile);
		let menuItem = new PopupMenu.PopupSubMenuMenuItem(profile, true);
        this._addSubmenu(menuItem, profile, rconfig, isMounted, false);
        return menuItem
    },

    _addSubmenu: function(menuItem, profile, rconfig, isMounted, isInotify){

        if(isMounted){
            menuItem.menu.addMenuItem(this._getSubMenuItem('Umount', profile, rconfig));
        } else if (isInotify) {
            menuItem.menu.addMenuItem(this._getSubMenuItem('Unwatch', profile, rconfig));
        }
        else{
            menuItem.menu.addMenuItem(this._getSubMenuItem('Mount', profile, rconfig));
            menuItem.menu.addMenuItem(this._getSubMenuItem('Watch', profile, rconfig));
            menuItem.menu.addMenuItem(this._getSubMenuItem('Reconnect', profile, rconfig));
        }

        if (isInotify || isMounted){
            menuItem.menu.addMenuItem(this._getSubMenuItem('Open', profile, rconfig));
            menuItem.menu.addMenuItem(this._getSubMenuItem('Backup', profile, rconfig));
        }

        menuItem.menu.addMenuItem(this._getSubMenuItem('Sync', profile, rconfig));
        menuItem.menu.addMenuItem(this._getSubMenuItem('Delete', profile, rconfig));

		// The CSS from our file is automatically imported
		// You can add custom styles like this
		// REMOVE THIS AND SEE WHAT HAPPENS
		menuItem.menu.box.style_class = 'PopupSubMenuMenuItemStyle';

        // menuItem.menu._getMenuItems().forEach(function (mItem, i, menuItems){});

    },

    _getSubMenuItem(action, profile, rconfig){
        subMenuItem = new PopupMenu.PopupMenuItem(action);
        subMenuItem.profile = profile;
        subMenuItem.rconfig = rconfig;
        subMenuItem.action = action;
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
        switch (menuItem.action) {
            case 'Watch':
                FileMonitorHelper.init_filemonitor(menuItem.profile);
            break;
            case 'Unwatch':
                FileMonitorHelper.remove_filemonitor(menuItem.profile);
            break;
            case 'Mount':
                FileMonitorHelper.mount(menuItem.profile, function(status, stdoutLines, stderrLines){
                    print('rclone onRcloneFinished',status);
                    print('rclone stdoutLines',stdoutLines.join('\n'));
                    print('rclone stderrLines',stderrLines.join('\n'));
                });
            break;
            case 'Umount':
                FileMonitorHelper.umount(menuItem.profile);
            break;
            case 'Open':

            break;
            case 'Backup':
                FileMonitorHelper.backup(menuItem.profile);
            break;
            case 'Restore':
                FileMonitorHelper.restore(menuItem.profile);
            break;
            case 'Reconnect':
                FileMonitorHelper.reconnect(menuItem.profile);
            break;
            case 'Sync':
                FileMonitorHelper.sync(menuItem.profile);
            break;
            case 'Delete':

            break;

            default:
                break;
        }
    },

    _openRemote: function (autoSet) {
        var that = this;
        print(autoSet);
        print(that.rconfig.type);
    },

    _restoreConfig: function() { 

    },

    _editConfig: function() { 

    },

    _addConfig: function() { 

    },

    _onProfileStatusChanged: function(status, profile, action){
        
    },

    _truncate: function(string, length) {
        let shortened = string.replace(/\s+/g, ' ');

        if (shortened.length > length)
            shortened = shortened.substring(0,length-1) + '...';

        return shortened;
    },

    _setEntryLabel: function (menuItem) {
        let buffer = menuItem.clipContents;
        menuItem.label.set_text(this._truncate(buffer, MAX_ENTRY_LENGTH));
    },

    _addEntry: function (buffer, favorite, autoSelect, autoSetClip) {
        let menuItem = new PopupMenu.PopupMenuItem('');

        menuItem.menu = this.menu;
        menuItem.clipContents = buffer;
        menuItem.clipFavorite = favorite;
        menuItem.radioGroup = this.clipItemsRadioGroup;
        menuItem.buttonPressId = menuItem.connect('activate',
            Lang.bind(menuItem, this._onMenuItemSelectedAndMenuClose));

        this._setEntryLabel(menuItem);
        this.clipItemsRadioGroup.push(menuItem);

	// Favorite button
        let icon_name = favorite ? 'starred-symbolic' : 'non-starred-symbolic';
        let iconfav = new St.Icon({
            icon_name: icon_name,
            style_class: 'system-status-icon'
        });

        let icofavBtn = new St.Button({
            style_class: 'ci-action-btn',
            can_focus: true,
            child: iconfav,
            x_align: Clutter.ActorAlign.END,
            x_expand: true,
            y_expand: true
        });

        menuItem.actor.add_child(icofavBtn);
        menuItem.icofavBtn = icofavBtn;
        menuItem.favoritePressId = icofavBtn.connect('button-press-event',
            Lang.bind(this, function () {
                this._favoriteToggle(menuItem);
            })
        );

	// Delete button
        let icon = new St.Icon({
            icon_name: 'edit-delete-symbolic', //'mail-attachment-symbolic',
            style_class: 'system-status-icon'
        });

        let icoBtn = new St.Button({
            style_class: 'ci-action-btn',
            can_focus: true,
            child: icon,
            x_align: Clutter.ActorAlign.END,
            x_expand: false,
            y_expand: true
        });

        menuItem.actor.add_child(icoBtn);
        menuItem.icoBtn = icoBtn;
        menuItem.deletePressId = icoBtn.connect('button-press-event',
            Lang.bind(this, function () {
                this._removeEntry(menuItem, 'delete');
            })
        );

        if (favorite) {
            this.favoritesSection.addMenuItem(menuItem, 0);
        } else {
            this.historySection.addMenuItem(menuItem, 0);
        }

        if (autoSelect === true)
            this._selectMenuItem(menuItem, autoSetClip);


        this._updateCache();
    },

    _favoriteToggle: function (menuItem) {
        menuItem.clipFavorite = menuItem.clipFavorite ? false : true;
        this._moveItemFirst(menuItem);

        this._updateCache();
    },
  
    _confirmRemoveAll: function () {
        const title = _("Clear all?");
        const message = _("Are you sure you want to delete all clipboard items?");
        const sub_message = _("This operation cannot be undone.");

        ConfirmDialog.openConfirmDialog(title, message, sub_message, _("Clear"), _("Cancel"), () => {
            let that = this;
            that._clearHistory();
        }
      );
    },

    _clearHistory: function () {
        let that = this;
        // We can't actually remove all items, because the clipboard still
        // has data that will be re-captured on next refresh, so we remove
        // all except the currently selected item
        // Don't remove favorites here
        that.historySection._getMenuItems().forEach(function (mItem) {
            if (!mItem.currentlySelected) {
                let idx = that.clipItemsRadioGroup.indexOf(mItem);
                mItem.destroy();
                that.clipItemsRadioGroup.splice(idx, 1);
            }
        });
        that._updateCache();
        that._showNotification(_("Clipboard history cleared"));    
    },

    _removeAll: function () {
        var that = this;

        if (CONFIRM_ON_CLEAR) {
            that._confirmRemoveAll();
        } else {
            that._clearHistory();
        }
    },

    _removeEntry: function (menuItem, event) {
        let itemIdx = this.clipItemsRadioGroup.indexOf(menuItem);

        if(event === 'delete' && menuItem.currentlySelected) {
            Clipboard.set_text(CLIPBOARD_TYPE, "");
        }

        menuItem.destroy();
        this.clipItemsRadioGroup.splice(itemIdx,1);

        this._updateCache();
    },

    _removeOldestEntries: function () {
        let that = this;

        let clipItemsRadioGroupNoFavorite = that.clipItemsRadioGroup.filter(
            item => item.clipFavorite === false);

        while (clipItemsRadioGroupNoFavorite.length > MAX_REGISTRY_LENGTH) {
            let oldestNoFavorite = clipItemsRadioGroupNoFavorite.shift();
            that._removeEntry(oldestNoFavorite);

            clipItemsRadioGroupNoFavorite = that.clipItemsRadioGroup.filter(
                item => item.clipFavorite === false);
        }

        that._updateCache();
    },

    _onMenuItemSelected: function (autoSet) {
        var that = this;
        that.radioGroup.forEach(function (menuItem) {
            let clipContents = that.clipContents;

            if (menuItem === that && clipContents) {
                that.setOrnament(PopupMenu.Ornament.DOT);
                that.currentlySelected = true;
                if (autoSet !== false)
                    Clipboard.set_text(CLIPBOARD_TYPE, clipContents);
            }
            else {
                menuItem.setOrnament(PopupMenu.Ornament.NONE);
                menuItem.currentlySelected = false;
            }
        });
    },

    _selectMenuItem: function (menuItem, autoSet) {
        let fn = Lang.bind(menuItem, this._onMenuItemSelected);
        fn(autoSet);
    },

    _onMenuItemSelectedAndMenuClose: function (autoSet) {
        var that = this;
        that.radioGroup.forEach(function (menuItem) {
            let clipContents = that.clipContents;

            if (menuItem === that && clipContents) {
                that.setOrnament(PopupMenu.Ornament.DOT);
                that.currentlySelected = true;
                if (autoSet !== false)
                    Clipboard.set_text(CLIPBOARD_TYPE, clipContents);
            }
            else {
                menuItem.setOrnament(PopupMenu.Ornament.NONE);
                menuItem.currentlySelected = false;
            }
        });

        that.menu.close();
    },

    _getCache: function (cb) {
        return readRegistry(cb);
    },

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

    _onSelectionChange (selection, selectionType, selectionSource) {
        if (selectionType === Meta.SelectionType.SELECTION_CLIPBOARD) {
            this._refreshIndicator();
        }
    },

    _refreshIndicator: function () {
        if (PRIVATEMODE) return; // Private mode, do not.

        let that = this;

        Clipboard.get_text(CLIPBOARD_TYPE, function (clipBoard, text) {
            that._processClipboardContent(text);
        });
    },

    _processClipboardContent (text) {
        const that = this;

        if (STRIP_TEXT) {
            text = text.trim();
        }

        if (text !== "" && text) {
            let registry = that.clipItemsRadioGroup.map(function (menuItem) {
                return menuItem.clipContents;
            });

            const itemIndex = registry.indexOf(text);

            if (itemIndex < 0) {
                that._addEntry(text, false, true, false);
                that._removeOldestEntries();
                if (NOTIFY_ON_COPY) {
                    that._showNotification(_("Copied to clipboard"), notif => {
                        notif.addAction(_('Cancel'), Lang.bind(that, that._cancelNotification));
                    });
                }
            }
            else if (itemIndex >= 0 && itemIndex < registry.length - 1) {
                const item = that._findItem(text);
                that._selectMenuItem(item, false);

                if (!item.clipFavorite && MOVE_ITEM_FIRST) {
                    that._moveItemFirst(item);
                }
            }
        }
    },

    _moveItemFirst: function (item) {
        this._removeEntry(item);
        this._addEntry(item.clipContents, item.clipFavorite, item.currentlySelected, false);
    },

    _findItem: function (text) {
        return this.clipItemsRadioGroup.filter(
            item => item.clipContents === text)[0];
    },

    _getCurrentlySelectedItem () {
        return this.clipItemsRadioGroup.find(item => item.currentlySelected);
    },

    _getAllIMenuItems: function (text) {
        return this.historySection._getMenuItems().concat(this.favoritesSection._getMenuItems());
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

    _openSettings: function () {
        if (typeof ExtensionUtils.openPrefs === 'function') {
            ExtensionUtils.openPrefs();
        } else {
            Util.spawn([
                "gnome-shell-extension-prefs",
                Me.uuid
            ]);
        }
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

    _createHistoryLabel: function () {
        this._historyLabel = new St.Label({
            style_class: 'ci-notification-label',
            text: ''
        });

        global.stage.add_actor(this._historyLabel);

        this._historyLabel.hide();
    },

    _onPrivateModeSwitch: function() {
        let that = this;
        PRIVATEMODE = this.privateModeMenuItem.state;
        // We hide the history in private ModeTypee because it will be out of sync (selected item will not reflect clipboard)
        this.scrollViewMenuSection.actor.visible = !PRIVATEMODE;
        this.scrollViewFavoritesMenuSection.actor.visible = !PRIVATEMODE;
        // If we get out of private mode then we restore the clipboard to old state
        if (!PRIVATEMODE) {
            let selectList = this.clipItemsRadioGroup.filter((item) => !!item.currentlySelected);
            if (selectList.length) {
                this._selectMenuItem(selectList[0]);
            } else {
                // Nothing to return to, let's empty it instead
                Clipboard.set_text(CLIPBOARD_TYPE, "");
            }

            this.icon.remove_style_class_name('private-mode');
        } else {
            this.icon.add_style_class_name('private-mode');
        }
    },


    // _bindShortcuts: function () {
    //     this._unbindShortcuts();
    //     this._bindShortcut(SETTING_KEY_CLEAR_HISTORY, this._removeAll);
    //     this._bindShortcut(SETTING_KEY_PREV_ENTRY, this._previousEntry);
    //     this._bindShortcut(SETTING_KEY_NEXT_ENTRY, this._nextEntry);
    //     this._bindShortcut(SETTING_KEY_TOGGLE_MENU, this._toggleMenu);
    // },

    // _unbindShortcuts: function () {
    //     this._shortcutsBindingIds.forEach(
    //         (id) => Main.wm.removeKeybinding(id)
    //     );

    //     this._shortcutsBindingIds = [];
    // },

    // _bindShortcut: function(name, cb) {
    //     var ModeType = Shell.hasOwnProperty('ActionMode') ?
    //         Shell.ActionMode : Shell.KeyBindingMode;

    //     Main.wm.addKeybinding(
    //         name,
    //         this._settings,
    //         Meta.KeyBindingFlags.NONE,
    //         ModeType.ALL,
    //         Lang.bind(this, cb)
    //     );

    //     this._shortcutsBindingIds.push(name);
    // },

    // _updateTopbarLayout: function(){
    //     if(TOPBAR_DISPLAY_MODE === 0){
    //         this.icon.visible = true;
    //     }
    //     if(TOPBAR_DISPLAY_MODE === 1){
    //         this.icon.visible = false;
    //     }
    //     if(TOPBAR_DISPLAY_MODE === 2){
    //         this.icon.visible = true;
    //     }
    //     if(!DISABLE_DOWN_ARROW) {
    //         this._downArrow.visible = true;
    //     } else {
    //         this._downArrow.visible = false;
    //     }
    // },

    _disconnectSettings: function () {
        if (!this._settingsChangedId)
            return;

        this._settings.disconnect(this._settingsChangedId);
        this._settingsChangedId = null;
    },

    _clearClipboardTimeout: function () {
        if (!this._clipboardTimeoutId)
            return;

        Mainloop.source_remove(this._clipboardTimeoutId);
        this._clipboardTimeoutId = null;
    },

    _disconnectSelectionListener () {
        if (!this._selectionOwnerChangedId)
            return;

        this.selection.disconnect(this._selectionOwnerChangedId);
    },

    _clearLabelTimeout: function () {
        if (!this._historyLabelTimeoutId)
            return;

        Mainloop.source_remove(this._historyLabelTimeoutId);
        this._historyLabelTimeoutId = null;
    },

    _clearDelayedSelectionTimeout: function () {
        if (this._delayedSelectionTimeoutId) {
            Mainloop.source_remove(this._delayedSelectionTimeoutId);
        }
    },

    _selectEntryWithDelay: function (entry) {
        let that = this;

        that._selectMenuItem(entry, false);
        that._delayedSelectionTimeoutId = Mainloop.timeout_add(
                TIMEOUT_MS * 0.75, function () {

            that._selectMenuItem(entry);  //select the item

            that._delayedSelectionTimeoutId = null;
            return false;
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

    destroy: function () {
        this._disconnectSettings();
        this._unbindShortcuts();
        this._clearClipboardTimeout();
        this._disconnectSelectionListener();
        this._clearLabelTimeout();
        this._clearDelayedSelectionTimeout();

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
