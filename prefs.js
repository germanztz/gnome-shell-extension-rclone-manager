const GObject = imports.gi.GObject;
const Gtk = imports.gi.Gtk;
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const Lang = imports.lang;
const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
// const ConfirmDialog = Me.imports.confirmDialog;

const Gettext = imports.gettext;
const _ = Gettext.domain('rclone-manager').gettext;

const Config = imports.misc.config;
const [major] = Config.PACKAGE_VERSION.split('.');
const shellVersion = Number.parseInt(major);

var Fields = {
    PREFKEY_RCONFIG_FILE_PATH       : 'prefkey001-rconfig-file-path',
    PREFKEY_BASE_MOUNT_PATH         : 'prefkey002-base-mount-path',
    PREFKEY_IGNORE_PATTERNS         : 'prefkey003-ignore-patterns',
    PREFKEY_EXTERNAL_TERMINAL       : 'prefkey004-external-terminal',
    PREFKEY_EXTERNAL_FILE_BROWSER   : 'prefkey005-external-file-browser',
    PREFKEY_AUTOSYNC                : 'prefkey006-autosync',
    PREFKEY_RC_CREATE_DIR           : 'prefkey007-rclone-copy',
    PREFKEY_RC_DELETE_DIR           : 'prefkey008-rclone-purge',
    PREFKEY_RC_DELETE_FILE          : 'prefkey009-rclone-delete',
    PREFKEY_RC_MOUNT 		        : 'prefkey010-rclone-mount',
    PREFKEY_RC_SYNC  		        : 'prefkey011-rclone-sync',
    HIDDENKEY_PROFILE_REGISTRY      : 'hiddenkey012-profile-registry',
};

const SCHEMA_NAME = 'org.gnome.shell.extensions.rclone-manager';

var schemaDir = Me.dir.get_child('schemas').get_path();
var SettingsSchemaSource = Gio.SettingsSchemaSource.new_from_directory(schemaDir, Gio.SettingsSchemaSource.get_default(), false);
var SettingsSchema = SettingsSchemaSource.lookup(SCHEMA_NAME, false);
var Settings = new Gio.Settings({ settings_schema: SettingsSchema });

function init() {
    let localeDir = Me.dir.get_child('locale');
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
            column_homogeneous: false,
            row_homogeneous: false
        });
 
        const addRow = ((main) => {
            let row = 0;
            return (input, prefKey) => {
                let inputWidget = input;
                let LabelWidget = new Gtk.Label({
                    label: _(SettingsSchema.get_key(prefKey).get_summary() ),
                    hexpand: false,
                    halign: Gtk.Align.START
                });
        
                let property = 'text';
        
                if (inputWidget instanceof Gtk.Switch) {
                    inputWidget = this.appendToBox(this.getHorizontalBox(), inputWidget);
                    property = 'active';
                }
                inputWidget.hexpand = true; 

                main.attach(LabelWidget, 0, row, 1, 1);
                main.attach(inputWidget, 1, row, 1, 1);

                Settings.bind(prefKey, input, property, Gio.SettingsBindFlags.DEFAULT);

                row++;
            };
        })(this.main);

        SettingsSchema.list_keys()
            .filter(prefKey => !prefKey.includes('hidden'))
            .sort()
            .forEach((prefKey) => {
                let type = SettingsSchema.get_key(prefKey).get_value_type().dup_string();
                switch (type) {
                    case 's':
                        addRow(new Gtk.Entry(), prefKey); break;
                    case 'b':
                        addRow(new Gtk.Switch(), prefKey); break;
            }
            
        });

        let buttonsRow = this.getHorizontalBox();

        let btReset = new Gtk.Button({
            label: _('Reset settings'),
            halign: Gtk.Align.END
        });
        btReset.connect("clicked", this.resetAll);
        this.appendToBox(buttonsRow, btReset);

        let btAbout = new Gtk.Button({
            label: _('About'),
            halign: Gtk.Align.END
        });
        btAbout.connect("clicked", this.about);
        this.appendToBox(buttonsRow, btAbout);
        // let btRestore = new Gtk.Button({
        //     label: _('Restore config'),
        //     halign: Gtk.Align.END
        // });
        // btRestore.connect("clicked", this.restoreConfig);
        // this.appendToBox(buttonsRow, btRestore);

        this.main.attach(buttonsRow, 1,  SettingsSchema.list_keys().length+1, 1, 1);


        if (shellVersion < 40){
            this.main.show_all();
        }
    },

    getHorizontalBox: function(){
        let box = null;
        if (shellVersion < 40){
            box = new Gtk.HBox();
        }else{
            box = new Gtk.Box({orientation: Gtk.Orientation.HORIZONTAL});
        }
        box.spacing= 18;
        return box;
    },

    appendToBox: function(box, input){
        if (shellVersion < 40){
            box.pack_end(input, false, false, 0);
        }else{
            box.append(input);
        }
        return box;
    },

    resetAll: function(){
        SettingsSchema.list_keys().forEach(prefKey => Settings.reset(prefKey));
    },

    about: function(){
        
        let dialog = Gtk.Dialog.new();
        dialog.set_title(_("About"));
        dialog.add_button(_("Ok"), Gtk.ResponseType.CANCEL);
        let box = Gtk.Box.new(Gtk.Orientation.HORIZONTAL, 10);
        dialog.get_content_area().add(box);
        let label = Gtk.Label.new("Rclone Manager");
        box.pack_start(label, true, true, 5);
        dialog.show_all();
        dialog.run();
    }
});

function buildPrefsWidget(){
    let widget = new App();
    return widget.main;
}
