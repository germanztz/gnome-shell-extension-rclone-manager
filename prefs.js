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
    RCONFIG_FILE_PATH       : 'rconfig-file-path',
    BASE_MOUNT_PATH         : 'base-mount-path',
    IGNORE_PATTERNS         : 'ignore-patterns',
    EXTERNAL_TERMINAL       : 'external-terminal',
    EXTERNAL_FILE_BROWSER   : 'external-file-browser',
    EXTERNAL_TEXT_EDITOR    : 'external-text-editor',
    // MOUNT_FLAGS             : 'mount-flags',
    AUTOSYNC                : 'autosync',
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
 
        const addRow = ((main) => {
            let row = 0;
            return (input, label, schemaKey) => {
                let inputWidget = input;
                let LabelWidget = new Gtk.Label({
                    label: _(label),
                    hexpand: true,
                    halign: Gtk.Align.START
                });
        
                let property = 'text';
        
                if (inputWidget instanceof Gtk.Switch) {
                    inputWidget = this.fixSwitch(inputWidget)
                    property = 'active';
                }

                main.attach(LabelWidget, 0, row, 1, 1);
                main.attach(inputWidget, 1, row, 1, 1);

                SettingsSchema.bind(schemaKey, input, property, Gio.SettingsBindFlags.DEFAULT);

                row++;
            };
        })(this.main);

        addRow(new Gtk.Entry(), "Rclone file path", Fields.RCONFIG_FILE_PATH);
        addRow(new Gtk.Entry(), "Base mount path", Fields.BASE_MOUNT_PATH);
        addRow(new Gtk.Entry(), "Filenames to be ignored", Fields.IGNORE_PATTERNS);
        addRow(new Gtk.Entry(), "Command to call a new terminal window", Fields.EXTERNAL_TERMINAL);
        addRow(new Gtk.Entry(), "Command to call a new file browser window", Fields.EXTERNAL_FILE_BROWSER);
        addRow(new Gtk.Entry(), "Command to call a new text editor window", Fields.EXTERNAL_TEXT_EDITOR);  
        // addRow(new Gtk.Entry(), "Optional mount flags", Fields.MOUNT_FLAGS);  
        addRow(new Gtk.Switch(), "Sync files on start", Fields.AUTOSYNC);
        addRow(new Gtk.Entry(), "List remotes command", Fields.RC_LIST_REMOTES);  
        addRow(new Gtk.Entry(), "Create command", Fields.RC_CREATE_DIR);  
        addRow(new Gtk.Entry(), "Delete dir command", Fields.RC_DELETE_DIR);  
        addRow(new Gtk.Entry(), "Delete file command", Fields.RC_DELETE_FILE);  
        addRow(new Gtk.Entry(), "Mount command", Fields.RC_MOUNT);  
        addRow(new Gtk.Entry(), "Sync command", Fields.RC_SYNC);  
        addRow(new Gtk.Entry(), "Copy file command", Fields.RC_COPYTO);  
        addRow(new Gtk.Entry(), "Add config command", Fields.RC_ADDCONFIG);  
        addRow(new Gtk.Entry(), "Delete config command", Fields.RC_DELETE);  
        addRow(new Gtk.Entry(), "Reconnect config command", Fields.RC_RECONNECT);  
        addRow(new Gtk.Entry(), "Umount command", Fields.RC_UMOUNT);  
        addRow(new Gtk.Entry(), "Get mounts command", Fields.RC_GETMOUNTS);  

        if (shellVersion < 40){
            this.main.show_all();
        }
    },

    fixSwitch: function(input){
        let inputWidget = input;
        if (shellVersion < 40){
            inputWidget = new Gtk.HBox();
            inputWidget.pack_end(input, false, false, 0);
        }else{
            inputWidget = new Gtk.Box({orientation: Gtk.Orientation.HORIZONTAL,});
            inputWidget.append(input);
        }
        return inputWidget;
    }

});

function buildPrefsWidget(){
    let widget = new App();
    return widget.main;
}