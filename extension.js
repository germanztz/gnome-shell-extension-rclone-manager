/* eslint-disable no-unused-vars */
/* eslint-disable no-undef */
import GObject from 'gi://GObject';
import St from 'gi://St';
import {Extension, gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import GLib from 'gi://GLib'
import Gio from 'gi://Gio'
import * as Util from 'resource:///org/gnome/shell/misc/util.js';
import * as ExtensionUtils from 'resource:///org/gnome/shell/misc/extensionUtils.js';
import * as MessageTray from 'resource:///org/gnome/shell/ui/messageTray.js';
import * as Config from 'resource:///org/gnome/shell/misc/config.js';

import {FileMonitorHelper, PrefsFields, ProfileStatus} from './fileMonitorHelper.js';
import * as ConfirmDialog from './confirmDialog.js';

const Mainloop = imports.mainloop

const [major] = Config.PACKAGE_VERSION.split('.')
const shellVersion = Number.parseInt(major)

const INDICATOR_ICON = 'drive-multidisk-symbolic'
const PROFILE_IDLE_ICON = 'radio-symbolic'
const PROFILE_WATCHED_ICON = 'folder-saved-search-symbolic'
const PROFILE_MOUNTED_ICON = 'folder-remote-symbolic'
const PROFILE_BUSSY_ICON = 'system-run-symbolic'
const PROFILE_ERROR_ICON = 'dialog-warning-symbolic'

const submenus = {
  Watch: 'folder-saved-search-symbolic',
  Mount: 'folder-remote-symbolic',
  Open: 'window-new-symbolic',
  Backup: 'backups-app-symbolic',
  Restore: 'aptdaemon-download-symbolic',
  Reconnect: 'gnome-dev-ethernet',
  Sync: 'mail-send-receive-symbolic',
  Delete: 'user-trash-symbolic',
  Error: 'dialog-warning-symbolic',
  Log: 'dialog-warning-symbolic',
  Disengage: 'radio-mixed-symbolic'
}
let Me = null;

const RcloneManagerIndicator = GObject.registerClass(
  class RcloneManagerIndicator extends PanelMenu.Button {
      _init(extension) {
          super._init(0.0, 'RcloneManager');
          this.extension = extension;
          log('rcm._init')
  
          this._initNotifSource()
          this.fmh = new FileMonitorHelper();
          // this.Settings = Me.getSettings(this.fmh.PREFS_SCHEMA_NAME)

          this.PREF_AUTOSYNC = true
          this.PREF_CHECK_INTERVAL = 3
          this.checkTimeoutId = null
          this._configs = []
          this._registry = {}

          const hbox = new St.BoxLayout({ style_class: 'panel-status-menu-box rclone-manager-hbox' })
          this.icon = new St.Icon({
            icon_name: INDICATOR_ICON,
            style_class: 'system-status-icon rclone-manager-icon'
          })
          hbox.add_child(this.icon)
          this.add_child(hbox)
  
          let item = new PopupMenu.PopupMenuItem(_('Show Notification'));
          item.connect('activate', () => {
              Main.notify(_('Whatʼs up, folks?'));
              log('Whatʼs up, folks?')
        });
          this.menu.addMenuItem(item);

          this._loadSettings()
          this._checkDependencies()
          this._initConfig()
          this.fmh.monitorConfigFile((eventType) => {
            this.fmh.PREF_DBG && log('rcm.ConfigFileChanged', eventType)
            this._initConfig()
          })

      } 

      _initNotifSource() {
        if (!this._notifSource) {
          this._notifSource = new MessageTray.Source(Me.metadata.name, INDICATOR_ICON)
          this._notifSource.connect('destroy', () => { this._notifSource = null })
          Main.messageTray.add(this._notifSource)
        }
      }

      _loadSettings() {
        this.fmh.PREF_DBG && log('rcm._loadSettings')
        this.extension.settings.connect('changed', this._onSettingsChange.bind(this))
        this._onSettingsChange()
      }

      _checkDependencies() {
        this.fmh.PREF_DBG && log('rcm._checkDependencies')
        const rcVersion = this.fmh.getRcVersion()
        if (!rcVersion || !rcVersion.includes('rclone')) {
          log('rcm._checkDependencies ERROR: It seems you don\'t have rclone installed, this extension won\'t work without it')
          const subTitle = _('rclone Version: ') + rcVersion
          const message = _("It seems you don't have rclone installed, this extension won't work without it")
          this._showNotification(`${Me.metadata.name} ${_('Error')} ${_('rclone Version: ')}`, `${message} ${subTitle}`)
          this.icon.icon_name = PROFILE_ERROR_ICON
          return false
        }
        return true
      }

      _onSettingsChange() {
        const { settings } = this.extension;
        this.fmh.PREF_DBG = settings.get_boolean(PrefsFields.PREFKEY_DEBUG_MODE)
        this.fmh.PREF_DBG && log('rcm._onSettingsChange')
        const oldPassword = this.fmh.PREF_RCONFIG_PASSWORD
        this.fmh.PREF_RCONFIG_FILE_PATH = settings.get_string(PrefsFields.PREFKEY_RCONFIG_FILE_PATH)
        this.fmh.PREF_RCONFIG_PASSWORD = settings.get_string(PrefsFields.PREFKEY_RCONFIG_PASSWORD)
        this.fmh.PREF_BASE_MOUNT_PATH = settings.get_string(PrefsFields.PREFKEY_BASE_MOUNT_PATH)
        this.fmh.PREF_IGNORE_PATTERNS = settings.get_string(PrefsFields.PREFKEY_IGNORE_PATTERNS)
        this.fmh.PREF_EXTERNAL_TERMINAL = settings.get_string(PrefsFields.PREFKEY_EXTERNAL_TERMINAL)
        this.fmh.PREF_EXTERNAL_FILE_BROWSER = settings.get_string(PrefsFields.PREFKEY_EXTERNAL_FILE_BROWSER)
        this.PREF_AUTOSYNC = settings.get_boolean(PrefsFields.PREFKEY_AUTOSYNC)
        this.PREF_CHECK_INTERVAL = settings.get_int(PrefsFields.PREFKEY_CHECK_INTERVAL)
        this.fmh.PREF_RC_LIST_REMOTES = settings.get_string(PrefsFields.PREFKEY_RC_LIST_REMOTES)
        this.fmh.PREF_RC_CREATE_DIR = settings.get_string(PrefsFields.PREFKEY_RC_CREATE_DIR)
        this.fmh.PREF_RC_DELETE_DIR = settings.get_string(PrefsFields.PREFKEY_RC_DELETE_DIR)
        this.fmh.PREF_RC_DELETE_FILE = settings.get_string(PrefsFields.PREFKEY_RC_DELETE_FILE)
        this.fmh.PREF_RC_MOUNT = settings.get_string(PrefsFields.PREFKEY_RC_MOUNT)
        this.fmh.PREF_RC_SYNC = settings.get_string(PrefsFields.PREFKEY_RC_SYNC)
        this.fmh.PREF_RC_CHECK = settings.get_string(PrefsFields.PREFKEY_RC_CHECK)
        this.fmh.PREF_RC_COPYTO = settings.get_string(PrefsFields.PREFKEY_RC_COPYTO)
        this.fmh.PREF_RC_ADD_CONFIG = settings.get_string(PrefsFields.PREFKEY_RC_ADD_CONFIG)
        this.fmh.PREF_RC_DELETE_CONFIG = settings.get_string(PrefsFields.PREFKEY_RC_DELETE_CONFIG)
        this.fmh.PREF_RC_RECONNECT = settings.get_string(PrefsFields.PREFKEY_RC_RECONNECT)
        this._registry = this._readRegistry(settings.get_string(PrefsFields.HIDDENKEY_PROFILE_REGISTRY))

        this.fmh.PREF_BASE_MOUNT_PATH = this.fmh.PREF_BASE_MOUNT_PATH.replace('~', GLib.get_home_dir())
        if (!this.fmh.PREF_BASE_MOUNT_PATH.endsWith('/')) this.fmh.PREF_BASE_MOUNT_PATH = this.fmh.PREF_BASE_MOUNT_PATH + '/'

        this.fmh.PREF_RCONFIG_FILE_PATH = this.fmh.PREF_RCONFIG_FILE_PATH.replace('~', GLib.get_home_dir())

        if(oldPassword !== this.fmh.PREF_RCONFIG_PASSWORD){
          this._initConfig()
        }

        this._resetCheckInterval()
      }

      _resetCheckInterval() {
        this._removeCheckInterval()
        if (this.PREF_CHECK_INTERVAL !== 0) {
          this.fmh.PREF_DBG && log(`rcm._resetCheckInterval, interval: ${this.PREF_CHECK_INTERVAL}`)
          this.checkTimeoutId = Mainloop.timeout_add(this.PREF_CHECK_INTERVAL * 60000, () => {
            Object.entries(this._registry)
              .filter(p => p[1].syncType === ProfileStatus.WATCHED)
              .forEach(p => this.fmh.checkNsync(p[0], (profile, status, message) => { this._onProfileStatusChanged(profile, status, message) }))
            return true
          })
        }
      }

      _removeCheckInterval() {
        if (this.checkTimeoutId) {
          this.fmh.PREF_DBG && log('rcm._removeCheckInterval')
          Mainloop.source_remove(this.checkTimeoutId)
          this.checkTimeoutId = null
        }
      }

      _initConfig() {
        this.fmh.PREF_DBG && log('rcm._initConfig')
        const oldConfig = this._configs
        try {
          this._configs = this.fmh.listremotes()
        } catch (error) {
          logError(error);
          this._configs = {}
          this._showNotification(`${Me.metadata.name} ${_('Error')} ${_('List remotes command')}`, error.message)
        }
        this._cleanRegistry()
        // restores existing log
        Object.entries(this._configs).forEach(entry => {
          if (entry[0] in oldConfig) {
            if (Object.prototype.hasOwnProperty.call(oldConfig[entry[0]], 'log')) {
              this._configs[entry[0]].log = oldConfig[entry[0]].log
            }
          }
        })
        this._buildMainMenu(this._configs)
        Object.entries(this._registry).forEach(registryProfile =>
          this._initProfile(registryProfile[0], registryProfile[1]))
      }

      _cleanRegistry() {
        this.fmh.PREF_DBG && log('rcm._cleanRegistry', JSON.stringify(this._registry), JSON.stringify(this._configs))

        Object.entries(this._registry).forEach(registryProfile => {
          if (!(registryProfile[0] in this._configs)) {
            delete this._registry[registryProfile[0]]
            this.fmh.PREF_DBG && log('rcm._cleanRegistry', JSON.stringify(this._registry), 'has beed deleted from registry')
            this._updateRegistry(this._registry)
          }
        })

      }

      _initProfile(profile, regProf) {
        this.fmh.PREF_DBG && log('rcm._initProfile', profile, JSON.stringify(regProf))
        const that = this
        if (regProf.syncType === ProfileStatus.WATCHED) {
          if (this.PREF_AUTOSYNC) {
            this.fmh.sync(profile, (profile, status, message) => {
              that._onProfileStatusChanged(profile, status, message)
              if (status !== ProfileStatus.BUSSY) {
                this.fmh.initFilemonitor(profile,
                  function (profile, status, message) { that._onProfileStatusChanged(profile, status, message) })
              }
            })
          } else {
            this.fmh.initFilemonitor(profile,
              function (profile, status, message) { that._onProfileStatusChanged(profile, status, message) })
          }
          this._resetCheckInterval()
        } else if (Object.prototype.hasOwnProperty.call(this.fmh.getMounts(), profile)) {
          // if is already mounted just leave it
          this._onProfileStatusChanged(profile, ProfileStatus.MOUNTED, profile + ' was already mounted')
        } else if (regProf.syncType === ProfileStatus.MOUNTED) {
          this.fmh.mountProfile(profile,
            function (profile, status, message) { that._onProfileStatusChanged(profile, status, message) })
        }
      }

      _buildMainMenu(profiles) {
        this.fmh.PREF_DBG && log('rcm._buildMainMenu')
        // clean menu
        this.menu._getMenuItems().forEach(function (i) { i.destroy() })

        Object.entries(profiles).forEach(entry => {
          this.menu.addMenuItem(this._buildMenuItem(entry[0], this.fmh.getStatus(entry[0])))
        })
        // Add separator
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem())

        // Add 'Add config' button which adds new config to rclone
        const addMenuItem = new PopupMenu.PopupImageMenuItem(_('Add config'), 'folder-new-symbolic')
        this.menu.addMenuItem(addMenuItem)
        addMenuItem.connect('activate', this._addConfig.bind(this))

        // Add 'Settings' menu item to open settings
        const settingsMenuItem = new PopupMenu.PopupImageMenuItem(_('Settings'), 'gnome-tweak-tool-symbolic')
        this.menu.addMenuItem(settingsMenuItem)
        settingsMenuItem.connect('activate', () => { this.extension.openSettings(); }) //ExtensionUtils.openPrefs()

        // Add 'About' button which shows info abou the extension
        const aboutMenuItem = new PopupMenu.PopupImageMenuItem(_('About'), 'system-help-symbolic')
        this.menu.addMenuItem(aboutMenuItem)
        aboutMenuItem.connect('activate', this._lauchAbout.bind(this))
      }

      /**
         * https://github.com/julio641742/gnome-shell-extension-reference/blob/master/tutorials/POPUPMENU-EXTENSION.md
         * @param {string} profile
         * @returns {PopupSubMenuMenuItem}
         */
      _buildMenuItem(profile, status) {
        const menuItem = new PopupMenu.PopupSubMenuMenuItem(profile, true)
        menuItem.profile = profile
        this._setMenuIcon(menuItem, status)
        this._buildSubmenu(menuItem, profile, status)
        return menuItem
      }

      _buildSubmenu(menuItem, profile, status) {
        // clean submenu
        this.fmh.PREF_DBG && log('rcm._buildSubmenu', profile, status)
        if (!menuItem) return
        menuItem.menu._getMenuItems().forEach(function (i) { i.destroy() })

        menuItem.menu.box.style_class = 'menuitem-menu-box'

        if (status !== ProfileStatus.MOUNTED && status !== ProfileStatus.WATCHED) {
          menuItem.menu.addMenuItem(this._buildSubMenuItem('Mount', profile))
          menuItem.menu.addMenuItem(this._buildSubMenuItem('Watch', profile))
          menuItem.menu.addMenuItem(this._buildSubMenuItem('Reconnect', profile))
        }

        if (this.fmh.profileHasDir(profile)) {
          menuItem.menu.addMenuItem(this._buildSubMenuItem('Open', profile))
        }
        if (status !== ProfileStatus.MOUNTED) {
          menuItem.menu.addMenuItem(this._buildSubMenuItem('Sync', profile))
        }
        menuItem.menu.addMenuItem(this._buildSubMenuItem('Disengage', profile))
        menuItem.menu.addMenuItem(this._buildSubMenuItem('Delete', profile))

        if (Object.prototype.hasOwnProperty.call(this._configs[profile], 'log')) {
          menuItem.menu.addMenuItem(this._buildSubMenuItem('Log', profile))
        }
      }

      _buildSubMenuItem(action, profile) {
        const subMenuItem = new PopupMenu.PopupImageMenuItem(_(action), submenus[action])
        subMenuItem.profile = profile
        subMenuItem.action = action
        subMenuItem.connect('activate', this._onSubMenuActivated.bind(this))
        return subMenuItem
      }

      _onSubMenuActivated(menuItem) {
        this.fmh.PREF_DBG && log('rcm._onSubMenuActivated', menuItem.profile, menuItem.action)
        const that = this

        switch (menuItem.action) {
          case 'Watch':
            this._updateRegistryItem(menuItem.profile, { syncType: ProfileStatus.WATCHED })
            this._initProfile(menuItem.profile, { syncType: ProfileStatus.WATCHED })
            break
          case 'Mount':
            this._updateRegistryItem(menuItem.profile, { syncType: ProfileStatus.MOUNTED })
            this._initProfile(menuItem.profile, { syncType: ProfileStatus.MOUNTED })
            break
          case 'Disengage':
            this._updateRegistryItem(menuItem.profile, { syncType: ProfileStatus.DISCONNECTED })
            this.fmh.disengage(menuItem.profile,
              (profile, status, message) => { this._onProfileStatusChanged(profile, status, message) })
            break
          case 'Sync':
            this.fmh.sync(menuItem.profile,
              (profile, status, message) => { this._onProfileStatusChanged(profile, status, message) })
            break
          case 'Open':
            this.fmh.open(menuItem.profile)
            break
          case 'Reconnect':
            this.fmh.reconnect(menuItem.profile)
            break
          case 'Delete':
            ConfirmDialog.openConfirmDialog(_('Delete'),
              _('Are you sure you want to delete?'),
              _('This action cannot be undone'),
              _('Confirm'), _('Cancel'),
              function () {
                this.fmh.deleteConfig(menuItem.profile,
                  (profile, status, message) => { that._onProfileStatusChanged(profile, status, message) })
              }
            )
            break
          case 'Log':
            ConfirmDialog.openConfirmDialog(_('Log Detail'), menuItem.profile, this._configs[menuItem.profile].log, _('Ok'))
            break
          default:
            break
        }
        if (shellVersion < 40) {
          this.menu.toggle()
        }
      }

      _readRegistry(registry) {
        this.fmh.PREF_DBG && log('rcm._readRegistry', registry)
        try {
          return JSON.parse(registry)
        } catch (e) {
          logError(e)
          return {}
        }
      }

      _updateRegistryItem(key, value) {
        this._registry[key] = value
        this._updateRegistry(this._registry)
      }

      _updateRegistry(newRegistry) {
        this.fmh.PREF_DBG && log('rcm._updateRegistry', JSON.stringify(newRegistry))
        this.extension.settings.set_string(PrefsFields.HIDDENKEY_PROFILE_REGISTRY, JSON.stringify(newRegistry))
      }

      _openRemote(autoSet) {
        this.fmh.PREF_DBG && log(autoSet)
      }

      _restoreConfig() {

      }

      _addConfig() {
        this.fmh.addConfig()
      }

      _onProfileStatusChanged(profile, status, message) {
        try {
          this.fmh.PREF_DBG && log('rcm._onProfileStatusChanged', profile, status, message)
          const mItem = this._findProfileMenu(profile)
          const that = this
          switch (status) {
            case ProfileStatus.DELETED:
              mItem.destroy()
              this._cleanRegistry()
              return

            case ProfileStatus.ERROR:
              this.icon.icon_name = PROFILE_ERROR_ICON
              this._showNotification(`${profile} ${_('Error')} ${_(message)}`, `${profile} ${_(message)}`)
              break

            case ProfileStatus.BUSSY:
              this.icon.icon_name = PROFILE_BUSSY_ICON
              break

            // case ProfileStatus.MOUNTED:
            // case ProfileStatus.WATCHED:
            // case ProfileStatus.DISCONNECTED:
            default:
              this.icon.icon_name = INDICATOR_ICON
              break
          }
          if (message) { this._addLog(profile, _(message)) }
          this._setMenuIcon(mItem, status)
          this._buildSubmenu(mItem, profile, this.fmh.getStatus(profile))
        } catch (e) {
          logError(e)
        }
      }

      _addLog(profile, message) {
        this.fmh.PREF_DBG && log('rcm._addLog', profile, message)
        if (Object.prototype.hasOwnProperty.call(this._configs[profile], 'log')) {
          this._configs[profile].log = this._configs[profile].log + '\n' + message
        } else {
          this._configs[profile].log = message
        }
      }

      _findProfileMenu(profile) {
        let retItem = null
        try {
          this.menu._getMenuItems().forEach(function (mItem) {
            if (mItem.profile && mItem.profile === profile) {
              retItem = mItem
            }
          })
        } catch (e) {
          logError(e)
        }
        return retItem
      }

      _setMenuIcon(menuItem, status) {
        try {
          if (!menuItem) return
          this.fmh.PREF_DBG && log('rcm._setMenuIcon', menuItem.profile, status)
          switch (status) {
            case ProfileStatus.MOUNTED:
              menuItem.icon.icon_name = PROFILE_MOUNTED_ICON
              break
            case ProfileStatus.WATCHED:
              menuItem.icon.icon_name = PROFILE_WATCHED_ICON
              break
            case ProfileStatus.BUSSY:
              menuItem.icon.icon_name = PROFILE_BUSSY_ICON
              break
            case ProfileStatus.ERROR:
              menuItem.icon.icon_name = PROFILE_ERROR_ICON
              break
            case ProfileStatus.DELETED:
              break
            default:
              menuItem.icon.icon_name = PROFILE_IDLE_ICON
              break
          }
        } catch (e) {
          logError(e)
        }
      }

      _showNotification(title, details, transformFn) {
        let notification = null
        this._initNotifSource()

        if (this._notifSource.count === 0) {
          notification = new MessageTray.Notification(this._notifSource, title)
        } else {
          notification = this._notifSource.notifications[0]
          notification.update(title, '', { clear: true })
        }

        if (typeof transformFn === 'function') {
          transformFn(notification)
        } else {
          notification.addAction(_('Details'), () => {
            ConfirmDialog.openConfirmDialog(title, '', details, _('Ok'))
            })
        }
        notification.connect('activated', () => {
          ConfirmDialog.openConfirmDialog(title, '', details, _('Ok'))
        })

        this._notifSource.showNotification(notification)
      }

      _lauchAbout() {
        const rcVersion = this.fmh.getRcVersion()
        const contents =
          `
    ${Me.metadata.name} v${Me.metadata.version}

    AUTHORS:
    German Ztz <avena.root@gmail.com>: Development
    Heimen Stoffels: Dutch translation
    Axel H.: French translation

    ${Me.metadata.description}

    For bugs report and comments go to:
    ${Me.metadata.url}

    `
        ConfirmDialog.openConfirmDialog(_('About'), rcVersion, contents, _('Ok'))
      }
  
//   enable() {
//     // this.Settings = this.getSettings();
//     console.log(_('This is a translatable text'));
//   }

//   disable() {
//     // this._removeCheckInterval()
//     // this.Settings = null;
//   }
// }
});

export default class RcloneManager extends Extension {
  enable() {
    Me = this
    this.RcloneManagerIndicator = new RcloneManagerIndicator({
      settings: this.getSettings(),
      openSettings: this.openPreferences,
      uuid: this.uuid
    });
    Main.panel.addToStatusArea(this.uuid, this.RcloneManagerIndicator);
  }

  disable() {
    this.RcloneManagerIndicator._removeCheckInterval()
    this.RcloneManagerIndicator.destroy();
    this.RcloneManagerIndicator = null;
  }
}
