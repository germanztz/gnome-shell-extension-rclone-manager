/* eslint-disable no-var */
/* That property was defined with 'let' or 'const' inside the module. This was previously supported, but is not correct according to the ES6 standard. Any symbols to be exported from a module must be defined with 'var'. */
/* eslint-disable no-unused-vars */
/* eslint-disable no-undef */
/**
 * https://wiki.gnome.org/Projects/Vala/GIOSamples
 */
import GLib from 'gi://GLib'
import Gio from 'gi://Gio'

export const PrefsFields = {
  PREFKEY_RCONFIG_FILE_PATH: 'prefkey001-rconfig-file-path',
  PREFKEY_RCONFIG_PASSWORD: 'prefkey0011-rconfig-password',
  PREFKEY_BASE_MOUNT_PATH: 'prefkey002-base-mount-path',
  PREFKEY_IGNORE_PATTERNS: 'prefkey003-ignore-patterns',
  PREFKEY_EXTERNAL_TERMINAL: 'prefkey004-external-terminal',
  PREFKEY_EXTERNAL_FILE_BROWSER: 'prefkey005-external-file-browser',
  PREFKEY_AUTOSYNC: 'prefkey006-autosync',
  PREFKEY_RC_LIST_REMOTES: 'prefkey0061-list-remotes',
  PREFKEY_RC_CREATE_DIR: 'prefkey007-rclone-copy',
  PREFKEY_RC_DELETE_DIR: 'prefkey008-rclone-purge',
  PREFKEY_RC_DELETE_FILE: 'prefkey009-rclone-delete',
  PREFKEY_RC_MOUNT: 'prefkey010-rclone-mount',
  PREFKEY_RC_SYNC: 'prefkey011-rclone-sync',
  PREFKEY_RC_CHECK: 'prefkey0111-rclone-check',
  PREFKEY_RC_COPYTO: 'prefkey0112-rclone-copyto',
  PREFKEY_RC_ADD_CONFIG: 'prefkey0113-rclone-config',
  PREFKEY_RC_DELETE_CONFIG: 'prefkey0114-rclone-delete',
  PREFKEY_RC_RECONNECT: 'prefkey0115-rclone-reconnect',
  HIDDENKEY_PROFILE_REGISTRY: 'hiddenkey012-profile-registry',
  PREFKEY_DEBUG_MODE: 'prefkey013-debug-mode',
  PREFKEY_CHECK_INTERVAL: 'prefkey0051-check-interval'
}


export const ProfileStatus = {
  CREATED: 'CREATED',
  DELETED: 'DELETED',
  DISCONNECTED: 'DISCONNECTED',
  MOUNTED: 'MOUNTED',
  WATCHED: 'WATCHED',
  BUSSY: 'BUSSY',
  ERROR: 'ERROR'
}

const MONITOR_EVENTS = ['CHANGED', 'CHANGES_DONE_HINT', 'DELETED', 'CREATED', 'ATTRIBUTE_CHANGED', 'PRE_UNMOUNT', 'UNMOUNTED', 'MOVED', 'RENAMED', 'MOVED_IN', 'MOVED_OUT']

export class FileMonitorHelper {

  constructor() {

    this.PREF_RCONFIG_FILE_PATH = ''
    this.PREF_RCONFIG_PASSWORD = ''
    this.PREF_BASE_MOUNT_PATH = ''
    this.PREF_IGNORE_PATTERNS = ''
    this.PREF_EXTERNAL_TERMINAL = ''
    this.PREF_EXTERNAL_FILE_BROWSER = ''
    this.PREF_RC_CREATE_DIR = ''
    this.PREF_RC_DELETE_DIR = ''
    this.PREF_RC_DELETE_FILE = ''
    this.PREF_RC_MOUNT = ''
    this.PREF_RC_SYNC = ''
    this.PREF_RC_CHECK = ''
    this.PREF_DBG = ''
    this.PREF_CHECK_INTERVAL = ''
    this.PREF_RC_LIST_REMOTES = ''
    this.PREF_RC_COPYTO = ''
    this.PREF_RC_ADD_CONFIG = ''
    this.PREF_RC_DELETE_CONFIG = ''
    this.PREF_RC_RECONNECT = ''

    this.RC_VERSION = 'rclone version'
    this.RC_UMOUNT = 'umount %source'
    this.RC_GETMOUNTS = 'mount'
    this.RC_COPY = 'cp %source %destination'

    this._monitors = {}
    this._configMonitor = null
    this._textDecoder = new TextDecoder()

  }

  loadSettings(settings) {
    this.PREF_DBG = settings.get_boolean(PrefsFields.PREFKEY_DEBUG_MODE)
    this.PREF_DBG && log('fmh.loadSettings')
    this.PREF_RCONFIG_FILE_PATH = settings.get_string(PrefsFields.PREFKEY_RCONFIG_FILE_PATH)
    this.PREF_RCONFIG_PASSWORD = settings.get_string(PrefsFields.PREFKEY_RCONFIG_PASSWORD)
    this.PREF_BASE_MOUNT_PATH = settings.get_string(PrefsFields.PREFKEY_BASE_MOUNT_PATH)
    this.PREF_IGNORE_PATTERNS = settings.get_string(PrefsFields.PREFKEY_IGNORE_PATTERNS)
    this.PREF_EXTERNAL_TERMINAL = settings.get_string(PrefsFields.PREFKEY_EXTERNAL_TERMINAL)
    this.PREF_EXTERNAL_FILE_BROWSER = settings.get_string(PrefsFields.PREFKEY_EXTERNAL_FILE_BROWSER)
    this.PREF_RC_LIST_REMOTES = settings.get_string(PrefsFields.PREFKEY_RC_LIST_REMOTES)
    this.PREF_RC_CREATE_DIR = settings.get_string(PrefsFields.PREFKEY_RC_CREATE_DIR)
    this.PREF_RC_DELETE_DIR = settings.get_string(PrefsFields.PREFKEY_RC_DELETE_DIR)
    this.PREF_RC_DELETE_FILE = settings.get_string(PrefsFields.PREFKEY_RC_DELETE_FILE)
    this.PREF_RC_MOUNT = settings.get_string(PrefsFields.PREFKEY_RC_MOUNT)
    this.PREF_RC_SYNC = settings.get_string(PrefsFields.PREFKEY_RC_SYNC)
    this.PREF_RC_CHECK = settings.get_string(PrefsFields.PREFKEY_RC_CHECK)
    this.PREF_RC_COPYTO = settings.get_string(PrefsFields.PREFKEY_RC_COPYTO)
    this.PREF_RC_ADD_CONFIG = settings.get_string(PrefsFields.PREFKEY_RC_ADD_CONFIG)
    this.PREF_RC_DELETE_CONFIG = settings.get_string(PrefsFields.PREFKEY_RC_DELETE_CONFIG)
    this.PREF_RC_RECONNECT = settings.get_string(PrefsFields.PREFKEY_RC_RECONNECT)

    this.PREF_BASE_MOUNT_PATH = this.PREF_BASE_MOUNT_PATH.replace('~', GLib.get_home_dir())
    if (!this.PREF_BASE_MOUNT_PATH.endsWith('/')) this.PREF_BASE_MOUNT_PATH = this.PREF_BASE_MOUNT_PATH + '/'

    this.PREF_RCONFIG_FILE_PATH = this.PREF_RCONFIG_FILE_PATH.replace('~', GLib.get_home_dir())

  }

  getRcVersion() {
    try {
      const [exitStatus, stdout] = this.spawnSync(this.RC_VERSION.split(' '))
      this.PREF_DBG && log('fmh.rclone version', stdout, 'exitStatus', exitStatus)
      return exitStatus === 0 ? stdout : undefined
        
    } catch (e) {
      return undefined      
    }
  }

  /**
   * Returns the RCLONE configurations as properties
   * @returns {Object} An Object with the names of the RCLONE configurations as properties
   */
  listremotes() {
    let cmd = this.PREF_RC_LIST_REMOTES.split(' ')
    for (let i = 0; i < cmd.length; i++) {
      cmd[i] = cmd[i]
        .replace('%pcmd', `echo ${this.PREF_RCONFIG_PASSWORD}`)
    }
    let ret = {}
    const [exitStatus, stdout, errout] = this.spawnSync(cmd)
    ret = stdout
      // eslint-disable-next-line prefer-regex-literals
      .replace(new RegExp(':', 'g'), '')
      .split('\n')
      .filter(item => item.length > 1)
      // convert array of string to object of property objects
      .reduce((a, v) => ({ ...a, [v]: {} }), {})
    this.PREF_DBG && log('fmh.listremotes', JSON.stringify(ret))
    return ret
  }

  /**
   * Initiates the monitor for an RCLONE profile
   * @param {string} profile Name
   * @param {function} onProfileStatusChanged callback function
   */
  initFilemonitor(profile, onProfileStatusChanged) {
    let success = true
    if (!Object.prototype.hasOwnProperty.call(this._monitors, profile)) {
      this._monitors[profile] = {}
      this._monitors[profile].ignores = this.PREF_IGNORE_PATTERNS.split(',')
      this._monitors[profile].paths = {}
      this._monitors[profile].basepath = this.PREF_BASE_MOUNT_PATH + profile
      this.PREF_DBG && log('fmh.initFilemonitor', profile, this._monitors[profile].basepath)
      success = this.addMonitorRecursive(profile, this._monitors[profile].basepath, this._monitors[profile].basepath, onProfileStatusChanged)
    }
    if (success) {
      onProfileStatusChanged && onProfileStatusChanged(profile, ProfileStatus.WATCHED, 'Filemonitor has been started')
    } else {
      onProfileStatusChanged && onProfileStatusChanged(profile, ProfileStatus.ERROR, 'Error starting filemonitor')
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
  addMonitorRecursive(profile, path, profileMountPath, onProfileStatusChanged) {
    try {
      const that = this;
      const directory = Gio.file_new_for_path(path)
      const monitor = directory.monitor_directory(Gio.FileMonitorFlags.NONE, null)
      monitor.connect('changed', function (monitor, file, otherFile, eventType) { that.onEvent(profile, monitor, file, otherFile, eventType, profileMountPath, onProfileStatusChanged) })

      this._monitors[profile].paths[directory.get_path()] = monitor
      this.PREF_DBG && log('fmh.addMonitorRecursive', profile, directory.get_path())
      const filter = 'standard::name,standard::type'
      const subfolders = directory.enumerate_children(filter, Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS, null)
      let fileInfo
      while ((fileInfo = subfolders.next_file(null)) != null) {
        if (fileInfo.get_file_type() === Gio.FileType.DIRECTORY) {
          this.addMonitorRecursive(profile, path + '/' + fileInfo.get_name(), profileMountPath, onProfileStatusChanged)
        }
      }
      return true
    } catch (e) {
      logError(e, e.message)
      return false
    }
  }

  /**
   * Callback function called when some file changes
   * @param {string} profile Name
   * @param {Gio.FileMonitor} monitor which triggered the Event
   * @param {Gio.File} file Changed
   * @param {Gio.File} otherFile
   * @param {Gio.FileMonitorEvent} eventType type of event
   */
  onEvent(profile, monitor, file, otherFile, eventType, profileMountPath, onProfileStatusChanged) {
    const that = this;
    for (const idx in this._monitors[profile].ignores) {
      if (file.get_path().search(this._monitors[profile].ignores[idx], 0) > 0) {
        log('fmh.onEvent DEBUG', profile, file.get_path(), 'contains', this._monitors[profile].ignores[idx], 'IGNORED')
        return
      }
    }

    log('fmh.onEvent INFO', profile, file.get_path())

    if (Object.prototype.hasOwnProperty.call(this._monitors[profile], 'is_synching')) {
      return
    }

    this.PREF_DBG && log('fmh.onEvent', profile, file.get_basename(), MONITOR_EVENTS[eventType])
    let destinationFilePath = file.get_path().replace(profileMountPath, '')
    const callbackFn = function (status, stdoutLines, stderrLines) {
      that.onCmdFinished(status, stdoutLines, stderrLines, profile, file, onProfileStatusChanged)
    }

    switch (eventType) {
      case Gio.FileMonitorEvent.CHANGES_DONE_HINT:
        if (GLib.file_test(file.get_path(), GLib.FileTest.EXISTS)) {
          destinationFilePath = destinationFilePath.replace(file.get_basename(), '')
          if (this.isDir(file)) {
            this.addMonitorRecursive(profile, file.get_path(), profileMountPath, onProfileStatusChanged)
            destinationFilePath = destinationFilePath + file.get_basename()
          }
          onProfileStatusChanged && onProfileStatusChanged(profile, ProfileStatus.BUSSY)
          this.spawnAsyncCmd(this.PREF_RC_CREATE_DIR, profile, file.get_path(), destinationFilePath, callbackFn)
        } else {
          log('fmh.onEvent WARN', profile, file.get_basename(), 'file Doesn t exists on event')
        }
        break
      case Gio.FileMonitorEvent.DELETED:
        onProfileStatusChanged && onProfileStatusChanged(profile, ProfileStatus.BUSSY)
        if (this.isDir(file)) {
          this.deleteFileMonitor(profile, file.get_path())
          this.spawnAsyncCmd(this.PREF_RC_DELETE_DIR, profile, '', destinationFilePath, callbackFn)
        } else {
          this.spawnAsyncCmd(this.PREF_RC_DELETE_FILE, profile, '', destinationFilePath, callbackFn)
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
  isDir(file) {
    let isdir = false
    if (GLib.file_test(file.get_path(), GLib.FileTest.EXISTS)) {
      isdir = GLib.file_test(file.get_path(), GLib.FileTest.IS_DIR)
    } else {
      Object.entries(this._monitors).forEach(entry => {
        if (!isdir) isdir = !(this.getFileMonitor(entry[0], file.get_path()) === undefined)
      })
    }
    this.PREF_DBG && log('fmh.isDir', file.get_path(), JSON.stringify(isdir))
    return isdir
  }

  /**
   * Removes a filemonitor of a RCLONE profile
   * @param {string} profile name
   * @param {function} onProfileStatusChanged callback function
   */
  removeFilemonitor(profile, onProfileStatusChanged) {
    if (this.getStatus(profile) === ProfileStatus.WATCHED) {
      Object.entries(this._monitors[profile].paths).forEach(entry => {
        this.deleteFileMonitor(profile, entry[0])
      })
      delete this._monitors[profile]
      this.PREF_DBG && log('fmh.removeFilemonitor', profile)
      onProfileStatusChanged && onProfileStatusChanged(profile, ProfileStatus.DISCONNECTED, 'Filemonitor has been stopped')
    }
  }

  /**
   * Removes a filemonitor of a path
   * @param {string} profile name
   * @param {Gio.File} path folder to unwatch
   */
  deleteFileMonitor(profile, path) {
    this.getFileMonitor(profile, path).cancel()
    delete this._monitors[profile].paths[path]
  }

  /**
   * Returns the filemonitor for a path
   * @param {string} profile name
   * @param {Gio.File} path folder of the monitor
   * @returns {Gio.FileMonitor} the filemonitor
   */
  getFileMonitor(profile, path) {
    const fm = this._monitors[profile].paths[path]
    this.PREF_DBG && log('fmh.getFileMonitor', profile, path, 'FileMonitor:', fm)
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
   * @param {function} onProfileStatusChanged callback function
   */
  onCmdFinished(status, stdoutLines, stderrLines, profile, file, onProfileStatusChanged) {
    this.PREF_DBG && log('fmh.onCmdFinished', profile, file && file.get_path(), status)
    if (status === 0) {
      onProfileStatusChanged && onProfileStatusChanged(profile, ProfileStatus.WATCHED, file.get_path() + ' updated')
      this.PREF_DBG && log('stdoutLines', file.get_path() + ' updated', stdoutLines.join('\n'))
    } else {
      onProfileStatusChanged && onProfileStatusChanged(profile, ProfileStatus.ERROR, stderrLines.join('\n'))
      this.PREF_DBG && log('stderrLines', stderrLines.join('\n'))
    }
  }

  /**
   * Watches de RCLONE config file in order to update de menu items
   * https://gjs.guide/guides/gio/file-operations.html#monitoring-files-and-directories
   *
   * @param {function} callback
   * @returns
   */
  monitorConfigFile(callback) {
    if (!GLib.file_test(this.PREF_RCONFIG_FILE_PATH, GLib.FileTest.EXISTS)) {
      return
    }
    this.PREF_DBG && log('fmh.monitorConfigFile')
    const file = Gio.file_new_for_path(this.PREF_RCONFIG_FILE_PATH)
    this._configMonitor = file.monitor(Gio.FileMonitorFlags.WATCH_MOVES, null)
    this._configMonitor.connect('changed', function (file, otherFile, eventType) { callback && callback(eventType) })
  }

  /**
   * Mounts a RCLONE profile
   * @param {string} profile name
   * @param {CallableFunction} onProfileStatusChanged callback function
   */
  mountProfile(profile, onProfileStatusChanged) {
    const that = this
    this.PREF_DBG && log('fmh.mountProfile', profile)
    const directory = Gio.file_new_for_path(this.PREF_BASE_MOUNT_PATH + profile)
    try {
      if (!this.isDir(directory)) { directory.make_directory_with_parents(null, null) }
    } catch { }
    onProfileStatusChanged && onProfileStatusChanged(profile, ProfileStatus.BUSSY)
    this.spawnAsyncCmd(this.PREF_RC_MOUNT, profile, this.PREF_BASE_MOUNT_PATH + profile, null,
      function (status, stdoutLines, stderrLines) {
        if (status === 0) {
          onProfileStatusChanged && onProfileStatusChanged(profile, ProfileStatus.MOUNTED, 'Mounted successfully')
        } else {
          onProfileStatusChanged && onProfileStatusChanged(profile, ProfileStatus.ERROR, stderrLines.join('\n'))
        }
      })
  }

  /**
   * Returns if a profile has base directori created
   * @param {string} profile name
   * @returns {boolean} true if base directori exists
   */
  profileHasDir(profile) {
    return this.isDir(Gio.file_new_for_path(this.PREF_BASE_MOUNT_PATH + profile))
  }

  /**
   * UMounts a RCLONE profile
   * @param {string} profile name
   * @param {CallableFunction} onProfileStatusChanged callback function
   */
  umount(profile, onProfileStatusChanged) {
    const that = this
    onProfileStatusChanged && onProfileStatusChanged(profile, ProfileStatus.BUSSY)
    this.spawnAsyncCmd(this.RC_UMOUNT, profile, this.PREF_BASE_MOUNT_PATH + profile, null,
      function (status, stdoutLines, stderrLines) {
        if (status === 0) {
          onProfileStatusChanged && onProfileStatusChanged(profile, ProfileStatus.DISCONNECTED, 'Umounted successfully')
        } else {
          onProfileStatusChanged && onProfileStatusChanged(profile, ProfileStatus.ERROR, stderrLines.join('\n'))
        }
      })
  }

  /**
   * Returns de RCLONE mounted drivers
   * @returns {Object} the names of the RCLONE mounted drivers as properties
   */
  getMounts() {
    const [stat, stdout, stderr] = this.spawnSync(this.RC_GETMOUNTS.split(' '))
    const mounts = []
    if (stdout) {
      stdout.split('\n')
        .filter(line => line.search('rclone') > 0)
        .forEach(line => mounts.push(line.split(':')[0]))
    }
    const retmounts = mounts.reduce((a, v) => ({ ...a, [v]: {} }), {})
    this.PREF_DBG && log('fmh.getMounts', JSON.stringify(retmounts))
    return retmounts
  }

  /**
   * Returns the status of a profile
   * @param {string} profile name
   * @returns {ProfileStatus} the status of the profile
   */
  getStatus(profile) {
    let ret = ProfileStatus.DISCONNECTED
    if (Object.prototype.hasOwnProperty.call(this._monitors, profile)) ret = ProfileStatus.WATCHED
    else if (Object.prototype.hasOwnProperty.call(this.getMounts(), profile)) ret = ProfileStatus.MOUNTED
    this.PREF_DBG && log('fmh.getStatus', profile, ret)
    return ret
  }

  /**
   * Launch a console terminal with RCLONE in order to reconnect the profile
   * @param {string} profile name
   */
  reconnect(profile) {
    this.launchTermCmd(this.PREF_RC_RECONNECT.replace('%profile', profile))
  }

  disengage(profile, onProfileStatusChanged) {
    const profileStatus = this.getStatus(profile)
    if (profileStatus === ProfileStatus.MOUNTED) {
      this.umount(profile, onProfileStatusChanged)
    } else if (profileStatus === ProfileStatus.WATCHED) {
      this.removeFilemonitor(profile, onProfileStatusChanged)
    } else {
      onProfileStatusChanged && onProfileStatusChanged(profile, ProfileStatus.DISCONNECTED)
    }
  }

  /**
   * Launch an RCLONE sincronization with the remote repository
   * @param {string} profile name
   * @param {function} onProfileStatusChanged callback function
   */
  sync(profile, onProfileStatusChanged) {
    const that = this
    if (this.getStatus(profile) === ProfileStatus.MOUNTED) {
      onProfileStatusChanged && onProfileStatusChanged(profile, ProfileStatus.ERROR, 'Mounted Profiles are already in sync')
      return
    }

    this.PREF_DBG && log('fmh.sync', profile)
    onProfileStatusChanged && onProfileStatusChanged(profile, ProfileStatus.BUSSY)

    if (Object.prototype.hasOwnProperty.call(this._monitors, profile)) {
      this._monitors[profile].is_synching = true
    }

    this.spawnAsyncCmd(this.PREF_RC_SYNC, profile, this.PREF_BASE_MOUNT_PATH + profile, null,
      function (status, stdoutLines, stderrLines) {
        if (Object.prototype.hasOwnProperty.call(that._monitors, profile)) {
          delete (that._monitors[profile].is_synching)
        }

        if (status === 0) {
          onProfileStatusChanged && onProfileStatusChanged(profile, that.getStatus(profile), 'Synchronization finished successfully')
        } else {
          onProfileStatusChanged && onProfileStatusChanged(profile, ProfileStatus.ERROR, stderrLines.join('\n'))
        }
      })
  }

  checkNsync(profile, onProfileStatusChanged) {
    const that = this;
    this.PREF_DBG && log('fmh.checkNsync', profile)

    if (!Object.prototype.hasOwnProperty.call(this._monitors, profile) ||
      Object.prototype.hasOwnProperty.call(this._monitors[profile], 'is_checking') ||
      Object.prototype.hasOwnProperty.call(this._monitors[profile], 'is_synching')) {
      log(`fmh.checkNsync WARN ${profile} is already checking or synching, exiting`)
      return
    } else {
      this._monitors[profile].is_checking = true
    }
    this.spawnAsyncCmd(this.PREF_RC_CHECK, profile, null, this.PREF_BASE_MOUNT_PATH + profile,
      function (status, stdoutLines, stderrLines) {
        if (Object.prototype.hasOwnProperty.call(that._monitors, profile)) {
          delete (that._monitors[profile].is_checking)
        }
        that.PREF_DBG && log(`check status: ${status}`)

        if (status === 256) {
          that.sync(profile, onProfileStatusChanged)
        }
      })
  }

  /**
   * Launch a file browser on the profile location
   * @param {string} profile name
   */
  open(profile) {
    const cmd = this.PREF_EXTERNAL_FILE_BROWSER.split(' ')
    cmd.push(this.PREF_BASE_MOUNT_PATH + profile)
    this.spawnAsyncWithPipes(cmd)
  }

  /**
   * Launch a console terminal with RCLONE in order to add a new profile
   * @param {string} profile name
   */
  addConfig(onProfileStatusChanged) {
    this.launchTermCmd(this.PREF_RC_ADD_CONFIG, false, false)
    onProfileStatusChanged && onProfileStatusChanged('', ProfileStatus.CREATED)
  }

  deleteConfig(profile, onProfileStatusChanged) {
    if (this.getStatus(profile) === ProfileStatus.MOUNTED || this.getStatus(profile) === ProfileStatus.WATCHED) {
      onProfileStatusChanged && onProfileStatusChanged(profile, ProfileStatus.ERROR, 'Cannot be deleted because is still mounted or watched')
    } else {

      try {
        const [stat, stdout, stderr] = this.spawnSync(this.PREF_RC_DELETE_CONFIG.replace('%profile', profile).split(' '))
        onProfileStatusChanged && onProfileStatusChanged(profile, ProfileStatus.DELETED, 'Successfully deleted')
      } catch (err) {
        onProfileStatusChanged && onProfileStatusChanged(profile, ProfileStatus.ERROR, err.message.join('\n'))
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
  spawnAsyncCmd(cmd, profile, file, destination, callback) {
    const cmdArray = cmd.split(' ')
    this.PREF_DBG && log('fmh.spawnAsyncCmd', profile, cmd)
    for (let i = 0; i < cmdArray.length; i++) {
      cmdArray[i] = cmdArray[i]
        .replace('%profile', profile)
        .replace('%source', file)
        .replace('%destination', destination)
        .replace('%pcmd', `echo ${this.PREF_RCONFIG_PASSWORD}`)
    }
    this.spawnAsyncWithPipes(cmdArray, callback)
  }

  // A simple asynchronous read loop
  readOutput(stream, lineBuffer) {
    stream.read_line_async(0, null, (stream, res) => {
      try {
        const line = stream.read_line_finish_utf8(res)[0]

        if (line !== null) {
          lineBuffer.push(line)
          this.readOutput(stream, lineBuffer)
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
  spawnAsyncWithPipes(argv, callback) {
    try {
      this.PREF_DBG && log('fmh.spawnAsyncWithPipes', argv.join(' '))
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

      // Any unused streams still have to be closed explicitly, otherwise the
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
          this.PREF_DBG && log(stdoutLines.join('\n'))
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

  spawnSync(argv) {
    this.PREF_DBG && log(`fmh.spawnSync, ${argv.join(' ')}`)
    let [ok, stdout, stderr, exitStatus] = GLib.spawn_sync(
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

    if (stderr instanceof Uint8Array) stderr = this._textDecoder.decode(stderr)
    if (stdout instanceof Uint8Array) stdout = this._textDecoder.decode(stdout)
    this.PREF_DBG && log(`fmh.spawnSync, status=${exitStatus}, stderr=${stderr}, stdout=${stdout}`)
    if (exitStatus !== 0) throw new Error(stderr);
    return [exitStatus, stdout, stderr]
  }

  launchTermCmd(cmd, autoclose, sudo) {
    try {
      const autoclosecmd = autoclose ? '; echo "Press any key to exit"; read' : ''
      const sudocmd = sudo ? 'sudo' : ''
      cmd = `${this.PREF_EXTERNAL_TERMINAL} ${sudocmd} bash -c '${cmd} ${autoclosecmd}'`
        .replace('%pcmd', `"echo ${this.PREF_RCONFIG_PASSWORD}"`)

      this.PREF_DBG && log('fmh.launchTermCmd', cmd)
      GLib.spawn_command_line_async(cmd)
    } catch (e) {
      logError(e)
    }
  }

  fileToString(filePath, callbackFunction) {
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
                  callbackFunction(this._textDecoder.decode(contents))
                } else {
                  callbackFunction('File contents are no Uint8Array')
                }
              } catch (e) {
                logError(e)
              }
            } else {
              this.PREF_DBG && log('fmh.fileToString', 'load_contents_async failed')
            }
          })
        })
    } else {
      this.PREF_DBG && log(filePath + ' dont EXISTS')
    }
  }
}