const GObject = imports.gi.GObject;
const Gtk = imports.gi.Gtk;
const Gio = imports.gi.Gio;
const Lang = imports.lang;
const Extension = imports.misc.extensionUtils.getCurrentExtension();

const Gettext = imports.gettext;
const _ = Gettext.domain('rclone-manager').gettext;

const Config = imports.misc.config;
const [major] = Config.PACKAGE_VERSION.split('.');
const shellVersion = Number.parseInt(major);

var Fields = {
    PREF_RCONFIG_FILE_PATH       : 'rconfig-file-path',
    PREF_BASE_MOUNT_PATH         : 'base-mount-path',
    PREF_IGNORE_PATTERNS         : 'ignore-patterns',
    PREF_EXTERNAL_TERMINAL       : 'external-terminal',
    PREF_EXTERNAL_FILE_BROWSER   : 'external-file-browser',
    PREF_AUTOSYNC                : 'autosync',
    RC_LIST_REMOTES         : 'rclone-listremotes',
    RC_CREATE_DIR 	        : 'rclone-copy',
    RC_DELETE_DIR 	        : 'rclone-purge',
    RC_DELETE_FILE 	        : 'rclone-delete',
    RC_MOUNT 			    : 'rclone-mount',
    RC_SYNC  			    : 'rclone-sync',
    RC_COPYTO  		        : 'rclone-copyto',
    RC_ADDCONFIG 		    : 'rclone-config',
    RC_DELETE 		        : 'rclone-config-delete',
    RC_RECONNECT  	        : 'rclone-config-reconnect',
    RC_UMOUNT 		        : 'umount-source',
    RC_GETMOUNTS 		    : 'mount',
};

const SCHEMA_NAME = 'org.gnome.shell.extensions.rclone-manager';

var schemaDir = Extension.dir.get_child('schemas').get_path();
var schemaSource = Gio.SettingsSchemaSource.new_from_directory(schemaDir, Gio.SettingsSchemaSource.get_default(), false);
var schema = schemaSource.lookup(SCHEMA_NAME, false);
var SettingsSchema = new Gio.Settings({ settings_schema: schema });

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
            column_homogeneous: false,
            row_homogeneous: false
        });
 
        const addRow = ((main) => {
            let row = 0;
            return (input, label, schemaKey) => {
                let inputWidget = input;
                let LabelWidget = new Gtk.Label({
                    label: _(label),
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

                SettingsSchema.bind(schemaKey, input, property, Gio.SettingsBindFlags.DEFAULT);

                row++;
            };
        })(this.main);

        addRow(new Gtk.Entry(), "Rclone file path", Fields.PREF_RCONFIG_FILE_PATH);
        addRow(new Gtk.Entry(), "Base mount path", Fields.PREF_BASE_MOUNT_PATH);
        addRow(new Gtk.Entry(), "Filenames to be ignored", Fields.PREF_IGNORE_PATTERNS);
        addRow(new Gtk.Entry(), "Terminal command", Fields.PREF_EXTERNAL_TERMINAL);
        addRow(new Gtk.Entry(), "File browser command", Fields.PREF_EXTERNAL_FILE_BROWSER);
        addRow(new Gtk.Switch(), "Sync files on start", Fields.PREF_AUTOSYNC);
        // addRow(new Gtk.Entry(), "List remotes command", Fields.RC_LIST_REMOTES);  
        addRow(new Gtk.Entry(), "Create command", Fields.RC_CREATE_DIR);  
        addRow(new Gtk.Entry(), "Delete dir command", Fields.RC_DELETE_DIR);  
        addRow(new Gtk.Entry(), "Delete file command", Fields.RC_DELETE_FILE);  
        addRow(new Gtk.Entry(), "Mount command", Fields.RC_MOUNT);  
        addRow(new Gtk.Entry(), "Sync command", Fields.RC_SYNC);  
        // addRow(new Gtk.Entry(), "Copy file command", Fields.RC_COPYTO);  
        // addRow(new Gtk.Entry(), "Add config command", Fields.RC_ADDCONFIG);  
        // addRow(new Gtk.Entry(), "Delete config command", Fields.RC_DELETE);  
        // addRow(new Gtk.Entry(), "Reconnect config command", Fields.RC_RECONNECT);  
        // addRow(new Gtk.Entry(), "Umount command", Fields.RC_UMOUNT);  
        // addRow(new Gtk.Entry(), "Get mounts command", Fields.RC_GETMOUNTS);  

        let buttonsRow = this.getHorizontalBox();

        let btReset = new Gtk.Button({
            label: _('Reset settings'),
            halign: Gtk.Align.END
        });
        btReset.connect("clicked", this.resetAll);
        this.appendToBox(buttonsRow, btReset);
        // let btRestore = new Gtk.Button({
        //     label: _('Restore config'),
        //     halign: Gtk.Align.END
        // });
        // btRestore.connect("clicked", this.restoreConfig);
        // this.appendToBox(buttonsRow, btRestore);

        this.main.attach(buttonsRow, 1,  schema.list_keys().length+1, 1, 1);


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
        schema.list_keys().forEach(prefKey => SettingsSchema.reset(prefKey));
    },

    // restoreConfig: function(){
    //     log('restoreConfig');

    // }
});

function buildPrefsWidget(){
    let widget = new App();
    return widget.main;
}
