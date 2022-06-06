/* eslint-disable no-var */
/* eslint-disable no-unused-vars */
/* eslint-disable no-undef */
const Lang = imports.lang
const Gettext = imports.gettext
const Gtk = imports.gi.Gtk
const Gio = imports.gi.Gio
const GLib = imports.gi.GLib
const GObject = imports.gi.GObject
const ExtensionUtils = imports.misc.extensionUtils
const Config = imports.misc.config
const Me = ExtensionUtils.getCurrentExtension()
const fmh = Me.imports.fileMonitorHelper

const _ = Gettext.domain(Me.metadata.name).gettext
const [major] = Config.PACKAGE_VERSION.split('.')
const shellVersion = Number.parseInt(major)

function init () {
  const localeDir = Me.dir.get_child('locale')
  if (localeDir.query_exists(null)) {
    Gettext.bindtextdomain(Me.metadata.name, localeDir.get_path())
  }
}

const App = GObject.registerClass({
  GTypeName: 'App'
}, class App extends GObject.Object {
  _init () {
    super._init()
    const schemaDir = Me.dir.get_child('schemas').get_path()
    const SettingsSchemaSource = Gio.SettingsSchemaSource.new_from_directory(schemaDir, Gio.SettingsSchemaSource.get_default(), false)
    this.SettingsSchema = SettingsSchemaSource.lookup(fmh.PREFS_SCHEMA_NAME, false)
    this.Settings = new Gio.Settings({ settings_schema: this.SettingsSchema })

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
          label: _(this.SettingsSchema.get_key(prefKey).get_summary()),
          hexpand: false,
          halign: Gtk.Align.START
        })

        let property = 'text'

        if (inputWidget instanceof Gtk.Switch) {
          inputWidget = this.appendToBox(this.getOrientedBox(Gtk.Orientation.HORIZONTAL), inputWidget)
          property = 'active'
        }
        inputWidget.hexpand = true

        main.attach(LabelWidget, 0, row, 1, 1)
        main.attach(inputWidget, 1, row, 1, 1)

        this.Settings.bind(prefKey, input, property, Gio.SettingsBindFlags.DEFAULT)

        row++
      }
    })(this.main)

    this.SettingsSchema.list_keys()
      .filter(prefKey => !prefKey.includes('hidden'))
      .sort()
      .forEach((prefKey) => {
        const type = this.SettingsSchema.get_key(prefKey).get_value_type().dup_string()
        switch (type) {
          case 's':
            addRow(new Gtk.Entry(), prefKey); break
          case 'b':
            addRow(new Gtk.Switch(), prefKey); break
        }
      })

    const buttonsRow = this.getOrientedBox(Gtk.Orientation.HORIZONTAL)

    const btReset = new Gtk.Button({
      label: _('Reset settings'),
      halign: Gtk.Align.END
    })
    btReset.connect('clicked', () => this.resetAll())
    const btBackup = new Gtk.Button({
      label: _('Backup & restore'),
      halign: Gtk.Align.END
    })
    btBackup.connect('clicked', () => this.launchBackupDialog())
    this.appendToBox(buttonsRow, btReset)
    this.appendToBox(buttonsRow, btBackup)

    this.main.attach(buttonsRow, 1, this.SettingsSchema.list_keys().length + 1, 1, 1)

    if (shellVersion < 40) {
      this.main.show_all()
    }
  }

  getOrientedBox (orientation) {
    let box = null
    if (shellVersion < 40) {
      box = new Gtk.HBox()
    } else {
      box = new Gtk.Box({ orientation: orientation })
    }
    box.spacing = 18
    return box
  }

  appendToBox (box, input) {
    if (shellVersion < 40) {
      box.pack_end(input, false, false, 0)
    } else {
      box.append(input)
    }
    return box
  }

  resetAll () {
    this.SettingsSchema.list_keys().forEach(prefKey => this.Settings.reset(prefKey))
  }

  launchBackupDialog () {
    const profiles = Object.entries(fmh.listremotes()).map(entry => entry[0])
    const dialog = new Gtk.Dialog({
      // default_height: 200,
      // default_width: 200,
      modal: true,
      title: _('Backup & restore'),
      use_header_bar: false
    })
    dialog.add_button(_('Backup'), 0)
    dialog.add_button(_('Restore'), 1)
    dialog.add_button(_('Cancel'), Gtk.ResponseType.NO)

    dialog.connect('response', (dialog, response) => {
      this.onBackupDialogResponse(dialog, response)
    })

    const contentArea = dialog.get_content_area()
    contentArea.style_class = 'dialog-backup'
    const contentBox = this.getOrientedBox(Gtk.Orientation.VERTICAL)

    var liststore = new Gtk.ListStore()
    liststore.set_column_types([GObject.TYPE_STRING])
    profiles.forEach((profile) => { liststore.set(liststore.append(), [0], [profile]) })
    const ComboBox = new Gtk.ComboBox({ model: liststore })
    const renderer = new Gtk.CellRendererText()
    ComboBox.pack_start(renderer, true)
    ComboBox.add_attribute(renderer, 'text', 0)
    ComboBox.connect('changed', function (entry) {
      const [success, iter] = entry.get_active_iter()
      if (!success) return
      dialog.profile = liststore.get_value(iter, 0)
    })
    this.appendToBox(contentBox, new Gtk.Label({ label: _('Select a profile where backup to or restorer from'), vexpand: true }))
    this.appendToBox(contentBox, ComboBox)
    this.appendToBox(contentArea, contentBox)
    if (shellVersion < 40) {
      contentArea.show_all()
    }
    dialog.show()
  }

  onBackupDialogResponse (dialog, response) {
    fmh.PREF_RCONFIG_FILE_PATH = this.Settings.get_string(fmh.PrefsFields.PREFKEY_RCONFIG_FILE_PATH)
    fmh.PREF_BASE_MOUNT_PATH = this.Settings.get_string(fmh.PrefsFields.PREFKEY_BASE_MOUNT_PATH)
    fmh.PREF_BASE_MOUNT_PATH = fmh.PREF_BASE_MOUNT_PATH.replace('~', GLib.get_home_dir())
    if (!fmh.PREF_BASE_MOUNT_PATH.endsWith('/')) fmh.PREF_BASE_MOUNT_PATH = fmh.PREF_BASE_MOUNT_PATH + '/'
    fmh.PREF_RCONFIG_FILE_PATH = fmh.PREF_RCONFIG_FILE_PATH.replace('~', GLib.get_home_dir())

    const profile = dialog.profile
    dialog.destroy()
    var statusResult, out, err, isSuccessful
    if (response === 0) {
      // Backup
      [statusResult, out, err] = fmh.spawnSync(fmh.RC_COPY
        .replace('%source', fmh.PREF_RCONFIG_FILE_PATH)
        .replace('%destination', fmh.PREF_BASE_MOUNT_PATH + profile + '/.rclone.conf')
        .split(' ')
      )
    } else if (response === 1) {
      // Restore
      [statusResult, out, err] = fmh.spawnSync(fmh.RC_COPYTO
        .replace('%profile', profile)
        .replace('%source', '/.rclone.conf')
        .replace('%destination', fmh.PREF_RCONFIG_FILE_PATH)
        .split(' ')
      )
    } else {
      return
    }
    log(`err, ${err}`)
    log(`prefs.onBackupDialogResponse, statusResult, ${statusResult}`)

    const resultDialog = new Gtk.MessageDialog({
      title: _('Backup & restore'),
      text: statusResult === 0 ? _('Operation succeed') : _('Operation failed') + '\n' + err,
      buttons: [Gtk.ButtonsType.OK]
    })
    resultDialog.connect('response', (resultDialog) => { resultDialog.destroy() })
    resultDialog.show()
  }
})

function buildPrefsWidget () {
  const widget = new App()
  return widget.main
}
