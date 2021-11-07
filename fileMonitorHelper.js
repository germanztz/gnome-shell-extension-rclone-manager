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
const RC_MOUNT = 'rclone mount %profile: "%source" --vfs-cache-mode writes --volname "%profile" --file-perms 0777 --allow-non-empty --allow-other --write-back-cache --no-modtime --daemon';
const RC_UMOUNT = 'umount "%source"';
const RC_GETMOUNTS = 'mount';
const RC_RECONNECT  = 'rclone config reconnect %profile: %flags';
const RC_SYNC  = 'rclone sync %profile:"%source" --create-empty-src-dirs';
const RC_COPYTO  = 'rclone copyto %profile:"%destination" %source';

var baseMountPath = SettingsSchema.get_string(Prefs.Fields.BASE_MOUNT_PATH);
var ignores = SettingsSchema.get_string(Prefs.Fields.IGNORE_PATTERNS).split(',');
var monitors = []

var ProfileStatus = {
    DISCONNECTED : '0',
    MOUNTED : '1',
    WATCHED : '2',
};

function automount(rconfig, callback){
	for (let profile in rconfig){

		this.monitors[profile] = [];

        baseMountPath = baseMountPath.replace('~',GLib.get_home_dir());
		if(!baseMountPath.endsWith('/')) baseMountPath = baseMountPath+'/';
		this.monitors[profile]['basepath'] = baseMountPath + profile;

		if (rconfig[profile]['type'] == 'onedrive')
			this.monitors[profile]['flags'] = 
				'--onedrive-drive-id '+rconfig[profile]['drive_id']+
				' --onedrive-drive-type '+rconfig[profile]['drive_type']+
				' --auto-confirm';
		else this.monitors[profile]['flags'] = '';

		if (rconfig[profile]['x-multirctray-synctype'] == 'inotify') 
			init_filemonitor(profile, callback);
		else if (rconfig[profile]['x-multirctray-synctype'] == 'mount') 
			mount(profile, callback);
		else ;
	}
}

/**
 * https://gjs-docs.gnome.org/gio20~2.66p/gio.filemonitor
 * @param {string} profile 
 */
function init_filemonitor(profile, callback){
	let ok = monitor_directory_recursive(profile, this.monitors[profile]['basepath']);
	if(ok && callback) callback(profile, this.ProfileStatus.WATCHED);
}

/**
 * 
 * @param {string} profile 
 * @param {Gio.File} directory 
 */
function monitor_directory_recursive(profile, path){
	try {
		const directory = Gio.file_new_for_path(path);
		let monitor = directory.monitor_directory(Gio.FileMonitorFlags.NONE, null);
		monitor.connect('changed', function (monitor, file, other_file, event_type) 
		{ onEvent(profile, monitor, file, other_file, event_type); });

		this.monitors[profile][directory.get_path()] = monitor;
		print('rclone monitor rec', profile, directory.get_path());
		let subfolders = directory.enumerate_children('standard::name,standard::type',Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS, null);
		while ((file_info = subfolders.next_file(null)) != null) {
			if(file_info.get_file_type() == Gio.FileType.DIRECTORY)
				monitor_directory_recursive(profile, path+'/'+file_info.get_name());
		}
		return true;
	} catch (e) {
		printerr("rclone-manager Error:", e.message);
		logError(e, 'rclone-manager Error');
		return false;
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

	for (const ign in this.ignores) {
		if (file.get_path().search(this.ignores[ign],0)>0) return;
	}

	print("rclone", profile, file.get_path(), "event_type:", event_type);
	let file_info = file.query_info('*', Gio.FileQueryInfoFlags.NONE, null);
	const is_dir = file_info.get_file_type() == Gio.FileType.DIRECTORY;

	let that = this;
	let callback = function (status, stdoutLines, stderrLines) { 
		that.onRcloneFinished(status, stdoutLines, stderrLines, profile, file);}

	switch (event_type) {
		case Gio.FileMonitorEvent.CHANGES_DONE_HINT:
			if (is_dir) rclone(RC_CREATE_DIR, profile, file, null, callback);
			else rclone(RC_CREATE_FILE, profile, file, null, callback);
		break;
		case Gio.FileMonitorEvent.DELETED:
			if (is_dir) rclone(RC_DELETE_DIR, profile, file, null, callback);
			else rclone(RC_DELETE_FILE, profile, file, null, callback);
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

function onRcloneFinished(status, stdoutLines, stderrLines, profile, file){
	print('rclone onRcloneFinished',status);
	print('rclone stdoutLines',stdoutLines.join('\n'));
	print('rclone stderrLines',stderrLines.join('\n'));
	print('rclone profile',profile);
	print('rclone file',file.get_path());
}

function mount(profile, callback){
	rclone(RC_MOUNT, profile, Gio.file_new_for_path(this.monitors[profile]['basepath']), null, callback);
	if(ok && callback) callback(profile, this.ProfileStatus.WATCHED);

}

function umount(profile, callback){
	rclone(RC_UMOUNT, profile, Gio.file_new_for_path(this.monitors[profile]['basepath']), callback);
}

function getMounts(){
	let [stat, stdout, stderr] = this.spawn_sync(RC_GETMOUNTS.split(' '));
	let mounts = [];
	if(stdout){
		stdout.split('\n')
			.filter(line => line.search('rclone') > 0)
			.forEach(line => mounts.push(line.split(':')[0]));
	}
	print('rclone mounts', mounts.join('\n'));
	return mounts;
}

function reconnect(profile){
	rclone(RC_RECONNECT, profile);
}

function sync(profile){
	rclone(RC_SYNC, profile, Gio.file_new_for_path(this.monitors[profile]['basepath']));	
}

function backup(profile){
	let configfile = SettingsSchema.get_string(Prefs.Fields.RCONFIG_FILE_PATH);
	configfile = configfile.replace('~',GLib.get_home_dir());
	rclone(	RC_COPYTO, profile, Gio.file_new_for_path(configfile), '/.rclone.conf');
}

function restore(profile){
	this.spawn_async_with_pipes(['ls','-la','.'], this.onRcloneFinished);
}

function rclone(cmd, profile, file, destination, callback){
	const basepath = this.monitors[profile]['basepath'];
	if(!destination && file) 
		destination = file.get_path().replace(basepath,'');
	cmd = cmd.replaceAll('%profile', profile)
			.replaceAll('%source', (file === undefined) ? '':file.get_path())
			.replace('%destination', destination)
			.replace('%flags', this.monitors[profile]['flags']);
	spawn_async_with_pipes(cmd.split(' '), callback);
}

function remove_filemonitor(profile){}


// A simple asynchronous read loop
function readOutput(stream, lineBuffer) {
    stream.read_line_async(0, null, (stream, res) => {
        try {
            let line = stream.read_line_finish_utf8(res)[0];

            if (line !== null) {
                lineBuffer.push(line);
                readOutput(stream, lineBuffer);
            }
        } catch (e) {
            logError(e);
        }
    });
}

/**
 * https://gjs.guide/guides/gio/subprocesses.html#asynchronous-communication
 * @param {Array} argv 
 * @param {CallableFunction} callback 
 */
function spawn_async_with_pipes(argv, callback){
	try {
		log(argv.join(' '));
		let [, pid, stdin, stdout, stderr] = GLib.spawn_async_with_pipes(
			// Working directory, passing %null to use the parent's
			null,
			// An array of arguments
			argv,
			// Process ENV, passing %null to use the parent's
			null,
			// Flags; we need to use PATH so `ls` can be found and also need to know
			// when the process has finished to check the output and status.
			GLib.SpawnFlags.SEARCH_PATH | GLib.SpawnFlags.DO_NOT_REAP_CHILD,
			// Child setup function
			null
		);

		// Any unsused streams still have to be closed explicitly, otherwise the
		// file descriptors may be left open
		GLib.close(stdin);

		// Okay, now let's get output stream for `stdout`
		let stdoutStream = new Gio.DataInputStream({
			base_stream: new Gio.UnixInputStream({
				fd: stdout,
				close_fd: true
			}),
			close_base_stream: true
		});

		// We'll read the output asynchronously to avoid blocking the main thread
		let stdoutLines = [];
		this.readOutput(stdoutStream, stdoutLines);

		// We want the real error from `stderr`, so we'll have to do the same here
		let stderrStream = new Gio.DataInputStream({
			base_stream: new Gio.UnixInputStream({
				fd: stderr,
				close_fd: true
			}),
			close_base_stream: true
		});

		let stderrLines = [];
		this.readOutput(stderrStream, stderrLines);

		// Watch for the process to finish, being sure to set a lower priority than
		// we set for the read loop, so we get all the output
		GLib.child_watch_add(GLib.PRIORITY_DEFAULT_IDLE, pid, (pid, status) => {

			if (status === 0) {
				log(stdoutLines.join('\n'));
			} else {
				logError(new Error(stderrLines.join('\n')));
			}

			// Ensure we close the remaining streams and process
			stdoutStream.close(null);
			stderrStream.close(null);
			GLib.spawn_close_pid(pid);

			callback === undefined || callback(status, stdoutLines, stderrLines);

		});
	} catch (e) {
		logError(e);
	}
}

function spawn_sync(argv){
	let out, err, status;
	try {
		log(argv.join(' '));
		let [ok, stdout, stderr, exit_status] =  GLib.spawn_sync(
			// Working directory, passing %null to use the parent's
			null,
			// An array of arguments
			argv,
			// Process ENV, passing %null to use the parent's
			null,
			// Flags; we need to use PATH so `ls` can be found and also need to know
			// when the process has finished to check the output and status.
			GLib.SpawnFlags.SEARCH_PATH,
			// Child setup function
			null);
	
		if (!ok) {
			if (stderr instanceof Uint8Array){
				err = imports.byteArray.toString(stderr);
				log(err);
			}
		// throw new Error(stderr);
		}
	
		if (stdout instanceof Uint8Array)
			out = imports.byteArray.toString(stdout);

		status = exit_status;

		print('rclone ok', ok);
		print('rclone stdout', out);
		print('rclone stderr', err);

	} catch (e) {
		logError(e);
	}	
	return [status, out, err]
}