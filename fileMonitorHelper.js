/**
 * https://wiki.gnome.org/Projects/Vala/GIOSamples
 */

const GLib = imports.gi.GLib;
const Gio = imports.gi.Gio;

var PREF_RCONFIG_FILE_PATH;
var PREF_BASE_MOUNT_PATH;
var PREF_IGNORE_PATTERNS;
var PREF_EXTERNAL_TERMINAL;
var PREF_EXTERNAL_FILE_BROWSER;
var PREF_RC_CREATE_DIR;
var PREF_RC_DELETE_DIR;
var PREF_RC_DELETE_FILE;
var PREF_RC_MOUNT;
var PREF_RC_SYNC;

var RC_LIST_REMOTES 			= 'rclone listremotes'
var RC_COPYTO  		    		= 'rclone copyto %profile:%destination %source';
var RC_ADDCONFIG 				= 'rclone config';
var RC_DELETE 		    		= 'rclone config delete %profile';
var RC_RECONNECT  	    		= 'rclone config reconnect %profile: %flags';
var RC_UMOUNT 		    		= 'umount %source';
var RC_GETMOUNTS 				= 'mount';

var monitors = {};
var mounts = {};

var ProfileStatus = {
	CREATED: 'CREATED',
	DELETED: 'DELETED',
    DISCONNECTED : 'DISCONNECTED',
    MOUNTED : 'MOUNTED',
    WATCHED : 'WATCHED',
    BUSSY : 'BUSSY',
    ERROR : 'ERROR',
};

/**
 * Returns the RCLONE configurations as properties
 * @returns {Object} An Object with the names of the RCLONE configurations as properties
 */
function listremotes(){
	let [, stdout] = spawn_sync(RC_LIST_REMOTES.split(' '));
	let ret = stdout
		.replace(new RegExp(':', 'g'), '')
		.split('\n')
		.filter(item => item.length > 1)
		//convert array of string to object of property objects
		.reduce((a, v) => ({ ...a, [v]: {}}), {}); 
	log('listremotes', JSON.stringify(ret));
	return ret
}

/** 
 * Initiates the monitor for an RCLONE profile
 * @param {string} profile Name
 * @param {fuction} onProfileStatusChanged callback function
 */
function init_filemonitor(profile, onProfileStatusChanged){
	monitors[profile] = {};
	monitors[profile]['ignores'] = PREF_IGNORE_PATTERNS.split(',');
	monitors[profile]['paths'] = {};
	monitors[profile]['basepath'] = PREF_BASE_MOUNT_PATH + profile;
	log('init_filemonitor',profile, monitors[profile]['basepath']);

	let ok = addMonitorRecursive(profile, monitors[profile]['basepath'], monitors[profile]['basepath'], onProfileStatusChanged);
	if(ok && onProfileStatusChanged) onProfileStatusChanged(profile, this.ProfileStatus.WATCHED, 'Filemonitor has been started');
}

/** 
 * Start a FileMonitor for a folder and it's subfolders
 * @param {string} profile Name
 * @param {Gio.File} path to be watcht
 * @param {string} profileMountPath base directory
 * @param {CallableFunction} onProfileStatusChanged callback function
 * 
 * @see https://gjs-docs.gnome.org/gio20~2.66p/gio.filemonitor
 */
function addMonitorRecursive(profile, path, profileMountPath, onProfileStatusChanged){
	try {
		const directory = Gio.file_new_for_path(path);
		let monitor = directory.monitor_directory(Gio.FileMonitorFlags.NONE, null);
		monitor.connect('changed', function (monitor, file, other_file, event_type) 
		{ onEvent(profile, monitor, file, other_file, event_type, profileMountPath, onProfileStatusChanged); });

		monitors[profile]['paths'][directory.get_path()] = monitor;
		log('addMonitorRecursive', profile, directory.get_path());
		let subfolders = directory.enumerate_children('standard::name,standard::type',Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS, null);
		let file_info;
		while ((file_info = subfolders.next_file(null)) != null) {
			if(file_info.get_file_type() == Gio.FileType.DIRECTORY)
				addMonitorRecursive(profile, path+'/'+file_info.get_name(), profileMountPath, onProfileStatusChanged);
		}
		return true;
	} catch (e) {
		logError(e, e.message);
		return false;
	}
}

/**
 * Calback function called when some file changes
 * @param {string} profile Name
 * @param {Gio.FileMonitor} monitor which triggered the Event
 * @param {Gio.File} file Changed
 * @param {Gio.File} other_file 
 * @param {Gio.FileMonitorEvent} event_type type of event
 */
function onEvent(profile, monitor, file, other_file, event_type, profileMountPath, onProfileStatusChanged){

	for (const idx in monitors[profile]['ignores']) {
		if (file.get_path().search(monitors[profile]['ignores'][idx],0)>0) return;
	}
	
	if(monitors[profile].hasOwnProperty('is_synching')){
		return;
	}

	log("onEvent", profile, file.get_basename(), "event_type:", event_type);
	let destinationFilePath = file.get_path().replace(profileMountPath,'');
	let callback = function (status, stdoutLines, stderrLines) { 
		onCmdFinished(status, stdoutLines, stderrLines, profile, file, onProfileStatusChanged);}

	switch (event_type) {
		case Gio.FileMonitorEvent.CHANGES_DONE_HINT:
			destinationFilePath = destinationFilePath.replace(file.get_basename(),'');
			if (isDir(file)) {
				addMonitorRecursive(profile, file.get_path(), profileMountPath, onProfileStatusChanged);
				destinationFilePath = destinationFilePath + file.get_basename();
			}
			onProfileStatusChanged && onProfileStatusChanged(profile, ProfileStatus.BUSSY);
			spawn_async_cmd(PREF_RC_CREATE_DIR, profile, file.get_path(), destinationFilePath, callback);
		break;
		case Gio.FileMonitorEvent.DELETED:
			onProfileStatusChanged && onProfileStatusChanged(profile, ProfileStatus.BUSSY);
			if (isDir(file)) {
				deleteFileMonitor(profile, file.get_path());
				spawn_async_cmd(PREF_RC_DELETE_DIR, profile, '', destinationFilePath, callback);
			} else {
				spawn_async_cmd(PREF_RC_DELETE_FILE, profile, '', destinationFilePath, callback);
			}
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

/**
 * Checks a File whether is a directory or not, it is has been deleted then checks if it is watched
 * @param {Gio.File} file to check
 * @returns {boolean} 
 */
function isDir(file){
	let isdir = false;
    if (GLib.file_test(file.get_path(), GLib.FileTest.EXISTS)) {
		isdir = GLib.file_test(file.get_path(), GLib.FileTest.IS_DIR);
	} else {
		Object.entries(monitors).forEach(entry => {
			if(!isdir) isdir = !(getFileMonitor(entry[0], file.get_path()) === undefined);
		});
	}
	log('isDir', file.get_path(), JSON.stringify(isdir));
	return isdir;
}

/**
 * Removes a filemonitor of a RCLONE profile
 * @param {string} profile name
 * @param {fuction} onProfileStatusChanged callback function
 */
function remove_filemonitor(profile, onProfileStatusChanged){
	if(getStatus(profile) == ProfileStatus.WATCHED){
		Object.entries(monitors[profile]['paths']).forEach( entry => {
			deleteFileMonitor(profile, entry[0])
		});
		delete monitors[profile];
		log('remove_filemonitor',profile);
		onProfileStatusChanged && onProfileStatusChanged(profile, this.ProfileStatus.DISCONNECTED);
	}
}

/**
 * Removes a filemonitor of a path
 * @param {string} profile name
 * @param {Gio.File} path folder to unwatch
 */
function deleteFileMonitor(profile, path){
	getFileMonitor(profile, path).cancel();
	delete monitors[profile]['paths'][path];
}

/**
 * Returns the filemonitor for a path
 * @param {string} profile name
 * @param {Gio.File} path folder of the monitor
 * @returns {Gio.FileMonitor} the filemonitor
 */
function getFileMonitor(profile, path){
	let fm = monitors[profile]['paths'][path];
	log('getFileMonitor', profile, path, 'FileMonitor:', fm)
	return fm;
}

/**
 * 
 * Callback function called when a console command finishes
 * @param {Int32} status return status of the console
 * @param {string[]} stdoutLines standard out lines
 * @param {string[]} stderrLines error out lines
 * @param {string} profile Name
 * @param {Gio.File} file changed if any
 * @param {fuction} onProfileStatusChanged callback function
 */
function onCmdFinished(status, stdoutLines, stderrLines, profile, file, onProfileStatusChanged){
	log('onCmdFinished',profile,file,status);
	if(status === 0){
		onProfileStatusChanged && onProfileStatusChanged(profile, getStatus(profile));
		log(' stdoutLines',stdoutLines.join('\n'));
	} else {
		onProfileStatusChanged && onProfileStatusChanged(profile, this.ProfileStatus.ERROR, stderrLines.join('\n'));
		log(' stderrLines',stderrLines.join('\n'));
	}
}

/**
 * Mounts a RCLONE profile
 * @param {string} profile name 
 * @param {CallableFunction} onProfileStatusChanged callback function
 */
function mount(profile, onProfileStatusChanged){
	let that = this;
	const directory = Gio.file_new_for_path(PREF_BASE_MOUNT_PATH + profile);
	if (!isDir(directory))
		directory.make_directory_with_parents (null, null);
	spawn_async_cmd(PREF_RC_MOUNT, profile, PREF_BASE_MOUNT_PATH + profile, null, 
		function(status, stdoutLines, stderrLines){
			if(status === 0) {
				if(onProfileStatusChanged) onProfileStatusChanged(profile, that.ProfileStatus.MOUNTED, '');
			} else {
				if(onProfileStatusChanged) onProfileStatusChanged(profile, that.ProfileStatus.ERROR, stderrLines.join('\n'));
			}
	});

}

/**
 * UMounts a RCLONE profile
 * @param {string} profile name 
 * @param {CallableFunction} onProfileStatusChanged callback function
 */
 function umount(profile, onProfileStatusChanged){
	let that = this;
	spawn_async_cmd(RC_UMOUNT, profile, PREF_BASE_MOUNT_PATH + profile, null, 
	function(status, stdoutLines, stderrLines){
		if(status === 0) {
			if(onProfileStatusChanged) onProfileStatusChanged(profile, that.ProfileStatus.MOUNTED, '');
		} else {
			if(onProfileStatusChanged) onProfileStatusChanged(profile, that.ProfileStatus.ERROR, stderrLines.join('\n'));
		}
	});
}

/**
 * Returns de RCLONE mounted drivers
 * @returns {Object} the names of the RCLONE mounted drivers as properties
 */
function getMounts(){
	let [stat, stdout, stderr] = this.spawn_sync(RC_GETMOUNTS.split(' '));
	let retmounts = [];
	if(stdout){
		stdout.split('\n')
			.filter(line => line.search('rclone') > 0)
			.forEach(line => retmounts.push(line.split(':')[0]));
	}
	log('getMounts', JSON.stringify(retmounts));
	mounts = retmounts.reduce((a, v) => ({ ...a, [v]: {}}), {});
	return retmounts;
}

/**
 * Returns the status of a profile
 * @param {string} profile name
 * @returns {ProfileStatus} the status of the profile
 */
function getStatus(profile){
	if(Object.entries(monitors).some(([key, value]) => key === profile)) return ProfileStatus.WATCHED;
	else if(Object.entries(mounts).some(([key, value]) => key === profile)) return ProfileStatus.MOUNTED;
	else return ProfileStatus.DISCONNECTED;
}

/**
 * Launch a console terminal whith RCLONE in order to reconnect the profile
 * @param {string} profile name
 */
function reconnect(profile){
	launch_term_cmd(RC_RECONNECT, profile);
}

/**
 * Lauch an RCLONE sincronization whith the remote repository
 * @param {string} profile name
 * @param {function} onProfileStatusChanged callback function
 */
function sync(profile, onProfileStatusChanged){

	if (getStatus(profile) == ProfileStatus.MOUNTED){
		if(onProfileStatusChanged) onProfileStatusChanged(profile, ProfileStatus.ERROR, 'Mounted Profiles are already in sync');
		return;
	} 

	log('sync', profile);

	if(monitors.hasOwnProperty(profile)){
		monitors[profile]['is_synching'] = true;
	}

	spawn_async_cmd(PREF_RC_SYNC, profile, PREF_BASE_MOUNT_PATH + profile, null, 
		function(status, stdoutLines, stderrLines){
			
			if(monitors.hasOwnProperty(profile)){
				delete(monitors[profile]['is_synching']);
			}

			if(status === 0) {
				if(onProfileStatusChanged) onProfileStatusChanged(profile, getStatus(profile), profile + ' Has synch');
			} else {
				if(onProfileStatusChanged) onProfileStatusChanged(profile, ProfileStatus.ERROR, stderrLines);
			}
		});	
}

function backup(profile, onProfileStatusChanged){
	spawn_async_cmd(RC_COPYTO, profile, PREF_RCONFIG_FILE_PATH, '/.rclone.conf',
	function(status, stdoutLines, stderrLines){
		if(status === 0) {
			if(onProfileStatusChanged) onProfileStatusChanged(profile, getStatus(profile), '');
		} else {
			if(onProfileStatusChanged) onProfileStatusChanged(profile, ProfileStatus.ERROR, stderrLines);
		}
	});
}

/**
 * Launch a file browser on the profile location
 * @param {string} profile name
 */
function open(profile){
	cmd = PREF_EXTERNAL_FILE_BROWSER.split(' ');
	cmd.push(PREF_BASE_MOUNT_PATH+profile);
	this.spawn_async_with_pipes(cmd);
}

function restore(profile, onProfileStatusChanged){
	this.spawn_async_with_pipes(['ls','-la','.'], this.onCmdFinished);
}

/**
 * Launch a console terminal whith RCLONE in order to add a new profile
 * @param {string} profile name
 */
function addConfig(onProfileStatusChanged){
	launch_term_cmd(RC_ADDCONFIG, false, false);
	onProfileStatusChanged && onProfileStatusChanged("", ProfileStatus.CREATED);
}

function deleteConfig(profile, onProfileStatusChanged){

	switch (getStatus(profile)) {
		case ProfileStatus.MOUNTED:
			umount(profile, function(status, stdoutLines, stderrLines){
				if(status === 0){
					let [stat, stdout, stderr] = spawn_sync(RC_DELETE.replace('%profile', profile).split(' '));
				}
			});
			break;
	
		case ProfileStatus.WATCHED:
			remove_filemonitor(profile);
			break;
	}

	onProfileStatusChanged && onProfileStatusChanged(profile, ProfileStatus.DELETED);
}

/**
 * 
 * @param {string} cmd 
 * @param {string} profile 
 * @param {string} file 
 * @param {string} destination 
 * @param {string} callback 
 * @param {string} flags 
 */
function spawn_async_cmd(cmd, profile, file, destination, callback, flags){
	let cmdArray = cmd.split(' ');
	log('spawn_async_cmd', profile, cmd)
	for (var i = 0; i < cmdArray.length; i++) {
		cmdArray[i] = cmdArray[i]
			.replace('%profile', profile)
			.replace('%source', file)
			.replace('%destination', destination)
			.replace('%flags', flags);
	}
	spawn_async_with_pipes(cmdArray, callback);
}

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
		log('spawn_async_with_pipes',argv.join(' '));
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
				logError(new Error('Error executing command'), stderrLines.join('\n'));
			}

			// Ensure we close the remaining streams and process
			stdoutStream.close(null);
			stderrStream.close(null);
			GLib.spawn_close_pid(pid);

			callback && callback(status, stdoutLines, stderrLines);

		});
	} catch (e) {
		logError(e);
	}
}

function spawn_sync(argv){
	let out, err, status;
	try {
		log('spawn_sync', argv.join(' '));
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

		// log(' ok', ok);
		// log(' stdout', out);
		// log(' stderr', err);

	} catch (e) {
		logError(e);
	}	
	return [status, out, err]
}

function launch_term_cmd(cmd, autoclose, sudo){
	try{
		let autoclosecmd = autoclose ? '; echo "Press any key to exit"; read' : '';
		let sudocmd = sudo ? 'sudo' : '';
		cmd = PREF_EXTERNAL_TERMINAL + " {0} bash -c '{1} {2}'"
			.replace('{0}', sudocmd)
			.replace('{1}',cmd)
			.replace('{2}',autoclosecmd);
		log(cmd);
		GLib.spawn_command_line_async(cmd);
	}catch(e){
		logError(e);
	}

}