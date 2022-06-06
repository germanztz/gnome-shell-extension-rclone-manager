/* eslint-disable no-var */
/* That property was defined with 'let' or 'const' inside the module. This was previously supported, but is not correct according to the ES6 standard. Any symbols to be exported from a module must be defined with 'var'. */
/* eslint-disable no-unused-vars */
/* eslint-disable no-undef */
/**
 * https://wiki.gnome.org/Projects/Vala/GIOSamples
 */

const byteArray = imports.byteArray
const GLib = imports.gi.GLib
const Gio = imports.gi.Gio

var PrefsFields = {
  PREFKEY_RCONFIG_FILE_PATH: 'prefkey001-rconfig-file-path',
  PREFKEY_BASE_MOUNT_PATH: 'prefkey002-base-mount-path',
  PREFKEY_IGNORE_PATTERNS: 'prefkey003-ignore-patterns',
  PREFKEY_EXTERNAL_TERMINAL: 'prefkey004-external-terminal',
  PREFKEY_EXTERNAL_FILE_BROWSER: 'prefkey005-external-file-browser',
  PREFKEY_AUTOSYNC: 'prefkey006-autosync',
  PREFKEY_RC_CREATE_DIR: 'prefkey007-rclone-copy',
  PREFKEY_RC_DELETE_DIR: 'prefkey008-rclone-purge',
  PREFKEY_RC_DELETE_FILE: 'prefkey009-rclone-delete',
  PREFKEY_RC_MOUNT: 'prefkey010-rclone-mount',
  PREFKEY_RC_SYNC: 'prefkey011-rclone-sync',
  HIDDENKEY_PROFILE_REGISTRY: 'hiddenkey012-profile-registry',
  PREFKEY_DEBUG_MODE: 'prefkey013-debug-mode'
}

var PREFS_SCHEMA_NAME = 'org.gnome.shell.extensions.rclone-manager'

var PREF_RCONFIG_FILE_PATH
var PREF_BASE_MOUNT_PATH
var PREF_IGNORE_PATTERNS
var PREF_EXTERNAL_TERMINAL
var PREF_EXTERNAL_FILE_BROWSER
var PREF_RC_CREATE_DIR
var PREF_RC_DELETE_DIR
var PREF_RC_DELETE_FILE
var PREF_RC_MOUNT
var PREF_RC_SYNC
var PREF_DBG

var RC_LIST_REMOTES = 'rclone listremotes'
var RC_COPYTO = 'rclone copyto %profile:%source %destination'
var RC_ADDCONFIG = 'rclone config'
var RC_DELETE_CONFIG = 'rclone config delete %profile'
var RC_RECONNECT = 'rclone config reconnect %profile:'
var RC_UMOUNT = 'umount %source'
var RC_GETMOUNTS = 'mount'
var RC_VERSION = 'rclone version'
var RC_COPY = 'cp %source %destination'

var _monitors = {}
var _configMonitor

var ProfileStatus = {
  CREATED: 'CREATED',
  DELETED: 'DELETED',
  DISCONNECTED: 'DISCONNECTED',
  MOUNTED: 'MOUNTED',
  WATCHED: 'WATCHED',
  BUSSY: 'BUSSY',
  ERROR: 'ERROR'
}

const MONITOR_EVENTS = ['CHANGED', 'CHANGES_DONE_HINT', 'DELETED', 'CREATED', 'ATTRIBUTE_CHANGED', 'PRE_UNMOUNT', 'UNMOUNTED', 'MOVED', 'RENAMED', 'MOVED_IN', 'MOVED_OUT']

function getRcVersion () {
  const [exitStatus, stdout] = spawnSync(RC_VERSION.split(' '))
  PREF_DBG && log('fmh.rclone version', stdout, 'exitStatus', exitStatus)
  return exitStatus === 0 ? stdout : undefined
}

/**
 * Returns the RCLONE configurations as properties
 * @returns {Object} An Object with the names of the RCLONE configurations as properties
 */
function listremotes () {
  const [exitStatus, stdout] = spawnSync(RC_LIST_REMOTES.split(' '))
  if (exitStatus !== 0) return {}
  const ret = stdout
    // eslint-disable-next-line prefer-regex-literals
    .replace(new RegExp(':', 'g'), '')
    .split('\n')
    .filter(item => item.length > 1)
  // convert array of string to object of property objects
    .reduce((a, v) => ({ ...a, [v]: {} }), {})
  PREF_DBG && log('fmh.listremotes', JSON.stringify(ret))
  return ret
}

/**
 * Initiates the monitor for an RCLONE profile
 * @param {string} profile Name
 * @param {fuction} onProfileStatusChanged callback function
 */
function initFilemonitor (profile, onProfileStatusChanged) {
  let success = true
  if (!Object.prototype.hasOwnProperty.call(_monitors, profile)) {
    _monitors[profile] = {}
    _monitors[profile].ignores = PREF_IGNORE_PATTERNS.split(',')
    _monitors[profile].paths = {}
    _monitors[profile].basepath = PREF_BASE_MOUNT_PATH + profile
    PREF_DBG && log('fmh.initFilemonitor', profile, _monitors[profile].basepath)
    success = addMonitorRecursive(profile, _monitors[profile].basepath, _monitors[profile].basepath, onProfileStatusChanged)
  }
  if (success) {
    onProfileStatusChanged && onProfileStatusChanged(profile, this.ProfileStatus.WATCHED, 'Filemonitor has been started')
  } else {
    onProfileStatusChanged && onProfileStatusChanged(profile, this.ProfileStatus.ERROR, 'Error starting filemonitor')
  }
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
function addMonitorRecursive (profile, path, profileMountPath, onProfileStatusChanged) {
  try {
    const directory = Gio.file_new_for_path(path)
    const monitor = directory.monitor_directory(Gio.FileMonitorFlags.NONE, null)
    monitor.connect('changed', function (monitor, file, otherFile, eventType) { onEvent(profile, monitor, file, otherFile, eventType, profileMountPath, onProfileStatusChanged) })

    _monitors[profile].paths[directory.get_path()] = monitor
    PREF_DBG && log('fmh.addMonitorRecursive', profile, directory.get_path())
    const filter = 'standard::name,standard::type'
    const subfolders = directory.enumerate_children(filter, Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS, null)
    let fileInfo
    while ((fileInfo = subfolders.next_file(null)) != null) {
      if (fileInfo.get_file_type() === Gio.FileType.DIRECTORY) {
        addMonitorRecursive(profile, path + '/' + fileInfo.get_name(), profileMountPath, onProfileStatusChanged)
      }
    }
    return true
  } catch (e) {
    logError(e, e.message)
    return false
  }
}

/**
 * Calback function called when some file changes
 * @param {string} profile Name
 * @param {Gio.FileMonitor} monitor which triggered the Event
 * @param {Gio.File} file Changed
 * @param {Gio.File} otherFile
 * @param {Gio.FileMonitorEvent} eventType type of event
 */
function onEvent (profile, monitor, file, otherFile, eventType, profileMountPath, onProfileStatusChanged) {
  for (const idx in _monitors[profile].ignores) {
    if (file.get_path().search(_monitors[profile].ignores[idx], 0) > 0) return
  }

  if (Object.prototype.hasOwnProperty.call(_monitors[profile], 'is_synching')) {
    return
  }

  PREF_DBG && log('fmh.onEvent', profile, file.get_basename(), MONITOR_EVENTS[eventType])
  let destinationFilePath = file.get_path().replace(profileMountPath, '')
  const callbackFn = function (status, stdoutLines, stderrLines) {
    onCmdFinished(status, stdoutLines, stderrLines, profile, file, onProfileStatusChanged)
  }

  switch (eventType) {
    case Gio.FileMonitorEvent.CHANGES_DONE_HINT:
      if (GLib.file_test(file.get_path(), GLib.FileTest.EXISTS)) {
        destinationFilePath = destinationFilePath.replace(file.get_basename(), '')
        if (isDir(file)) {
          addMonitorRecursive(profile, file.get_path(), profileMountPath, onProfileStatusChanged)
          destinationFilePath = destinationFilePath + file.get_basename()
        }
        onProfileStatusChanged && onProfileStatusChanged(profile, ProfileStatus.BUSSY)
        spawnAsyncCmd(PREF_RC_CREATE_DIR, profile, file.get_path(), destinationFilePath, callbackFn)
      } else {
        log('fmh.onEvent WARN', profile, file.get_basename(), 'file Doesn t exists on event')
      }
      break
    case Gio.FileMonitorEvent.DELETED:
      onProfileStatusChanged && onProfileStatusChanged(profile, ProfileStatus.BUSSY)
      if (isDir(file)) {
        deleteFileMonitor(profile, file.get_path())
        spawnAsyncCmd(PREF_RC_DELETE_DIR, profile, '', destinationFilePath, callbackFn)
      } else {
        spawnAsyncCmd(PREF_RC_DELETE_FILE, profile, '', destinationFilePath, callbackFn)
      }
      break
    case Gio.FileMonitorEvent.CHANGED:
    case Gio.FileMonitorEvent.ATTRIBUTE_CHANGED:
    case Gio.FileMonitorEvent.PRE_UNMOUNT:
    case Gio.FileMonitorEvent.UNMOUNTED:
    case Gio.FileMonitorEvent.MOVED:
    case Gio.FileMonitorEvent.MOVED_IN:
    case Gio.FileMonitorEvent.MOVED_OUT:
    default:
      break
  }
}

/**
 * Checks a File whether is a directory or not, it is has been deleted then checks if it is watched
 * @param {Gio.File} file to check
 * @returns {boolean}
 */
function isDir (file) {
  let isdir = false
  if (GLib.file_test(file.get_path(), GLib.FileTest.EXISTS)) {
    isdir = GLib.file_test(file.get_path(), GLib.FileTest.IS_DIR)
  } else {
    Object.entries(_monitors).forEach(entry => {
      if (!isdir) isdir = !(getFileMonitor(entry[0], file.get_path()) === undefined)
    })
  }
  PREF_DBG && log('fmh.isDir', file.get_path(), JSON.stringify(isdir))
  return isdir
}

/**
 * Removes a filemonitor of a RCLONE profile
 * @param {string} profile name
 * @param {fuction} onProfileStatusChanged callback function
 */
function removeFilemonitor (profile, onProfileStatusChanged) {
  if (getStatus(profile) === ProfileStatus.WATCHED) {
    Object.entries(_monitors[profile].paths).forEach(entry => {
      deleteFileMonitor(profile, entry[0])
    })
    delete _monitors[profile]
    PREF_DBG && log('fmh.removeFilemonitor', profile)
    onProfileStatusChanged && onProfileStatusChanged(profile, this.ProfileStatus.DISCONNECTED, 'Filemonitor has been stopped')
  }
}

/**
 * Removes a filemonitor of a path
 * @param {string} profile name
 * @param {Gio.File} path folder to unwatch
 */
function deleteFileMonitor (profile, path) {
  getFileMonitor(profile, path).cancel()
  delete _monitors[profile].paths[path]
}

/**
 * Returns the filemonitor for a path
 * @param {string} profile name
 * @param {Gio.File} path folder of the monitor
 * @returns {Gio.FileMonitor} the filemonitor
 */
function getFileMonitor (profile, path) {
  const fm = _monitors[profile].paths[path]
  PREF_DBG && log('fmh.getFileMonitor', profile, path, 'FileMonitor:', fm)
  return fm
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
function onCmdFinished (status, stdoutLines, stderrLines, profile, file, onProfileStatusChanged) {
  PREF_DBG && log('fmh.onCmdFinished', profile, file && file.get_path(), status)
  if (status === 0) {
    onProfileStatusChanged && onProfileStatusChanged(profile, this.ProfileStatus.WATCHED, file.get_path() + ' updated')
    PREF_DBG && log('stdoutLines', file.get_path() + ' updated', stdoutLines.join('\n'))
  } else {
    onProfileStatusChanged && onProfileStatusChanged(profile, this.ProfileStatus.ERROR, stderrLines.join('\n'))
    PREF_DBG && log('stderrLines', stderrLines.join('\n'))
  }
}

/**
 * Watches de RCLONE config file in order to update de menu items
 * https://gjs.guide/guides/gio/file-operations.html#monitoring-files-and-directories
 *
 * @param {function} callback
 * @returns
 */
function monitorConfigFile (callback) {
  if (!GLib.file_test(PREF_RCONFIG_FILE_PATH, GLib.FileTest.EXISTS)) {
    return
  }
  PREF_DBG && log('fmh.monitorConfigFile')
  const file = Gio.file_new_for_path(PREF_RCONFIG_FILE_PATH)
  _configMonitor = file.monitor(Gio.FileMonitorFlags.WATCH_MOVES, null)
  _configMonitor.connect('changed', function (file, otherFile, eventType) { callback && callback(eventType) })
}

/**
 * Mounts a RCLONE profile
 * @param {string} profile name
 * @param {CallableFunction} onProfileStatusChanged callback function
 */
function mountProfile (profile, onProfileStatusChanged) {
  const that = this
  PREF_DBG && log('fmh.mountProfile', profile)
  const directory = Gio.file_new_for_path(PREF_BASE_MOUNT_PATH + profile)
  try {
    if (!isDir(directory)) { directory.make_directory_with_parents(null, null) }
  } catch {}
  onProfileStatusChanged && onProfileStatusChanged(profile, ProfileStatus.BUSSY)
  spawnAsyncCmd(PREF_RC_MOUNT, profile, PREF_BASE_MOUNT_PATH + profile, null,
    function (status, stdoutLines, stderrLines) {
      if (status === 0) {
        onProfileStatusChanged && onProfileStatusChanged(profile, that.ProfileStatus.MOUNTED, 'Mounted successfully')
      } else {
        onProfileStatusChanged && onProfileStatusChanged(profile, that.ProfileStatus.ERROR, stderrLines.join('\n'))
      }
    })
}

/**
 * Returs if a profile has base directori created
 * @param {string} profile name
 * @returns {boolean} true if base directori exists
 */
function profileHasDir (profile) {
  return isDir(Gio.file_new_for_path(PREF_BASE_MOUNT_PATH + profile))
}

/**
 * UMounts a RCLONE profile
 * @param {string} profile name
 * @param {CallableFunction} onProfileStatusChanged callback function
 */
function umount (profile, onProfileStatusChanged) {
  const that = this
  onProfileStatusChanged && onProfileStatusChanged(profile, ProfileStatus.BUSSY)
  spawnAsyncCmd(RC_UMOUNT, profile, PREF_BASE_MOUNT_PATH + profile, null,
    function (status, stdoutLines, stderrLines) {
      if (status === 0) {
        onProfileStatusChanged && onProfileStatusChanged(profile, that.ProfileStatus.DISCONNECTED, 'Umounted successfully')
      } else {
        onProfileStatusChanged && onProfileStatusChanged(profile, that.ProfileStatus.ERROR, stderrLines.join('\n'))
      }
    })
}

/**
 * Returns de RCLONE mounted drivers
 * @returns {Object} the names of the RCLONE mounted drivers as properties
 */
function getMounts () {
  const [stat, stdout, stderr] = this.spawnSync(RC_GETMOUNTS.split(' '))
  const mounts = []
  if (stdout) {
    stdout.split('\n')
      .filter(line => line.search('rclone') > 0)
      .forEach(line => mounts.push(line.split(':')[0]))
  }
  const retmounts = mounts.reduce((a, v) => ({ ...a, [v]: {} }), {})
  PREF_DBG && log('fmh.getMounts', JSON.stringify(retmounts))
  return retmounts
}

/**
 * Returns the status of a profile
 * @param {string} profile name
 * @returns {ProfileStatus} the status of the profile
 */
function getStatus (profile) {
  let ret = ProfileStatus.DISCONNECTED
  if (Object.prototype.hasOwnProperty.call(_monitors, profile)) ret = ProfileStatus.WATCHED
  else if (Object.prototype.hasOwnProperty.call(getMounts(), profile)) ret = ProfileStatus.MOUNTED
  PREF_DBG && log('fmh.getStatus', profile, ret)
  return ret
}

/**
 * Launch a console terminal whith RCLONE in order to reconnect the profile
 * @param {string} profile name
 */
function reconnect (profile) {
  launchTermCmd(RC_RECONNECT.replace('%profile', profile))
}

function disengage (profile, onProfileStatusChanged) {
  const profileStatus = getStatus(profile)
  if (profileStatus === ProfileStatus.MOUNTED) {
    umount(profile, onProfileStatusChanged)
  } else if (profileStatus === ProfileStatus.WATCHED) {
    removeFilemonitor(profile, onProfileStatusChanged)
  } else {
    onProfileStatusChanged && onProfileStatusChanged(profile, ProfileStatus.DISCONNECTED)
  }
}

/**
 * Lauch an RCLONE sincronization whith the remote repository
 * @param {string} profile name
 * @param {function} onProfileStatusChanged callback function
 */
function sync (profile, onProfileStatusChanged) {
  if (getStatus(profile) === ProfileStatus.MOUNTED) {
    onProfileStatusChanged && onProfileStatusChanged(profile, ProfileStatus.ERROR, 'Mounted Profiles are already in sync')
    return
  }

  PREF_DBG && log('fmh.sync', profile)
  onProfileStatusChanged && onProfileStatusChanged(profile, ProfileStatus.BUSSY)

  if (Object.prototype.hasOwnProperty.call(_monitors, profile)) {
    _monitors[profile].is_synching = true
  }

  spawnAsyncCmd(PREF_RC_SYNC, profile, PREF_BASE_MOUNT_PATH + profile, null,
    function (status, stdoutLines, stderrLines) {
      if (Object.prototype.hasOwnProperty.call(_monitors, profile)) {
        delete (_monitors[profile].is_synching)
      }

      if (status === 0) {
        onProfileStatusChanged && onProfileStatusChanged(profile, getStatus(profile), 'Synchronization finished successfully')
      } else {
        onProfileStatusChanged && onProfileStatusChanged(profile, ProfileStatus.ERROR, stderrLines.join('\n'))
      }
    })
}

/**
 * Launch a file browser on the profile location
 * @param {string} profile name
 */
function open (profile) {
  const cmd = PREF_EXTERNAL_FILE_BROWSER.split(' ')
  cmd.push(PREF_BASE_MOUNT_PATH + profile)
  this.spawnAsyncWithPipes(cmd)
}

/**
 * Launch a console terminal whith RCLONE in order to add a new profile
 * @param {string} profile name
 */
function addConfig (onProfileStatusChanged) {
  launchTermCmd(RC_ADDCONFIG, false, false)
  onProfileStatusChanged && onProfileStatusChanged('', ProfileStatus.CREATED)
}

function deleteConfig (profile, onProfileStatusChanged) {
  if (getStatus(profile) === ProfileStatus.MOUNTED || getStatus(profile) === ProfileStatus.WATCHED) {
    onProfileStatusChanged && onProfileStatusChanged(profile, ProfileStatus.ERROR, 'Cannot be deleted because is still mounted or watched')
  } else {
    const [stat, stdout, stderr] = spawnSync(RC_DELETE_CONFIG.replace('%profile', profile).split(' '))
    if (stat === 0) {
      onProfileStatusChanged && onProfileStatusChanged(profile, ProfileStatus.DELETED, 'Successfully deleted')
    } else {
      onProfileStatusChanged && onProfileStatusChanged(profile, ProfileStatus.ERROR, stderr.join('\n'))
    }
  }
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
function spawnAsyncCmd (cmd, profile, file, destination, callback, flags) {
  const cmdArray = cmd.split(' ')
  PREF_DBG && log('fmh.spawnAsyncCmd', profile, cmd)
  for (let i = 0; i < cmdArray.length; i++) {
    cmdArray[i] = cmdArray[i]
      .replace('%profile', profile)
      .replace('%source', file)
      .replace('%destination', destination)
      .replace('%flags', flags)
  }
  spawnAsyncWithPipes(cmdArray, callback)
}

// A simple asynchronous read loop
function readOutput (stream, lineBuffer) {
  stream.read_line_async(0, null, (stream, res) => {
    try {
      const line = stream.read_line_finish_utf8(res)[0]

      if (line !== null) {
        lineBuffer.push(line)
        readOutput(stream, lineBuffer)
      }
    } catch (e) {
      logError(e)
    }
  })
}

/**
 * https://gjs.guide/guides/gio/subprocesses.html#asynchronous-communication
 * @param {Array} argv
 * @param {CallableFunction} callback
 */
function spawnAsyncWithPipes (argv, callback) {
  try {
    PREF_DBG && log('fmh.spawnAsyncWithPipes', argv.join(' '))
    const [, pid, stdin, stdout, stderr] = GLib.spawn_async_with_pipes(
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
    )

    // Any unsused streams still have to be closed explicitly, otherwise the
    // file descriptors may be left open
    GLib.close(stdin)

    // Okay, now let's get output stream for `stdout`
    const stdoutStream = new Gio.DataInputStream({
      base_stream: new Gio.UnixInputStream({
        fd: stdout,
        close_fd: true
      }),
      close_base_stream: true
    })

    // We'll read the output asynchronously to avoid blocking the main thread
    const stdoutLines = []
    this.readOutput(stdoutStream, stdoutLines)

    // We want the real error from `stderr`, so we'll have to do the same here
    const stderrStream = new Gio.DataInputStream({
      base_stream: new Gio.UnixInputStream({
        fd: stderr,
        close_fd: true
      }),
      close_base_stream: true
    })

    const stderrLines = []
    this.readOutput(stderrStream, stderrLines)

    // Watch for the process to finish, being sure to set a lower priority than
    // we set for the read loop, so we get all the output
    GLib.child_watch_add(GLib.PRIORITY_DEFAULT_IDLE, pid, (pid, status) => {
      if (status === 0) {
        PREF_DBG && log(stdoutLines.join('\n'))
      } else {
        log(`fmh.spawnAsyncWithPipes ERROR, ${argv.join(' ')} \n ${stderrLines.join('\n')}`)
      }

      // Ensure we close the remaining streams and process
      stdoutStream.close(null)
      stderrStream.close(null)
      GLib.spawn_close_pid(pid)

      callback && callback(status, stdoutLines, stderrLines)
    })
  } catch (e) {
    logError(e)
  }
}

function spawnSync (argv) {
  let out, err, status
  try {
    PREF_DBG && log(`fmh.spawnSync, ${argv.join(' ')}`)
    const [ok, stdout, stderr, exitStatus] = GLib.spawn_sync(
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
      null)

    if (stderr instanceof Uint8Array) err = byteArray.toString(stderr)
    if (stdout instanceof Uint8Array) out = byteArray.toString(stdout)
    PREF_DBG && log(`fmh.spawnSync, ok, ${ok}, status, ${exitStatus}, stderr, ${err}, stdout, ${out}`)

    return [exitStatus, out, err]
  } catch (e) {
    logError(e)
    return [1, e.message, e.message]
  }
}

function launchTermCmd (cmd, autoclose, sudo) {
  try {
    const autoclosecmd = autoclose ? '; echo "Press any key to exit"; read' : ''
    const sudocmd = sudo ? 'sudo' : ''
    cmd = PREF_EXTERNAL_TERMINAL + " {0} bash -c '{1} {2}'"
      .replace('{0}', sudocmd)
      .replace('{1}', cmd)
      .replace('{2}', autoclosecmd)
    PREF_DBG && log('fmh.launchTermCmd', cmd)
    GLib.spawn_command_line_async(cmd)
  } catch (e) {
    logError(e)
  }
}

function fileToString (filePath, callbackFunction) {
  if (typeof callbackFunction !== 'function') { throw TypeError('`callbackFunction` must be a function') }

  if (GLib.file_test(filePath, GLib.FileTest.EXISTS)) {
    const file = Gio.file_new_for_path(filePath)

    file.query_info_async('*', Gio.FileQueryInfoFlags.NONE,
      GLib.PRIORITY_DEFAULT, null, function () {
        file.load_contents_async(null, function (obj, res) {
          const [success, contents] = obj.load_contents_finish(res)

          if (success) {
            try {
              // are we running gnome 3.30 or higher?
              if (contents instanceof Uint8Array) {
                callbackFunction(imports.byteArray.toString(contents))
              } else {
                callbackFunction('File contents are no Uint8Array')
              }
            } catch (e) {
              logError(e)
            }
          } else {
            PREF_DBG && log('fmh.fileToString', 'load_contents_async failed')
          }
        })
      })
  } else {
    PREF_DBG && log(filePath + ' dont EXISTS')
  }
}
