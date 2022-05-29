/* eslint-disable no-unused-vars */
/* eslint-disable no-undef */
const Config = imports.misc.config
const GLib = imports.gi.GLib
const Lang = imports.lang
const St = imports.gi.St
const Util = imports.misc.util
const MessageTray = imports.ui.messageTray
const Main = imports.ui.main
const PanelMenu = imports.ui.panelMenu
const PopupMenu = imports.ui.popupMenu
const Gettext = imports.gettext
const ExtensionUtils = imports.misc.extensionUtils
const Me = ExtensionUtils.getCurrentExtension()
const _ = Gettext.domain(Me.metadata.name).gettext
const Prefs = Me.imports.prefs

const shellVersion = Number.parseInt(Config.PACKAGE_VERSION.split('.'))

const fmh = Me.imports.fileMonitorHelper
const ConfirmDialog = Me.imports.confirmDialog

const INDICATOR_ICON = 'drive-multidisk-symbolic'
const PROFILE_IDLE_ICON = 'radio-symbolic'
const PROFILE_WATCHED_ICON = 'folder-saved-search-symbolic'
const PROFILE_MOUNTED_ICON = 'folder-remote-symbolic'
const PROFILE_BUSSY_ICON = 'system-run-symbolic'
const PROFILE_ERROR_ICON = 'dialog-warning-symbolic'

let PREF_AUTOSYNC = true

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

const RcloneManager = Lang.Class({
  Name: Me.metadata.name,
  Extends: PanelMenu.Button,

  _settingsChangedId: null,
  _configs: [],
  _registry: {},

  _init: function () {
    log('rcm._init')
    this.parent(0.0, Me.metadata.name)

    const hbox = new St.BoxLayout({ style_class: 'panel-status-menu-box rclone-manager-hbox' })
    this.icon = new St.Icon({
      icon_name: INDICATOR_ICON,
      style_class: 'system-status-icon rclone-manager-icon'
    })
    hbox.add_child(this.icon)
    this.add_child(hbox)
    this._loadSettings()
    this._checkDependencies()
    this._initConfig()
    fmh.monitorConfigFile((eventType) => {
      fmh.PREF_DBG && log('rcm.ConfigFileChanged', eventType)
      this._initConfig()
    })
  },

  _checkDependencies: function () {
    fmh.PREF_DBG && log('rcm._checkDependencies')
    const rcVersion = fmh.getRcVersion()
    if (!rcVersion || !rcVersion.includes('rclone')) {
      const that = this
      const title = Me.metadata.name + ' ' + _('Error')
      const subTitle = _('rclone Version: ') + rcVersion
      const message = _("It seems you don't have rclone installed, this extension won't work without it")
      this._showNotification(title + ': ' + message, n => {
        n.addAction(_('Details'), Lang.bind(that, function () {
          ConfirmDialog.openConfirmDialog(title, subTitle, message, _('Ok'))
        }))
      })
    }
  },

  _loadSettings: function () {
    log('rcm._loadSettings')
    this._settings = Prefs.Settings
    this._settingsChangedId = this._settings.connect('changed',
      Lang.bind(this, this._onSettingsChange))

    this._onSettingsChange()
  },

  _onSettingsChange: function () {
    fmh.PREF_DBG = this._settings.get_boolean(Prefs.Fields.PREFKEY_DEBUG_MODE)
    fmh.PREF_DBG && log('rcm._onSettingsChange')
    fmh.PREF_RCONFIG_FILE_PATH = this._settings.get_string(Prefs.Fields.PREFKEY_RCONFIG_FILE_PATH)
    fmh.PREF_BASE_MOUNT_PATH = this._settings.get_string(Prefs.Fields.PREFKEY_BASE_MOUNT_PATH)
    fmh.PREF_IGNORE_PATTERNS = this._settings.get_string(Prefs.Fields.PREFKEY_IGNORE_PATTERNS)
    fmh.PREF_EXTERNAL_TERMINAL = this._settings.get_string(Prefs.Fields.PREFKEY_EXTERNAL_TERMINAL)
    fmh.PREF_EXTERNAL_FILE_BROWSER = this._settings.get_string(Prefs.Fields.PREFKEY_EXTERNAL_FILE_BROWSER)
    PREF_AUTOSYNC = this._settings.get_boolean(Prefs.Fields.PREFKEY_AUTOSYNC)
    fmh.PREF_RC_CREATE_DIR = this._settings.get_string(Prefs.Fields.PREFKEY_RC_CREATE_DIR)
    fmh.PREF_RC_DELETE_DIR = this._settings.get_string(Prefs.Fields.PREFKEY_RC_DELETE_DIR)
    fmh.PREF_RC_DELETE_FILE = this._settings.get_string(Prefs.Fields.PREFKEY_RC_DELETE_FILE)
    fmh.PREF_RC_MOUNT = this._settings.get_string(Prefs.Fields.PREFKEY_RC_MOUNT)
    fmh.PREF_RC_SYNC = this._settings.get_string(Prefs.Fields.PREFKEY_RC_SYNC)
    this._registry = this._readRegistry(this._settings.get_string(Prefs.Fields.HIDDENKEY_PROFILE_REGISTRY))

    fmh.PREF_BASE_MOUNT_PATH = fmh.PREF_BASE_MOUNT_PATH.replace('~', GLib.get_home_dir())
    if (!fmh.PREF_BASE_MOUNT_PATH.endsWith('/')) fmh.PREF_BASE_MOUNT_PATH = fmh.PREF_BASE_MOUNT_PATH + '/'

    fmh.PREF_RCONFIG_FILE_PATH = fmh.PREF_RCONFIG_FILE_PATH.replace('~', GLib.get_home_dir())
  },

  _initConfig: function () {
    fmh.PREF_DBG && log('rcm._initConfig')
    const oldConfig = this._configs
    this._configs = fmh.listremotes()
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
  },

  _initProfile: function (profile, regProf) {
    fmh.PREF_DBG && log('rcm._initProfile', profile, JSON.stringify(regProf))
    const that = this
    if (regProf.syncType === fmh.ProfileStatus.WATCHED) {
      if (PREF_AUTOSYNC) {
        fmh.sync(profile, (profile, status, message) => {
          that._onProfileStatusChanged(profile, status, message)
          if (status !== fmh.ProfileStatus.BUSSY) {
            fmh.initFilemonitor(profile,
              function (profile, status, message) { that._onProfileStatusChanged(profile, status, message) })
          }
        })
      } else {
        fmh.initFilemonitor(profile,
          function (profile, status, message) { that._onProfileStatusChanged(profile, status, message) })
      }
    } else if (Object.prototype.hasOwnProperty.call(fmh.getMounts(), profile)) {
      // if is already mounted just leave it
      this._onProfileStatusChanged(profile, fmh.ProfileStatus.MOUNTED, profile + ' was already mounted')
    } else if (regProf.syncType === fmh.ProfileStatus.MOUNTED) {
      fmh.mountProfile(profile,
        function (profile, status, message) { that._onProfileStatusChanged(profile, status, message) })
    }
  },

  _buildMainMenu: function (profiles) {
    fmh.PREF_DBG && log('rcm._buildMainMenu')
    // clean menu
    this.menu._getMenuItems().forEach(function (i) { i.destroy() })

    Object.entries(profiles).forEach(entry => {
      this.menu.addMenuItem(this._buildMenuItem(entry[0], fmh.getStatus(entry[0])))
    })
    // Add separator
    this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem())

    // Add 'Add config' button which adds new config to rclone
    const addMenuItem = new PopupMenu.PopupImageMenuItem(_('Add config'), 'folder-new-symbolic')
    this.menu.addMenuItem(addMenuItem)
    addMenuItem.connect('activate', Lang.bind(this, this._addConfig))

    // Add 'Settings' menu item to open settings
    const settingsMenuItem = new PopupMenu.PopupImageMenuItem(_('Settings'), 'gnome-tweak-tool-symbolic')
    this.menu.addMenuItem(settingsMenuItem)
    settingsMenuItem.connect('activate', Lang.bind(this, this._openSettings))

    // Add 'About' button which shows info abou the extension
    const aboutMenuItem = new PopupMenu.PopupImageMenuItem(_('About'), 'system-help-symbolic')
    this.menu.addMenuItem(aboutMenuItem)
    aboutMenuItem.connect('activate', Lang.bind(this, this._lauchAbout))
  },

  /**
     * https://github.com/julio641742/gnome-shell-extension-reference/blob/master/tutorials/POPUPMENU-EXTENSION.md
     * @param {string} profile
     * @returns {PopupSubMenuMenuItem}
     */
  _buildMenuItem (profile, status) {
    const menuItem = new PopupMenu.PopupSubMenuMenuItem(profile, true)
    menuItem.profile = profile
    this._setMenuIcon(menuItem, status)
    this._buildSubmenu(menuItem, profile, status)
    return menuItem
  },

  _buildSubmenu: function (menuItem, profile, status) {
    // clean submenu
    fmh.PREF_DBG && log('rcm._buildSubmenu', profile, status)
    menuItem.menu._getMenuItems().forEach(function (i) { i.destroy() })

    menuItem.menu.box.style_class = 'menuitem-menu-box'

    if (status !== fmh.ProfileStatus.MOUNTED && status !== fmh.ProfileStatus.WATCHED) {
      menuItem.menu.addMenuItem(this._buildSubMenuItem('Mount', profile))
      menuItem.menu.addMenuItem(this._buildSubMenuItem('Watch', profile))
      menuItem.menu.addMenuItem(this._buildSubMenuItem('Reconnect', profile))
    }

    if (fmh.profileHasDir(profile)) {
      menuItem.menu.addMenuItem(this._buildSubMenuItem('Open', profile))
    }
    if (status !== fmh.ProfileStatus.MOUNTED) {
      menuItem.menu.addMenuItem(this._buildSubMenuItem('Sync', profile))
    }
    menuItem.menu.addMenuItem(this._buildSubMenuItem('Disengage', profile))
    menuItem.menu.addMenuItem(this._buildSubMenuItem('Delete', profile))

    if (Object.prototype.hasOwnProperty.call(this._configs[profile], 'log')) {
      menuItem.menu.addMenuItem(this._buildSubMenuItem('Log', profile))
    }
  },

  _buildSubMenuItem: function (action, profile) {
    const subMenuItem = new PopupMenu.PopupImageMenuItem(_(action), submenus[action])
    subMenuItem.profile = profile
    subMenuItem.action = action
    subMenuItem.connect('activate', Lang.bind(this, this._onSubMenuActivated))
    return subMenuItem
  },

  _onSubMenuActivated: function (menuItem) {
    fmh.PREF_DBG && log('rcm._onSubMenuActivated', menuItem.profile, menuItem.action)
    const that = this

    switch (menuItem.action) {
      case 'Watch':
        this._updateRegistry(menuItem.profile, { syncType: fmh.ProfileStatus.WATCHED })
        this._initProfile(menuItem.profile, { syncType: fmh.ProfileStatus.WATCHED })
        break
      case 'Mount':
        this._updateRegistry(menuItem.profile, { syncType: fmh.ProfileStatus.MOUNTED })
        this._initProfile(menuItem.profile, { syncType: fmh.ProfileStatus.MOUNTED })
        break
      case 'Disengage':
        this._updateRegistry(menuItem.profile, { syncType: fmh.ProfileStatus.DISCONNECTED })
        fmh.disengage(menuItem.profile,
          (profile, status, message) => { this._onProfileStatusChanged(profile, status, message) })
        break
      case 'Sync':
        fmh.sync(menuItem.profile,
          (profile, status, message) => { this._onProfileStatusChanged(profile, status, message) })
        break
      case 'Open':
        fmh.open(menuItem.profile)
        break
      case 'Reconnect':
        fmh.reconnect(menuItem.profile)
        break
      case 'Delete':
        ConfirmDialog.openConfirmDialog(_('Delete'),
          _('Are you sure you want to delete?'),
          _('This action cannot be undone'),
          _('Confirm'), _('Cancel'),
          function () {
            fmh.deleteConfig(menuItem.profile,
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
  },

  _readRegistry: function (registry) {
    fmh.PREF_DBG && log('rcm._readRegistry', registry)
    try {
      return JSON.parse(registry)
    } catch (e) {
      logError(e)
      return {}
    }
  },

  _updateRegistry: function (key, value) {
    this._registry[key] = value
    fmh.PREF_DBG && log('rcm._updateRegistry', JSON.stringify(this._registry))
    this._settings.set_string(Prefs.Fields.HIDDENKEY_PROFILE_REGISTRY, JSON.stringify(this._registry))
  },

  _openRemote: function (autoSet) {
    fmh.PREF_DBG && log(autoSet)
  },

  _restoreConfig: function () {

  },

  _addConfig: function () {
    fmh.addConfig()
  },

  _onProfileStatusChanged: function (profile, status, message) {
    try {
      fmh.PREF_DBG && log('rcm._onProfileStatusChanged', profile, status, message)
      const mItem = this._findProfileMenu(profile)
      const that = this
      switch (status) {
        case fmh.ProfileStatus.DELETED:
          mItem.destroy()
          return

        case fmh.ProfileStatus.ERROR:
          this.icon.icon_name = PROFILE_ERROR_ICON
          this._showNotification(profile + ' ' + _('Error') + ': ' + _(message), n => {
            n.addAction(_('Details'), Lang.bind(that, function () {
              ConfirmDialog.openConfirmDialog(_('Log detail'), profile, _(message), _('Ok'))
            }))
          })
          break

        case fmh.ProfileStatus.BUSSY:
          this.icon.icon_name = PROFILE_BUSSY_ICON
          break

          // case fmh.ProfileStatus.MOUNTED:
          // case fmh.ProfileStatus.WATCHED:
          // case fmh.ProfileStatus.DISCONNECTED:
        default:
          this.icon.icon_name = INDICATOR_ICON
          break
      }
      if (message) { this._addLog(profile, _(message)) }
      this._setMenuIcon(mItem, status)
      this._buildSubmenu(mItem, profile, fmh.getStatus(profile))
    } catch (e) {
      logError(e)
    }
  },

  _addLog: function (profile, message) {
    fmh.PREF_DBG && log('rcm._addLog', profile, message)
    if (Object.prototype.hasOwnProperty.call(this._configs[profile], 'log')) {
      this._configs[profile].log = this._configs[profile].log + '\n' + message
    } else {
      this._configs[profile].log = message
    }
  },

  _findProfileMenu: function (profile) {
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
  },

  _setMenuIcon: function (menuItem, status) {
    try {
      fmh.PREF_DBG && log('rcm._setMenuIcon', menuItem.profile, status)
      switch (status) {
        case fmh.ProfileStatus.MOUNTED:
          menuItem.icon.icon_name = PROFILE_MOUNTED_ICON
          break
        case fmh.ProfileStatus.WATCHED:
          menuItem.icon.icon_name = PROFILE_WATCHED_ICON
          break
        case fmh.ProfileStatus.BUSSY:
          menuItem.icon.icon_name = PROFILE_BUSSY_ICON
          break
        case fmh.ProfileStatus.ERROR:
          menuItem.icon.icon_name = PROFILE_ERROR_ICON
          break
        case fmh.ProfileStatus.DELETED:
          break
        default:
          menuItem.icon.icon_name = PROFILE_IDLE_ICON
          break
      }
    } catch (e) {
      logError(e)
    }
  },

  _openSettings: function () {
    fmh.PREF_DBG && log('rcm._openSettings')
    if (typeof ExtensionUtils.openPrefs === 'function') {
      ExtensionUtils.openPrefs()
    } else {
      Util.spawn(['gnome-shell-extension-prefs', Me.uuid])
    }
  },

  _initNotifSource: function () {
    if (!this._notifSource) {
      this._notifSource = new MessageTray.Source(Me.metadata.name, INDICATOR_ICON)
      this._notifSource.connect('destroy', Lang.bind(this, function () {
        this._notifSource = null
      }))
      Main.messageTray.add(this._notifSource)
    }
  },

  _showNotification: function (message, transformFn) {
    let notification = null

    this._initNotifSource()

    if (this._notifSource.count === 0) {
      notification = new MessageTray.Notification(this._notifSource, message)
    } else {
      notification = this._notifSource.notifications[0]
      notification.update(message, '', { clear: true })
    }

    if (typeof transformFn === 'function') {
      transformFn(notification)
    }

    notification.setTransient(true)
    if (Config.PACKAGE_VERSION < '3.36') {
      this._notifSource.notify(notification)
    } else {
      this._notifSource.showNotification(notification)
    }
  },

  _lauchAbout: function () {
    const rcVersion = fmh.getRcVersion()
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
  },

  destroy: function () {
    // Call parent
    this.parent()
  }

})

function init () {
  const localeDir = Me.dir.get_child('locale')
  Gettext.bindtextdomain(Me.metadata.name, localeDir.get_path())
}

let rcloneManager
function enable () {
  rcloneManager = new RcloneManager()
  Main.panel.addToStatusArea(Me.metadata.name, rcloneManager, 1)
}

function disable () {
  rcloneManager.destroy()
}
