const GObject = imports.gi.GObject;
const Gtk = imports.gi.Gtk;
const Gio = imports.gi.Gio;
const Lang = imports.lang;
const Extension = imports.misc.extensionUtils.getCurrentExtension();
const Utils = Extension.imports.utils;
const prettyPrint = Utils.prettyPrint;

const Gettext = imports.gettext;
const _ = Gettext.domain('rclone-manager').gettext;

var Fields = {
    RCONFIG_FILE_PATH : 'rconfig-file-path',
    BASE_MOUNT_PATH : 'base-mount-path',
    IGNORE_PATTERNS : 'ignore-patterns',
    AUTOSYNC : 'autosync',
};

const SCHEMA_NAME = 'org.gnome.shell.extensions.rclone-manager';

const getSchema = function () {
    let schemaDir = Extension.dir.get_child('schemas').get_path();
    let schemaSource = Gio.SettingsSchemaSource.new_from_directory(schemaDir, Gio.SettingsSchemaSource.get_default(), false);
    let schema = schemaSource.lookup(SCHEMA_NAME, false);
    return new Gio.Settings({ settings_schema: schema });
};

var SettingsSchema = getSchema();

function init() {
    let localeDir = Extension.dir.get_child('locale');
    if (localeDir.query_exists(null))
        Gettext.bindtextdomain('rclone-manager', localeDir.get_path());
}

const App = new Lang.Class({
    Name: 'RcloneManager.App',
    _init: function() {
        this.main = new Gtk.Grid({
            margin_top: 10,
            margin_bottom: 10,
            margin_start: 10,
            margin_end: 10,
            row_spacing: 12,
            column_spacing: 18,
            column_homogeneous: true,
            row_homogeneous: false
        });
        this.field_rconfig = new Gtk.Entry();
        this.field_base = new Gtk.Entry();
        this.field_ignore = new Gtk.Entry();
        this.field_autosync = new Gtk.Switch();

        let rconfigLabel = new Gtk.Label({
            label: _("Rclone file path"),
            hexpand: true,
            halign: Gtk.Align.START
        });

        let baseLabel = new Gtk.Label({
            label: _("Base mount path"),
            hexpand: true,
            halign: Gtk.Align.START
        });

        let ignoreLabel = new Gtk.Label({
            label: _("Filenames to be ignored"),
            hexpand: true,
            halign: Gtk.Align.START
        });

        let field_autosyncLabel = new Gtk.Label({
            label: _("Sync files on start"),
            hexpand: true,
            halign: Gtk.Align.START
        });
        
        const addRow = ((main) => {
            let row = 0;
            return (label, input) => {
                let inputWidget = input;

                if (input instanceof Gtk.Switch) {
                    inputWidget = new Gtk.Box({orientation: Gtk.Orientation.HORIZONTAL,});
                    inputWidget.append(input);
                }

                if (label) {
                    main.attach(label, 0, row, 1, 1);
                    main.attach(inputWidget, 1, row, 1, 1);
                }
                else {
                    main.attach(inputWidget, 0, row, 2, 1);
                }

                row++;
            };
        })(this.main);

        addRow(rconfigLabel, this.field_rconfig);
        addRow(baseLabel, this.field_base);
        addRow(ignoreLabel, this.field_ignore);
        addRow(field_autosyncLabel, this.field_autosync);

        SettingsSchema.bind(Fields.RCONFIG_FILE_PATH, this.field_rconfig, 'text', Gio.SettingsBindFlags.DEFAULT);
        SettingsSchema.bind(Fields.BASE_MOUNT_PATH, this.field_base, 'text', Gio.SettingsBindFlags.DEFAULT);
        SettingsSchema.bind(Fields.IGNORE_PATTERNS, this.field_ignore, 'text', Gio.SettingsBindFlags.DEFAULT);
        SettingsSchema.bind(Fields.AUTOSYNC, this.field_autosync, 'active', Gio.SettingsBindFlags.DEFAULT);
    },

});

function buildPrefsWidget(){
    let widget = new App();
    return widget.main;
}