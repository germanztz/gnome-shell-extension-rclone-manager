/* eslint-disable no-var */
/* eslint-disable no-unused-vars */
/* eslint-disable no-undef */
const Gtk = imports.gi.Gtk
const Gio = imports.gi.Gio
const Lang = imports.lang
const ExtensionUtils = imports.misc.extensionUtils
const Me = ExtensionUtils.getCurrentExtension()

const Gettext = imports.gettext
const _ = Gettext.domain(Me.metadata.name).gettext

const Config = imports.misc.config
const [major] = Config.PACKAGE_VERSION.split('.')
const shellVersion = Number.parseInt(major)

var Fields = {
  PREFKEY_RCONFIG_FILE_PATH: 'prefkey001-rconfig-file-path',
  PREFKEY_BASE_MOUNT_PATH: 'prefkey002-base-mount-path',
  PREFKEY_IGNORE_PATTERNS: 'prefkey003-ignore-patterns',
  PREFKEY_EXTERNAL_TERMINAL: 'prefkey004-external-terminal',
  PREFKEY_EXTERNAL_FILE_BROWSER: 'prefkey005-external-file-browser',
  PREFKEY_AUTOSYNC: 'prefkey006-autosync',
  PREFKEY_RC_CREATE_DIR: 'prefkey007-rclone-copy',
  PREFKEY_RC_DELETE_DIR: 'prefkey008-rclone-purge',
  PREFKEY_RC_DELETE_FILE: 'prefkey009-rclone-delete',
  PREFKEY_RC_MOUNT: 'prefkey010-rclone-mount',
  PREFKEY_RC_SYNC: 'prefkey011-rclone-sync',
  HIDDENKEY_PROFILE_REGISTRY: 'hiddenkey012-profile-registry',
  PREFKEY_DEBUG_MODE: 'prefkey013-debug-mode'
}

const SCHEMA_NAME = 'org.gnome.shell.extensions.rclone-manager'

const schemaDir = Me.dir.get_child('schemas').get_path()
const SettingsSchemaSource = Gio.SettingsSchemaSource.new_from_directory(schemaDir, Gio.SettingsSchemaSource.get_default(), false)
const SettingsSchema = SettingsSchemaSource.lookup(SCHEMA_NAME, false)
var Settings = new Gio.Settings({ settings_schema: SettingsSchema })

function init () {
  const localeDir = Me.dir.get_child('locale')
  if (localeDir.query_exists(null)) {
    Gettext.bindtextdomain(Me.metadata.name, localeDir.get_path())
  }
}

const App = new Lang.Class({
  Name: 'RcloneManager.App',
  _init: function () {
    this.main = new Gtk.Grid({
      margin_top: 10,
      margin_bottom: 10,
      margin_start: 10,
      margin_end: 10,
      row_spacing: 12,
      column_spacing: 18,
      column_homogeneous: false,
      row_homogeneous: false
    })

    const addRow = ((main) => {
      let row = 0
      return (input, prefKey) => {
        let inputWidget = input
        const LabelWidget = new Gtk.Label({
          label: _(SettingsSchema.get_key(prefKey).get_summary()),
          hexpand: false,
          halign: Gtk.Align.START
        })

        let property = 'text'

        if (inputWidget instanceof Gtk.Switch) {
          inputWidget = this.appendToBox(this.getHorizontalBox(), inputWidget)
          property = 'active'
        }
        inputWidget.hexpand = true

        main.attach(LabelWidget, 0, row, 1, 1)
        main.attach(inputWidget, 1, row, 1, 1)

        Settings.bind(prefKey, input, property, Gio.SettingsBindFlags.DEFAULT)

        row++
      }
    })(this.main)

    SettingsSchema.list_keys()
      .filter(prefKey => !prefKey.includes('hidden'))
      .sort()
      .forEach((prefKey) => {
        const type = SettingsSchema.get_key(prefKey).get_value_type().dup_string()
        switch (type) {
          case 's':
            addRow(new Gtk.Entry(), prefKey); break
          case 'b':
            addRow(new Gtk.Switch(), prefKey); break
        }
      })

    const buttonsRow = this.getHorizontalBox()

    const btReset = new Gtk.Button({
      label: _('Reset settings'),
      halign: Gtk.Align.END
    })
    btReset.connect('clicked', this.resetAll)
    this.appendToBox(buttonsRow, btReset)

    this.main.attach(buttonsRow, 1, SettingsSchema.list_keys().length + 1, 1, 1)

    if (shellVersion < 40) {
      this.main.show_all()
    }
  },

  getHorizontalBox: function () {
    let box = null
    if (shellVersion < 40) {
      box = new Gtk.HBox()
    } else {
      box = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL })
    }
    box.spacing = 18
    return box
  },

  appendToBox: function (box, input) {
    if (shellVersion < 40) {
      box.pack_end(input, false, false, 0)
    } else {
      box.append(input)
    }
    return box
  },

  resetAll: function () {
    SettingsSchema.list_keys().forEach(prefKey => Settings.reset(prefKey))
  }

})

function buildPrefsWidget () {
  const widget = new App()
  return widget.main
}
