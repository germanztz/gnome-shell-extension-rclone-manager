/**
 * https://wiki.gnome.org/Projects/Vala/GIOSamples
 */

const GLib = imports.gi.GLib;
const Gio = imports.gi.Gio;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Prefs = Me.imports.prefs;
const SettingsSchema = Prefs.SettingsSchema;

const RC_CREATE_DIR = 'rclone copy "%source" %profile:"%destination" --create-empty-src-dirs';
const RC_DELETE_DIR = 'rclone purge %profile:"%destination" --ignore-errors';
const RC_CREATE_FILE = 'rclone copy "%source" %profile:"%destination" --create-empty-src-dirs';
const RC_DELETE_FILE = 'rclone delete %profile:"%destination" --ignore-errors';
const RC_MOUNT = "rclone mount %profile: %source --vfs-cache-mode writes --volname %profile \
    --file-perms 0777 --allow-non-empty --allow-other --write-back-cache --no-modtime --daemon";
const RC_RECONNECT  = 'rclone config reconnect  %profile: %flags';
const RC_SYNC  = 'rclone sync %profile:"%source" --create-empty-src-dirs';
const RC_COPYTO  = 'rclone copyto %profile:"%destination" %source';

let baseMountPath = SettingsSchema.get_string(Prefs.Fields.BASE_MOUNT_PATH);
let monitors = []


function automount(rconfig){
	for (let profile in rconfig){

		this.monitors[profile] = [];

        baseMountPath = baseMountPath.replace('~',GLib.get_home_dir());
		if(!baseMountPath.endsWith('/')) baseMountPath = baseMountPath+'/';
		const basepath = baseMountPath + profile;
		this.monitors[profile]['basepath'] = basepath;

		if (rconfig[profile]['type'] == 'onedrive')
			this.monitors[profile]['flags'] = 
				'--onedrive-drive-id '+rconfig[profile]['drive_id']+
				' --onedrive-drive-type '+rconfig[profile]['drive_type']+
				' --auto-confirm';
		else this.monitors[profile]['flags'] = '';

		if (rconfig[profile]['x-multirctray-synctype'] == 'inotify') 
			init_filemonitor(profile);
		else if (rconfig[profile]['x-multirctray-synctype'] == 'mount') 
			mount(profile);
		else ;
	}
}

/**
 * https://gjs-docs.gnome.org/gio20~2.66p/gio.filemonitor
 * @param {string} profile 
 */
function init_filemonitor(profile){
	try {
		const gFile = Gio.file_new_for_path(basepath);
		monitor_directory_recursive(profile, gFile)
	} catch (e) {
		printerr("rclone-manager Error:", e.message);
        logError(e, 'rclone-manager Error');
	}
}

/**
 * 
 * @param {string} profile 
 * @param {Gio.File} directory 
 */
function monitor_directory_recursive(profile, directory){
	let monitor = directory.monitor_directory(Gio.FileMonitorFlags.NONE, null);
	monitor.connect('changed', function (monitor, file, other_file, event_type) 
	{ onEvent(profile, monitor, file, other_file, event_type); });

	this.monitors[profile][directory.get_path()] = monitor;
	print('rclone monitor rec', profile, directory.get_path());
	let subfolders = directory.enumerate_children('standard::name,standard::type',Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS, null);
	while ((file_info = subfolders.next_file(null)) != null) {
		if(file_info.get_file_type() == Gio.FileType.DIRECTORY)
			monitor_directory_recursive(profile, Gio.file_new_for_path(directory.get_path()+'/'+file_info.get_name()));
	}
}

/**
 * 
 * @param {string} profile 
 * @param {Gio.FileMonitor} monitor 
 * @param {Gio.File} file 
 * @param {Gio.File} other_file 
 * @param {Gio.FileMonitorEvent} event_type 
 */
function onEvent(profile, monitor, file, other_file, event_type){

	print("rclone", profile, file.get_path(), "event_type:", event_type);
	let file_info = file.query_info('*', Gio.FileQueryInfoFlags.NONE, null);
	switch (event_type) {
		case Gio.FileMonitorEvent.CHANGES_DONE_HINT:
			if (file_info.get_file_type() == Gio.FileType.DIRECTORY) rclone(RC_CREATE_DIR, profile, file);
			else rclone(RC_CREATE_FILE, profile, file);
		break;
		case Gio.FileMonitorEvent.DELETED:
			if (file_info.get_file_type() == Gio.FileType.DIRECTORY) rclone(RC_DELETE_DIR, profile, file);
			else rclone(RC_DELETE_FILE, profile, file);
		break;
		case Gio.FileMonitorEvent.CHANGED:
		case Gio.FileMonitorEvent.ATTRIBUTE_CHANGED:
		case Gio.FileMonitorEvent.PRE_UNMOUNT:
		case Gio.FileMonitorEvent.UNMOUNTED:
		case Gio.FileMonitorEvent.MOVED:
		case Gio.FileMonitorEvent.MOVED_IN:
		case Gio.FileMonitorEvent.MOVED_OUT:
		default:
			break;
	}
}

function mount(profile){
	rclone(RC_MOUNT, profile, this.monitors[profile]['basepath']);
}

function reconnect(profile){
	rclone(RC_RECONNECT, profile);
}

function sync(profile){
	rclone(RC_SYNC, profile, this.monitors[profile]['basepath']);	
}

function backup(profile){
	const configfile = SettingsSchema.get_string(Prefs.Fields.RCONFIG_FILE_PATH);
	configfile = configfile.replace('~',GLib.get_home_dir());
	rclone(	RC_COPYTO, profile, configfile, '/.rclone.conf');
}

function rclone(cmd, profile, file){
	const basepath = this.monitors[profile]['basepath'];
	const destination = file.get_path().replace(basepath,'');
	cmd = cmd.replace('%profile', profile)
			.replace('%source', file.get_path())
			.replace('%destination', destination)
			.replace('%flags', this.monitors[profile]['flags']);
	print(cmd);
}

function unount(profile){}

function remove_filemonitor(profile){}