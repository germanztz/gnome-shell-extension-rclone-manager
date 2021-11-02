#!/usr/bin/python3

import configparser
import os
import signal
import subprocess
import sys
import time
from pathlib import Path
from threading import Thread
import logging
from logging.handlers import RotatingFileHandler

def install_dependencies():
  term_cmd("apt install rclone gir1.2-appindicator3-0.1 python3-pip")
  subprocess.call("pip3 install notify inotify", shell=True)

  with open('/etc/fuse.conf') as myfile:
    filecontent = myfile.read()
    if not 'user_allow_other' in filecontent or '#user_allow_other' in filecontent:
      term_cmd("echo 'user_allow_other' > /etc/fuse.conf")
  exit(0)

def term_cmd(cmd, autoclose=True, sudo=True):
    autoclose = '' if autoclose else ';echo "Press any key to exit"; read'
    sudo = 'sudo' if sudo else ''
    cmd = "gnome-terminal --working-directory=/root/ --window -- {0} bash -c '{1}{2}'".format(sudo, cmd, autoclose)
    return subprocess.call(cmd, shell=True)

autosync = True

if len(sys.argv) > 1:
    if (sys.argv[1] == 'Install'):
      install_dependencies()
    elif (sys.argv[1] == 'noautosync'):
      autosync = False

import gi
gi.require_version('Gtk', '3.0')
gi.require_version('AppIndicator3', '0.1')
gi.require_version('Notify', '0.7')
from gi.repository import AppIndicator3, GLib, Gtk
from gi.repository import Notify
import os
import inotify.adapters

class Indicator():

  def __init__(self, inotify_autosync = True):

    logfile = str(Path.home())+"/multitray.log"
    consoleFormatter = logging.Formatter("%(levelname)s:%(message)s")
    consoleHandler = logging.StreamHandler()
    consoleHandler.setLevel(logging.INFO)
    consoleHandler.setFormatter(consoleFormatter)

    fileHandler = RotatingFileHandler(logfile, maxBytes=1024*1024)
    logging.basicConfig(
        level=logging.DEBUG,
        format="%(asctime)s [%(levelname)s] %(message)s",
        handlers=[
            fileHandler,
            consoleHandler
        ]
    )
    self.app = 'Multi rclone Tray'
    self.version = '1.0.0'
    self.iconpath = 'folder-remote-symbolic'
    self.timersecs = 10
    self.rclone_config_file = str(Path.home()) + "/.config/rclone/rclone.conf"
    self.launcherfile = str(Path.home()) +"/.local/share/applications/multirctray.desktop"
    self.autostartfile = str(Path.home()) +"/.config/autostart/multirctray.desktop"

    self.LABEL_MOUNTED = " (mounted)"
    self.LABEL_INOTIFY = " (inotify)"
    self.ignores = [".remmina.","~lock",".tmp",".log"]
    self.inotify_autosync = inotify_autosync 

    logging.info('Starting %s', self.app)

    self.config = configparser.ConfigParser()
    self.load_config()
    self.thread_mount = Thread(target=self.runner_mount, daemon=True)
    self.thread_inotify = Thread(target=self.runner_inotify, daemon=True)
    self.InotifyTreeAdapters = {}

    Notify.init(self.app)
    self.notif = Notify.Notification.new(self.app, "Started", self.iconpath)

    self.indicator = AppIndicator3.Indicator.new(self.app, self.iconpath, AppIndicator3.IndicatorCategory.OTHER)
    self.indicator.set_status(AppIndicator3.IndicatorStatus.ACTIVE)
    self.indicator.set_menu(self.create_menu())

    Thread(target=self.automount).start()

  def load_config(self):
    self.config.read(self.rclone_config_file)
    logging.debug('Config sections [%s]', ', '.join(self.config.sections()))

  def edit_config(self, profile, key, value):
    self.load_config()
    if(not key and not value):
      del self.config[profile]
    else:  
      self.config[profile][key] = value
    self.config.write(open(self.rclone_config_file, 'w'))

  def create_menu(self):

    self.menu = Gtk.Menu()

    btconfig = Gtk.ImageMenuItem(label='Config')
    btconfig.set_submenu(self.get_configmenu())
    self.menu.append(btconfig)

    # quit
    item_quit = Gtk.MenuItem(label='Quit')
    item_quit.connect('activate', self.stop)
    self.menu.append(item_quit)

    # separator
    menu_sep = Gtk.SeparatorMenuItem()
    self.menu.append(menu_sep)

    for item in self.config.sections():
      item1 = Gtk.ImageMenuItem(label=item)
      # item1.set_image(Gtk.Image.new_from_stock(Gtk.STOCK_FIND, Gtk.IconSize.MENU))
      item1.set_submenu(self.get_submenu(item, False, False))
      self.menu.append(item1)

    self.menu.show_all()
    return self.menu

  def get_configmenu(self):
    submenu = Gtk.Menu()
    btsc = Gtk.CheckMenuItem(label='Autostart')
    btsc.set_active(os.path.exists(self.autostartfile))
    btsc.connect('activate', self.createlauncher_action)
    submenu.append(btsc)

    btsc = Gtk.ImageMenuItem(label='Restore config')
    btsc.connect('activate', self.restore_action)
    self.config.read(self.rclone_config_file)
    submenu.append(btsc)

    btEdit = Gtk.ImageMenuItem(label='Edit config')
    btEdit.connect('activate', self.edit_action)
    submenu.append(btEdit)

    btAdd = Gtk.ImageMenuItem(label='Add config')
    btAdd.connect('activate', self.add_action)
    submenu.append(btAdd)

    btAbout = Gtk.ImageMenuItem(label='About')
    btAbout.connect('activate', self.about_action)
    submenu.append(btAbout)

    return submenu

  def get_submenu(self, label, isMounted, isInotify):
    submenu = Gtk.Menu()

    if isMounted:
      btumount = Gtk.ImageMenuItem(label='Umount '+label)
      btumount.connect('activate', self.umount_action)
      submenu.append(btumount)
    elif isInotify:
      btUnwatch = Gtk.ImageMenuItem(label='Unwatch '+label)
      btUnwatch.connect('activate', self.stop_inotify_action) 
      submenu.append(btUnwatch)
    else:
      btmount = Gtk.ImageMenuItem(label='Mount '+label)
      btmount.connect('activate', self.mount_action)
      submenu.append(btmount)
      btmount = Gtk.ImageMenuItem(label='INotify '+label)
      btmount.connect('activate', self.inotify_action)
      submenu.append(btmount) 
      btmount = Gtk.ImageMenuItem(label='Reconnect '+label)
      btmount.connect('activate', self.reconnect_action)
      submenu.append(btmount) 

    if isInotify or isMounted:
      btOpen = Gtk.ImageMenuItem(label='Open '+label)
      btOpen.connect('activate', self.open_action) 
      submenu.append(btOpen)
      btBkp = Gtk.ImageMenuItem(label='Backup config '+label)
      btBkp.connect('activate', self.backup_action) 
      submenu.append(btBkp)

    btsync = Gtk.ImageMenuItem(label='Sync '+label)
    btsync.connect('activate', self.sync_action)
    submenu.append(btsync)
    btdelete = Gtk.ImageMenuItem(label='Delete '+label)
    btdelete.connect('activate', self.delete_action)
    submenu.append(btdelete)
    return submenu

  def stop(self, source):
    logging.info('Exiting')
    Notify.uninit()
    Gtk.main_quit()

  def get_mounts(self):
    cmd = "mount | grep rclone | cut -d: -f1"
    completeProcess = subprocess.run(cmd, shell=True, capture_output=True)
    mounts = completeProcess.stdout.decode("utf-8").split("\n")
    mounts.remove('')
    return mounts

  def check_mount(self):
    mounts = self.get_mounts()
    inotifys = self.InotifyTreeAdapters.keys()

    for menuitem in self.menu.get_children():
      menu_label = menuitem.get_label().replace(self.LABEL_MOUNTED,"").replace(self.LABEL_INOTIFY,"")
      if menu_label in mounts:
        self.set_mounted(menuitem, menu_label + self.LABEL_MOUNTED, True, False)
      elif menu_label in inotifys:
        self.set_mounted(menuitem, menu_label + self.LABEL_INOTIFY, False, True)
      elif menu_label in self.config.sections() :
        self.set_mounted(menuitem, menu_label, False, False)

  def set_mounted(self, menuitem, new_label, isMounted, isInotify):
    current_label = menuitem.get_label()
    menu_label = menuitem.get_label().replace(self.LABEL_MOUNTED,"").replace(self.LABEL_INOTIFY,"")
    # isStatusChanged = (isMounted and self.LABEL_MOUNTED not in menuitem.get_label()) or (self.LABEL_MOUNTED in menuitem.get_label() and not isMounted)
    isStatusChanged = current_label != new_label
    if isStatusChanged:
      logging.debug('isStatusChanged from %s to %s',current_label,new_label)
      menuitem.set_label(new_label)
      menuitem.set_submenu(self.get_submenu(menu_label, isMounted, isInotify))
      self.menu.show_all()

  def get_profile(self, source):
    profile = source.get_ancestor(Gtk.ImageMenuItem).get_label().split('(')[0]
    logging.debug('get_profile %s %s', source.get_label(), profile)

  def mount_action(self, source):
    logging.debug('mount_action %s', source.get_label())
    profile = source.get_label().replace('Mount ',"")
    self.edit_config(profile, 'x-multirctray-synctype', 'mount')
    Thread(target=self.mount, args=[profile]).start()
    self.check_mount()

  def umount_action(self, source):
    logging.debug('umount_action %s', source.get_label())
    profile = source.get_label().replace('Umount ',"")
    self.edit_config(profile, 'x-multirctray-synctype', 'False')
    self.umount(profile) 
    self.check_mount()

  def sync_action(self, source):
    logging.debug('sync_action %s', source.get_label())
    self.sync(source.get_label().replace('Sync ',""))

  def delete_action(self, source):
    profile = source.get_label().replace('Delete ',"")
    logging.debug('sync_action %s', source.get_label())
    self.edit_config(profile, False, False)
    self.indicator.set_menu(self.create_menu())

  def inotify_action(self, source):
    logging.debug('inotify_action %s', source.get_label())
    profile = source.get_label().replace('INotify ',"")
    self.edit_config(profile, 'x-multirctray-synctype', 'inotify')
    self.init_inotify(profile)

  def reconnect_action(self, source):
    logging.debug('reconnect_action %s', source.get_label())
    profile = source.get_label().replace('Reconnect ',"")
    self.config[profile]['x-multirctray-synctype'] = 'Reconnect'
    self.reconnect(profile)

  def stop_inotify_action(self, source):
    logging.debug('stop_inotify %s', source.get_label())
    profile = source.get_label().replace('Unwatch ',"")
    self.edit_config(profile, 'x-multirctray-synctype', 'False')
    self.stop_inotify(profile)

  def createlauncher_action(self, source):
    logging.debug('createlauncher_action %s', source.get_label())
    self.createlauncher(source.get_active())

  def restore_action(self, source):
    logging.debug('restore_action')
    self.restore_config()
    self.indicator.set_menu(self.create_menu())

  def add_action(self, source):
    logging.debug('add_action')
    subprocess.call("gnome-terminal --window -- rclone config", shell=True)

  def about_action(self, source):
    dialog = Gtk.MessageDialog(
      message_type=Gtk.MessageType.INFO,
      buttons=Gtk.ButtonsType.OK,
      text="About "+ self.app,
    )
    dialog.format_secondary_text("v."+self.version)
    dialog.run()
    dialog.destroy()

  def edit_action(self, source):
    logging.debug('edit_action')
    subprocess.call("gedit "+ self.rclone_config_file, shell=True)

  def open_action(self, source):
    logging.debug('open_action %s', source.get_label())
    profile = source.get_label().replace('Open ',"")
    mpoint = str(Path.home()) + "/"+ profile
    subprocess.Popen(["xdg-open", mpoint])

  def backup_action(self, source):
    logging.debug('backup_action %s', source.get_label())
    profile = source.get_label().replace('Backup config ',"")
    mpoint = str(Path.home()) + "/"+ profile
    self.config.write(open(mpoint + "/.rclone.conf", 'w'))

  def mount(self, profile, notify_success = True):
    mpoint = str(Path.home()) + "/"+ profile
    logging.debug('mount %s %s', profile, mpoint)
    if not os.path.exists(mpoint):
      os.makedirs(mpoint)

    cmd = """rclone mount {0}: {1} \
    --vfs-cache-mode writes \
    --volname {2} \
    --file-perms 0777 \
    --allow-non-empty \
    --allow-other \
    --write-back-cache \
    --no-modtime \
    --daemon""".format(profile, mpoint, profile)

    logging.debug(cmd)
    completeProcess = subprocess.run(cmd, shell=True, capture_output=True)
    if completeProcess.returncode == 0:
      self.indicator.set_icon_full('folder-remote-symbolic','mounted')
      self.shownotify(profile, profile + " Mounted", show_notify=notify_success)
    else:
      self.indicator.set_icon_full('mail-mark-junk-symbolic','cannot mount')
      stderr = completeProcess.stderr.decode("utf-8")
      self.shownotify(profile, stderr, level=Notify.Urgency.CRITICAL)
    return completeProcess.returncode

  def reconnect(self, profile, notify_success = True):
    logging.debug('reconnect %s', profile)
    flags = ''
    if self.config[profile]['type'] == 'onedrive':
      flags = '--onedrive-drive-id {0} --onedrive-drive-type {1} --auto-confirm'.format(self.config[profile]['drive_id'], self.config[profile]['drive_type'])
    cmd = 'rclone config reconnect {0}: {1}'.format(profile, flags)
    logging.debug(cmd) 
    term_cmd(cmd, autoclose=False, sudo=False)

  def umount(self, profile):
    mpoint = str(Path.home()) + "/"+ profile
    cmd = "umount " + mpoint
    logging.debug(cmd)
    completeProcess = subprocess.run(cmd, shell=True, capture_output=True)
    if completeProcess.returncode == 0:
      self.indicator.set_icon_full('folder-remote-symbolic','mounted')
      os.system("rm -d 2>/dev/null " + mpoint)
      self.shownotify(profile, profile + " Unmounted")
    else:
      self.indicator.set_icon_full('mail-mark-junk-symbolic','up to date')
      stderr = completeProcess.stderr.decode("utf-8")
      self.shownotify(profile, stderr, level=Notify.Urgency.CRITICAL)

    return completeProcess.returncode

  def sync(self, profile, notify_success=True):
    mpoint = str(Path.home()) + "/"+ profile
    self.shownotify(profile, "Start synchronizing", icon='emblem-synchronizing-symbolic', show_notify=notify_success)
    self.indicator.set_icon_full('emblem-synchronizing-symbolic','syncronicing')
    cmd = "rclone sync '" + profile + "': " + mpoint + " --create-empty-src-dirs"
    logging.debug(cmd)
    completeProcess = subprocess.run(cmd, shell=True, capture_output=True)
    if completeProcess.returncode == 0:
      self.indicator.set_icon_full('folder-remote-symbolic','mounted')
      self.shownotify(profile, "Synchronizing finished", icon='emblem-synchronizing-symbolic', show_notify=notify_success)
    else:
      self.indicator.set_icon_full('document-open-recent-symbolic','up to date')
      stderr = completeProcess.stderr.decode("utf-8")
      self.shownotify(profile, stderr, level=Notify.Urgency.CRITICAL)

    return completeProcess.returncode

  def automount(self):

    mounts = self.get_mounts()
    for profile in self.config.sections():
      if self.config[profile]['x-multirctray-synctype'] == 'mount' and not profile in mounts :
        self.mount(profile, False)
      elif self.config[profile]['x-multirctray-synctype'] == 'inotify':
        self.init_inotify(profile)

    self.thread_mount.start()
    self.thread_inotify.start()

  def runner_mount(self):
    logging.info('runner_mount start')
    while True:
      # apply the interface update using  GLib.idle_add()
      GLib.idle_add(self.check_mount, priority=GLib.PRIORITY_DEFAULT)
      time.sleep(self.timersecs)
    logging.info('runner_mount stop')

  def restore_config(self):
    mounts = self.get_mounts()
    inotifys = self.InotifyTreeAdapters.keys()

    for menuitem in self.menu.get_children():
      menu_label = menuitem.get_label().replace(self.LABEL_MOUNTED,"").replace(self.LABEL_INOTIFY,"")
      if menu_label in mounts or menu_label in inotifys:
          cmd = 'rclone copyto "{0}":/.rclone.conf "{1}"'.format(menu_label, self.rclone_config_file)
          if self.cmd_exec(menu_label, cmd) == 0: break

  def createlauncher(self, autostart = True):
    content = """#!/usr/bin/env xdg-open
[Desktop Entry]
Version=1.0
Type=Application
Exec=multirctray.py
Hidden=false
NoDisplay=false
X-GNOME-Autostart-enabled=true
Terminal=false
Name=Multi rclone Tray
Comment=Control multiple rclone configurations from the system tray 
Icon=/usr/share/icons/Adwaita/scalable/devices/drive-multidisk-symbolic.svg
""".encode("utf-8")

    with open(self.launcherfile, 'wb') as f: f.write(content)
    if autostart: 
      with open(self.autostartfile, 'wb') as f: f.write(content)
    else: os.unlink(self.autostartfile)
    
    logging.info('%s: %s','autostart', autostart)

    self.indicator.set_menu(self.create_menu())

  def shownotify(self, title, text, level=Notify.Urgency.LOW, icon=None, show_notify=True):
    #Set the urgency level to one of URGENCY_LOW, URGENCY_NORMAL or URGENCY_CRITICAL.
    timeout = Notify.EXPIRES_DEFAULT
    icon='folder-remote-symbolic' if icon is None else icon
    if level == Notify.Urgency.CRITICAL:
      timeout = Notify.EXPIRES_NEVER
      icon='mail-mark-junk-symbolic' if icon is None else icon
      logging.error('%s: %s',title, text)
    else:
      logging.info('%s: %s',title, text)
    if show_notify:
      self.notif.update(self.app, title + ' : '+ text, icon)
      self.notif.set_urgency(level)
      self.notif.set_timeout(timeout)
      self.notif.show()

  def init_inotify(self, profile):
    mpoint = str(Path.home()) + "/"+ profile 
    logging.info('init_inotify %s', mpoint)
    if self.inotify_autosync: self.sync(profile, False)
    mask = (inotify.constants.IN_MODIFY
      | inotify.constants.IN_MOVE)

    self.InotifyTreeAdapters[profile] = inotify.adapters.InotifyTree(mpoint, mask)

  def stop_inotify(self, profile):
    logging.info('stop inotify %s', profile)
    self.InotifyTreeAdapters[profile] = None
    del self.InotifyTreeAdapters[profile] 

  def runner_inotify(self):
    logging.info('runner_inotify start')
    while True:
      for profile, adapter in self.InotifyTreeAdapters.copy().items(): 
        for event in adapter.event_gen(yield_nones=False, timeout_s=3):
          self.inotify_handler(event, profile, adapter) 
    logging.info('runner_inotify stop')

  def inotify_handler(self, event, profile, adapter):
    (_, type_names, path, filename) = event
    logging.debug("PATH=[%s] FILENAME=[%s] EVENT_TYPES=%s",path, filename, type_names)
    for ignore in self.ignores: 
      if ignore in filename: return
    cmd = ''
    source = path + '/' + filename
    mpoint = str(Path.home()) + "/"+ profile
    destpath = path.replace(mpoint,'')
    destfile = destpath + '/' + filename
    if 'IN_ISDIR' in type_names:
      if ('IN_CREATE' in type_names or 'IN_MOVED_TO' in type_names) and os.path.exists(source):
        cmd += 'rclone copy "'+ source + '"  '+profile+':"'+ destfile  + '" --create-empty-src-dirs '
      elif 'IN_DELETE' in type_names or 'IN_MOVED_FROM' in type_names:
        cmd += 'rclone purge '+profile+':"'+ destfile + '" --ignore-errors' 
      else :
        logging.warning('%s %s',type_names,'not captured')
    else:
      if ('IN_MODIFY' in type_names or 'IN_MOVED_TO' in type_names) and os.path.exists(source):
        cmd += 'rclone copy "'+ source + '"  '+profile+':"'+ destpath  + '" --create-empty-src-dirs '
      elif 'IN_DELETE' in type_names or 'IN_MOVED_FROM' in type_names:
        cmd += 'rclone delete '+profile+':"'+ destfile + '" --ignore-errors'
      else :
        logging.warning('%s %s',type_names,'not captured')
    if cmd != '' : self.cmd_exec(profile, cmd)
        
  def cmd_exec(self, profile, cmd):
    ret = 1
    try:
      self.indicator.set_icon_full('emblem-synchronizing-symbolic','syncronicing')
      result = subprocess.run(cmd, shell=True, capture_output=True)
      logging.info('%s = %s',cmd,result.returncode)
      if result.returncode != 0:
        stderr = result.stderr.decode("utf-8")
        if 'directory not found' not in stderr:
          self.shownotify(profile, stderr, level=Notify.Urgency.CRITICAL)
      ret = result.returncode
    finally:
      self.indicator.set_icon_full('folder-remote-symbolic','mounted')
      return ret

Indicator(autosync)
signal.signal(signal.SIGINT, signal.SIG_DFL)
Gtk.main()
