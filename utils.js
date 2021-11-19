const GLib = imports.gi.GLib;
const Gio = imports.gi.Gio;
const FileQueryInfoFlags = imports.gi.Gio.FileQueryInfoFlags;
const FileCopyFlags = imports.gi.Gio.FileCopyFlags;
const FileTest = GLib.FileTest;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const REGISTRY_DIR = GLib.get_user_cache_dir() + '/' + Me.uuid;
const REGISTRY_FILE = 'registry.txt';
const REGISTRY_PATH = REGISTRY_DIR + '/' + REGISTRY_FILE;
const BACKUP_REGISTRY_PATH = REGISTRY_PATH + '~';

// I/O Files
function writeRegistry (registry) {
    log('writeRegistry',JSON.stringify(registry));
    let json = JSON.stringify(registry);
    let contents = new GLib.Bytes(json);

    // Make sure dir exists
    GLib.mkdir_with_parents(REGISTRY_DIR, parseInt('0775', 8));

    // Write contents to file asynchronously
    let file = Gio.file_new_for_path(REGISTRY_PATH);
    file.replace_async(null, false, Gio.FileCreateFlags.NONE,
                        GLib.PRIORITY_DEFAULT, null, function (obj, res) {

        let stream = obj.replace_finish(res);

        stream.write_bytes_async(contents, GLib.PRIORITY_DEFAULT,
                            null, function (w_obj, w_res) {

            w_obj.write_bytes_finish(w_res);
            stream.close(null);
        });
    });
}

function readRegistry (callback) {
    if (typeof callback !== 'function')
        throw TypeError('`callback` must be a function');

    let registry={};
    if (GLib.file_test(REGISTRY_PATH, FileTest.EXISTS)) {
        let file = Gio.file_new_for_path(REGISTRY_PATH);

        file.query_info_async('*', FileQueryInfoFlags.NONE,
                              GLib.PRIORITY_DEFAULT, null, function (src, res) {

            file.load_contents_async(null, function (obj, res) {
                let [success, contents] = obj.load_contents_finish(res);

                if (success) {
                    try {
                        // are we running gnome 3.30 or higher?
                        if (contents instanceof Uint8Array) {
                          contents = imports.byteArray.toString(contents);
                        }
                        registry = JSON.parse(contents);
                    }
                    catch (e) {
                        logError(e, 'rclone-manager Error');
                    }
                } else {
                    logError('rclone load_contents_async failed');
                }
                log('readRegistry',JSON.stringify(registry));
                callback(registry);
            });
        });
    } else {
        logError('rclone ! FileTest.EXISTS');
    }
}

