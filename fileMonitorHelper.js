/**
 * https://wiki.gnome.org/Projects/Vala/GIOSamples
 */

const GLib = imports.gi.GLib;
const Gio = imports.gi.Gio;

const RC_CREATE_DIR 	= 'rclone copy %source %profile:%destination --create-empty-src-dirs';
const RC_DELETE_DIR 	= 'rclone purge %profile:%destination --ignore-errors';
const RC_DELETE_FILE 	= 'rclone delete %profile:%destination --ignore-errors';

var monitors = {};
var mounts = {};
var rconfig = {};

var ProfileStatus = {
	CREATED: 'CREATED',
	DELETED: 'DELETED',
    DISCONNECTED : 'DISCONNECTED',
    MOUNTED : 'MOUNTED',
    WATCHED : 'WATCHED',
    BUSSY : 'BUSSY',
    ERROR : 'ERROR',
};

function getConfigs(){ return rconfig;}

function listremotes(RC_LIST_REMOTES){
	let [, stdout] = spawn_sync(RC_LIST_REMOTES.split(' '));
	let ret = stdout
		.replace(new RegExp(':', 'g'), '')
		.split('\n')
		.filter(item => item.length > 1);
	log('listremotes', JSON.stringify(ret));
	return ret
}

/**
 * https://gjs-docs.gnome.org/gio20~2.66p/gio.filemonitor
 * @param {string} profile 
 * @param {string} ignores 
 */
function init_filemonitor(profile, ignores, baseMountPath, onProfileStatusChanged){
	monitors[profile] = {};
	monitors[profile]['ignores'] = ignores.split(',');
	monitors[profile]['paths'] = {};
	monitors[profile]['basepath'] = baseMountPath + profile;
	log('init_filemonitor',profile, monitors[profile]['basepath']);

	let ok = addMonitorRecursive(profile, monitors[profile]['basepath'], monitors[profile]['basepath'], onProfileStatusChanged);
	if(ok && onProfileStatusChanged) onProfileStatusChanged(profile, this.ProfileStatus.WATCHED);
}

/**
 * 
 * @param {string} profile 
 * @param {Gio.File} directory 
 * @param {string} profileMountPath 
 * @param {CallableFunction} onProfileStatusChanged 
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
 * 
 * @param {string} profile 
 * @param {Gio.FileMonitor} monitor 
 * @param {Gio.File} file 
 * @param {Gio.File} other_file 
 * @param {Gio.FileMonitorEvent} event_type 
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
			spawn_async_cmd(RC_CREATE_DIR, profile, file.get_path(), destinationFilePath, callback);
		break;
		case Gio.FileMonitorEvent.DELETED:
			onProfileStatusChanged && onProfileStatusChanged(profile, ProfileStatus.BUSSY);
			if (isDir(file)) {
				deleteFileMonitor(profile, file.get_path());
				spawn_async_cmd(RC_DELETE_DIR, profile, '', destinationFilePath, callback);
			} else {
				spawn_async_cmd(RC_DELETE_FILE, profile, '', destinationFilePath, callback);
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

function deleteFileMonitor(profile, path){
	getFileMonitor(profile, path).cancel();
	delete monitors[profile]['paths'][path];
}

function getFileMonitor(profile, path){
	let fm = monitors[profile]['paths'][path];
	log('getFileMonitor', profile, path, 'FileMonitor:', fm)
	return fm;
}

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
 * 
 * @param {string} profile 
 * @param {CallableFunction} onProfileStatusChanged 
 */
function mount(RC_MOUNT, profile, baseMountPath, onProfileStatusChanged){
	let that = this;
	spawn_async_cmd(RC_MOUNT, profile, baseMountPath + profile, null, 
		function(status, stdoutLines, stderrLines){
			if(status === 0) {
				if(onProfileStatusChanged) onProfileStatusChanged(profile, that.ProfileStatus.MOUNTED, '');
			} else {
				if(onProfileStatusChanged) onProfileStatusChanged(profile, that.ProfileStatus.ERROR, stderrLines.join('\n'));
			}
	});

}

function umount(RC_UMOUNT, profile, baseMountPath, onProfileStatusChanged){
	spawn_async_cmd(RC_UMOUNT, profile, baseMountPath + profile, null, 
	function(status, stdoutLines, stderrLines){
		if(status === 0) {
			if(onProfileStatusChanged) onProfileStatusChanged(profile, that.ProfileStatus.MOUNTED, '');
		} else {
			if(onProfileStatusChanged) onProfileStatusChanged(profile, that.ProfileStatus.DISCONNECTED, stderrLines);
		}
	});
}

function getMounts(RC_GETMOUNTS){
	let [stat, stdout, stderr] = this.spawn_sync(RC_GETMOUNTS.split(' '));
	let mounts = [];
	if(stdout){
		stdout.split('\n')
			.filter(line => line.search('rclone') > 0)
			.forEach(line => mounts.push(line.split(':')[0]));
	}
	log('getMounts', JSON.stringify(mounts));
	return mounts;
}

function getStatus(profile){
	if(Object.entries(monitors).some(([key, value]) => key === profile)) return ProfileStatus.WATCHED;
	else if(Object.entries(mounts).some(([key, value]) => key === profile)) return ProfileStatus.MOUNTED;
	else return ProfileStatus.DISCONNECTED;
}

function reconnect(EXTERNAL_TERMINAL, RC_RECONNECT, profile){
	launch_term_cmd(EXTERNAL_TERMINAL, RC_RECONNECT, profile);
}

function sync(RC_SYNC, profile, baseMountPath,  onProfileStatusChanged){

	if (getStatus(profile) == ProfileStatus.MOUNTED){
		if(onProfileStatusChanged) onProfileStatusChanged(profile, ProfileStatus.ERROR, 'Mounted Profiles are already in sync');
		return;
	} 

	log('sync', profile);

	if(monitors.hasOwnProperty(profile)){
		monitors[profile]['is_synching'] = true;
	}

	// let callback = function (status, stdoutLines, stderrLines) { 
	// 	onCmdFinished(status, stdoutLines, stderrLines, profile, null, onProfileStatusChanged);}

	spawn_async_cmd(RC_SYNC, profile, baseMountPath + profile, null, 
		function(status, stdoutLines, stderrLines){
			
			if(monitors.hasOwnProperty(profile)){
				delete(monitors[profile]['is_synching']);
			}

			if(status === 0) {
				if(onProfileStatusChanged) onProfileStatusChanged(profile, getStatus(profile), '');
			} else {
				if(onProfileStatusChanged) onProfileStatusChanged(profile, ProfileStatus.ERROR, stderrLines);
			}
		});	
}

function backup(RC_COPYTO, profile, configfilePath, onProfileStatusChanged){
	spawn_async_cmd(RC_COPYTO, profile, configfilePath, '/.rclone.conf',
	function(status, stdoutLines, stderrLines){
		if(status === 0) {
			if(onProfileStatusChanged) onProfileStatusChanged(profile, getStatus(profile), '');
		} else {
			if(onProfileStatusChanged) onProfileStatusChanged(profile, ProfileStatus.ERROR, stderrLines);
		}
	});
}

function restore(profile, baseMountPath, onProfileStatusChanged){
	this.spawn_async_with_pipes(['ls','-la','.'], this.onCmdFinished);
}

function addConfig(EXTERNAL_TERMINAL, RC_ADDCONFIG, onProfileStatusChanged){
	launch_term_cmd(EXTERNAL_TERMINAL, RC_ADDCONFIG, false, false);
	onProfileStatusChanged && onProfileStatusChanged("", ProfileStatus.CREATED);
}

function deleteConfig(RC_DELETE, profile, baseMountPath, onProfileStatusChanged){

	switch (getStatus(profile)) {
		case ProfileStatus.MOUNTED:
			umount(profile, baseMountPath, function(status, stdoutLines, stderrLines){
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

function launch_term_cmd(EXTERNAL_TERMINAL, cmd, autoclose, sudo){
	try{
		let autoclosecmd = autoclose ? '; echo "Press any key to exit"; read' : '';
		let sudocmd = sudo ? 'sudo' : '';
		cmd = EXTERNAL_TERMINAL + " {0} bash -c '{1} {2}'"
			.replace('{0}', sudocmd)
			.replace('{1}',cmd)
			.replace('{2}',autoclosecmd);
		log(cmd);
		GLib.spawn_command_line_async(cmd);
	}catch(e){
		logError(e);
	}

}