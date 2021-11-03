const GLib = imports.gi.GLib;
const File = GLib.File;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Prefs = Me.imports.prefs;
const SettingsSchema = Prefs.SettingsSchema;

let baseMountPath = SettingsSchema.get_string(Prefs.Fields.BASE_MOUNT_PATH);

function automount(rconfig){
	for (let profile in rconfig){
		// print("rclone profile", JSON.stringify(rconfig[profile]))
		if (rconfig[profile]['x-multirctray-synctype'] == 'inotify') 
			init_filemonitor(profile);
		else if (rconfig[profile]['x-multirctray-synctype'] == 'mount') ;
		else ;
	}
}

/**
 * https://gjs-docs.gnome.org/gio20~2.66p/gio.filemonitor
 * @param {*} profile 
 */
function init_filemonitor(profile){
	try {
        baseMountPath = baseMountPath.replace('~',GLib.get_home_dir());
		let profiledir = GLib.File.new_for_path(baseMountPath + profile);
		let monitor = profiledir.monitor_directory(GLib.File.FileMonitorFlags.NONE, null);
		print ("rclone Monitoring", profiledir.get_path());

		monitor.changed.connect ((src, dest, event) => {
			if (dest != null) {
				print (event.to_string (), src.get_path (), dest.get_path ());
			} else {
				print (event.to_string (), src.get_path ());
			}
		});

		new MainLoop ().run ();
	} catch (e) {
		printerr("rclone-manager Error:", e.message);
        logError(e, 'rclone-manager Error');
	}
}