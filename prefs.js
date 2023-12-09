/* eslint-disable no-var */
/* eslint-disable no-unused-vars */
/* eslint-disable no-undef */
import GLib from 'gi://GLib'
import GObject from 'gi://GObject';
import Gio from 'gi://Gio'
import Gtk from 'gi://Gtk'
import { ExtensionPreferences, gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import { FileMonitorHelper, PrefsFields, ProfileStatus } from './fileMonitorHelper.js';

export default class RcloneManagerPreferences extends ExtensionPreferences {
    getPreferencesWidget() {
        return new RcloneManagerWidget(this);
    }
}

const RcloneManagerWidget = GObject.registerClass(
    class RcloneManagerWidget extends Gtk.Box {
        _init(extension) {
            super._init({orientation: Gtk.Orientation.VERTICAL, spacing: 30});
            this._settings = extension.getSettings();
            this.fmh = new FileMonitorHelper();
            this.fmh.loadSettings(this._settings);

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
                        label: _(this._settings.settings_schema.get_key(prefKey).get_summary()),
                        hexpand: false,
                        halign: Gtk.Align.START
                    })
                    let property = 'text'

                    if (inputWidget instanceof Gtk.Switch) {
                        inputWidget = this.appendToBox(this.getOrientedBox(Gtk.Orientation.HORIZONTAL), inputWidget)
                        property = 'active'
                    } else if (inputWidget instanceof Gtk.SpinButton) {
                        property = 'value'
                    }
                    if (prefKey === PrefsFields.PREFKEY_RCONFIG_PASSWORD) {
                        inputWidget.set_visibility(false)
                        inputWidget.set_input_purpose(Gtk.InputPurpose.PASSWORD)
                    }

                    inputWidget.hexpand = true

                    main.attach(LabelWidget, 0, row, 1, 1)
                    main.attach(inputWidget, 1, row, 1, 1)

                    this._settings.bind(prefKey, input, property, Gio.SettingsBindFlags.DEFAULT)

                    row++
                }
            })(this.main)

            this._settings.list_keys()
                .filter(prefKey => !prefKey.includes('hidden'))
                .sort()
                .forEach((prefKey) => {
                    const type = this._settings.settings_schema.get_key(prefKey).get_value_type().dup_string()
                    switch (type) {
                        case 's':
                            addRow(new Gtk.Entry(), prefKey); break
                        case 'b':
                            addRow(new Gtk.Switch(), prefKey); break
                        case 'i':
                            addRow(new Gtk.SpinButton({
                                adjustment: new Gtk.Adjustment({ lower: 0, upper: 999, step_increment: 1 })
                            }), prefKey); break
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

            this.main.attach(buttonsRow, 1, this._settings.list_keys().length + 1, 1, 1)
            this.append(this.main)

        }


        getOrientedBox(orientation) {
            let box = null
            box = new Gtk.Box({ orientation: orientation })
            box.spacing = 18
            return box
        }

        appendToBox(box, input) {
            box.append(input)
            return box
        }

        resetAll() {
            this._settings.list_keys().forEach(prefKey => this._settings.reset(prefKey))
        }

        launchBackupDialog() {
            const profiles = Object.entries(this.fmh.listremotes()).map(entry => entry[0])
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
            this.appendToBox(contentBox, new Gtk.Label({ label: _('Select a profile where backup to or restore from'), vexpand: true }))
            this.appendToBox(contentBox, ComboBox)
            this.appendToBox(contentArea, contentBox)
            dialog.show()
        }

        onBackupDialogResponse(dialog, response) {
            this.fmh.PREF_RCONFIG_FILE_PATH = this._settings.get_string(PrefsFields.PREFKEY_RCONFIG_FILE_PATH)
            this.fmh.PREF_BASE_MOUNT_PATH = this._settings.get_string(PrefsFields.PREFKEY_BASE_MOUNT_PATH)
            this.fmh.PREF_BASE_MOUNT_PATH = this.fmh.PREF_BASE_MOUNT_PATH.replace('~', GLib.get_home_dir())
            if (!this.fmh.PREF_BASE_MOUNT_PATH.endsWith('/')) this.fmh.PREF_BASE_MOUNT_PATH = this.fmh.PREF_BASE_MOUNT_PATH + '/'
            this.fmh.PREF_RCONFIG_FILE_PATH = this.fmh.PREF_RCONFIG_FILE_PATH.replace('~', GLib.get_home_dir())

            const profile = dialog.profile
            dialog.destroy()
            var statusResult, out, err, isSuccessful
            if (response === 0) {
                // Backup
                try {
                    [statusResult, out, err] = this.fmh.spawnSync(this.fmh.RC_COPY
                    .replace('%source', this.fmh.PREF_RCONFIG_FILE_PATH)
                    .replace('%destination', this.fmh.PREF_BASE_MOUNT_PATH + profile + '/.rclone.conf')
                    .replace('%pcmd', `"echo ${this.fmh.PREF_RCONFIG_PASSWORD}"`)
                    .split(' ')
                    )
                } catch (e) {
                    logError(e)
                }
        } else if (response === 1) {
                // Restore
                try {
                    [statusResult, out, err] = this.fmh.spawnSync(this.fmh.PREF_RC_COPYTO
                        .replace('%profile', profile)
                        .replace('%source', '/.rclone.conf')
                        .replace('%destination', this.fmh.PREF_RCONFIG_FILE_PATH)
                        .replace('%pcmd', `"echo ${this.fmh.PREF_RCONFIG_PASSWORD}"`)
                        .split(' ')
                    )
                } catch (e) {
                    logError(e)
                }
        } else {
                return
            }
            this.fmh.PREF_DBG && log(`prefs.onBackupDialogResponse, statusResult, ${statusResult}, err, ${err}`)

            const resultDialog = new Gtk.MessageDialog({
                title: _('Backup & restore'),
                text: statusResult === 0 ? _('Operation succeed') : _('Operation failed') + '\n' + err,
                buttons: [Gtk.ButtonsType.OK]
            })
            resultDialog.connect('response', (resultDialog) => { resultDialog.destroy() })
            resultDialog.show()
        }

    });
