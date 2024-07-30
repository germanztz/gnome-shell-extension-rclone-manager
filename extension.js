/* eslint-disable no-unused-vars */
/* eslint-disable no-undef */
import GObject from 'gi://GObject';
import GLib from 'gi://GLib'
import St from 'gi://St';
import {Extension, gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as MessageTray from 'resource:///org/gnome/shell/ui/messageTray.js';

import {FileMonitorHelper, PrefsFields, ProfileStatus} from './fileMonitorHelper.js';
import * as ConfirmDialog from './confirmDialog.js';

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

const RcloneManagerIndicator = GObject.registerClass(
  class RcloneManagerIndicator extends PanelMenu.Button {
      _init(extension) {
          super._init(0.0, 'RcloneManager');
          this.extension = extension;
          this._settings = extension.getSettings()
          this.fmh = new FileMonitorHelper();
          log('rcm._init', JSON.stringify(extension))

          this._initNotifSource()

          this.PREF_AUTOSYNC = true
          this.PREF_CHECK_INTERVAL = 3
          this._sourceId = null
          this._configs = {}
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
          this._notifSource = new MessageTray.Source(
            {
              'title': this.extension.metadata.name,
              'icon-name': INDICATOR_ICON
          })
          this._notifSource.connect('destroy', () => { this._notifSource = null })
          Main.messageTray.add(this._notifSource)
        }
      }

      _loadSettings() {
        this.fmh.PREF_DBG && log('rcm._loadSettings')
        this._settings.connect('changed', this._onSettingsChange.bind(this))
        this._onSettingsChange()
      }

      _checkDependencies() {
        this.fmh.PREF_DBG && log('rcm._checkDependencies')
        const rcVersion = this.fmh.getRcVersion()
        if (!rcVersion || !rcVersion.includes('rclone')) {
          log('rcm._checkDependencies ERROR: It seems you don\'t have rclone installed, this extension won\'t work without it')
          const subTitle = _('rclone Version: ') + rcVersion
          const message = _("It seems you don't have rclone installed, this extension won't work without it")
          this._showNotification(`${this.extension.metadata.name} ${_('Error')} ${_('rclone Version: ')}`, `${message} ${subTitle}`)
          this.icon.icon_name = PROFILE_ERROR_ICON
          return false
        }
        return true
      }

      _onSettingsChange() {
        this.fmh.PREF_DBG && log('rcm._onSettingsChange')
        const oldPassword = this.fmh.PREF_RCONFIG_PASSWORD
        this.PREF_AUTOSYNC = this._settings.get_boolean(PrefsFields.PREFKEY_AUTOSYNC)
        this.PREF_CHECK_INTERVAL = this._settings.get_int(PrefsFields.PREFKEY_CHECK_INTERVAL)
        this._registry = this._readRegistry(this._settings.get_string(PrefsFields.HIDDENKEY_PROFILE_REGISTRY))

        this.fmh.loadSettings(this._settings)

        if(oldPassword !== this.fmh.PREF_RCONFIG_PASSWORD){
          this._initConfig()
        }

        this._resetCheckInterval()
      }

      _resetCheckInterval() {
        this._removeCheckInterval()
        const that = this
        if (this.PREF_CHECK_INTERVAL !== 0) {
          this.fmh.PREF_DBG && log(`rcm._resetCheckInterval, interval: ${this.PREF_CHECK_INTERVAL}`)
          this._sourceId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, this.PREF_CHECK_INTERVAL * 60, () => {
            this.fmh.PREF_DBG && log(`rcm._resetCheckInterval running`)
            Object.entries(that._registry)
              .filter(p => p[1].syncType === ProfileStatus.WATCHED)
              .forEach(p => that.fmh.checkNsync(p[0], (profile, status, message) => { that._onProfileStatusChanged(profile, status, message) }))
            return GLib.SOURCE_CONTINUE;
          })
        }
      }

      _removeCheckInterval() {
        if(this._sourceId){
          this.fmh.PREF_DBG && log('rcm._removeCheckInterval')
          GLib.Source.remove(this._sourceId);
          this._sourceId = null
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
          this._showNotification(`${this.extension.metadata.name} ${_('Error')} ${_('List remotes command')}`, error.message)
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
            this.fmh.PREF_DBG && log('rcm._cleanRegistry', JSON.stringify(this._registry), 'has been deleted from registry')
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
        this.menu.removeAll()


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
        settingsMenuItem.connect('activate', () => { this.extension.openPreferences(); })

        // Add 'About' button which shows info about the extension
        const aboutMenuItem = new PopupMenu.PopupImageMenuItem(_('About'), 'system-help-symbolic')
        this.menu.addMenuItem(aboutMenuItem)
        aboutMenuItem.connect('activate', this._launchAbout.bind(this))
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
        menuItem.menu.removeAll()

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
        this.fmh.PREF_DBG && log('rcm._buildSubMenuItem', profile, action)
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
                that.fmh.deleteConfig(menuItem.profile,
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
        this._settings.set_string(PrefsFields.HIDDENKEY_PROFILE_REGISTRY, JSON.stringify(newRegistry))
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
          notification = new MessageTray.Notification({
            source: this._notifSource,
            title: title,
            body: details,
            'is-transient': true
        })
        } else {
          notification = this._notifSource.notifications[0]
          // notification.update(title, '', { clear: true })
          notification.body = details;
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

        this._notifSource.addNotification(notification)
      }

      _launchAbout() {
        const rcVersion = this.fmh.getRcVersion()
        const contents =
          `
    ${this.extension.metadata.name} v${this.extension.metadata.version}

    AUTHORS:
    German Ztz <avena.root@gmail.com>: Development
    Heimen Stoffels: Dutch translation
    Axel H.: French translation

    ${this.extension.metadata.description}

    For bugs report and comments go to:
    ${this.extension.metadata.url}

    `
        ConfirmDialog.openConfirmDialog(_('About'), rcVersion, contents, _('Ok'))
      }
});

export default class RcloneManager extends Extension {
  enable() {
    this._rcm = new RcloneManagerIndicator( this );
    Main.panel.addToStatusArea(this.uuid, this._rcm);
  }

  disable() {
    log('rcm.disable')
    this._rcm._removeCheckInterval()
    this._rcm.destroy();
    this._rcm = null;
  }
}
