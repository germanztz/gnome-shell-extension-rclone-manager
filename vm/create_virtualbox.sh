#!/bin/bash
set -euo pipefail

vm_name="ubuntu-25.10-desktop-amd64"
iso_url="https://releases.ubuntu.com/25.10/ubuntu-25.10-desktop-amd64.iso"
iso_sha256="32e30d72ae4798c633323a2684d94a11582bb03a6ab38d2b0d5ae5eabc5e577b"
vm_folder="$HOME/VirtualBox VMs"
box_name="daimler/${vm_name}"

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$script_dir/.." && pwd)"
iso_file="$script_dir/${vm_name}.iso"
vbga_iso_file="$script_dir/VBoxGuestAdditions.iso"
box_file="$script_dir/${vm_name}.box"
guest_key="$script_dir/.guest_key"

cd "$repo_root"

download_iso() {
  if [ ! -f "$iso_file" ]; then
    echo "Downloading $iso_url ..."
    curl -L -C - -o "$iso_file" "$iso_url"
    echo "Verifying checksum ..."
    echo "$iso_sha256  $iso_file" | sha256sum -c -
  else
    echo "ISO already present: $iso_file"
  fi

  if [ ! -f "$vbga_iso_file" ]; then
    vbgaver="$(VBoxManage --version | grep -oE '^[0-9]+\.[0-9]+\.[0-9]+')"
    vbga_url="http://download.virtualbox.org/virtualbox/${vbgaver}/VBoxGuestAdditions_${vbgaver}.iso"
    echo "Downloading VirtualBox Guest Additions ${vbgaver} ..."
    curl -L -C - -o "$vbga_iso_file" "$vbga_url"
  else
    echo "Guest Additions ISO already present: $vbga_iso_file"
  fi
}

wait_vm_stoped(){
  local timeout="${VM_WAIT_TIMEOUT:-1800}"
  local waited=0
  local state
  echo "Waiting for VM ${vm_name} to be stopped ..."
  while [ "$waited" -lt "$timeout" ]; do
    state="$(VBoxManage showvminfo --machinereadable "$vm_name" | sed -n 's/^VMState="\(.*\)"/\1/p')"
    case "$state" in
      poweroff|aborted|saved)
        echo "VM ${vm_name} is stopped (${state})."
        return 0
        ;;
    esac
    sleep 10
    waited=$((waited + 10))
  done
  echo "ERROR: timeout waiting for VM ${vm_name} to stop (last state: ${state})." >&2
  return 1
}

delete_vm() {
  echo "Deleting existing VM ${vm_name} ..."
  VBoxManage controlvm "$vm_name" poweroff || true
  sleep 2
  VBoxManage unregistervm "$vm_name" --delete
  sleep 2
  rm -Rf "$vm_folder/$vm_name"

}

wait_idle() {
  local state
  state="$(VBoxManage showvminfo --machinereadable "$vm_name" | sed -n 's/^VMState="\(.*\)"/\1/p')"
  case "$state" in
    poweroff|aborted|saved)
      echo "VM ${vm_name} is not running (${state}), skipping idle wait."
      return 0
      ;;
  esac

  local timeout="${2:-3600}"
  local threshold="${WAIT_IDLE_THRESHOLD:-5}"
  local streak_needed=15
  local streak=0
  local waited=0
  local u k load

  VBoxManage metrics setup --period 1 --samples 1 "$vm_name" CPU/Load

  echo "Waiting for VM ${vm_name} CPU < ${threshold}% for ${streak_needed}s ..."
  while [ "$waited" -lt "$timeout" ]; do
    u="$(VBoxManage metrics query "$vm_name" CPU/Load/User 2>/dev/null | awk '/CPU\/Load\/User/{print $3}')"
    k="$(VBoxManage metrics query "$vm_name" CPU/Load/Kernel 2>/dev/null | awk '/CPU\/Load\/Kernel/{print $3}')"
    if [ -z "$u" ] || [ -z "$k" ]; then
      sleep 1; waited=$((waited + 1)); continue
    fi
    u="${u%,}"; u="${u%\%}"
    k="${k%,}"; k="${k%\%}"
    load="$(awk -v a="$u" -v b="$k" 'BEGIN{printf "%.1f", a+b}')"
    if awk -v l="$load" -v t="$threshold" 'BEGIN{exit !(l<t)}'; then
      streak=$((streak + 1))
    else
      streak=0
      echo "  CPU=${load}% - busy, resetting streak"
    fi
    if [ "$streak" -ge "$streak_needed" ]; then
      echo "VM ${vm_name} idle (CPU ${load}% < ${threshold}% for ${streak_needed}s)."
      return 0
    fi
    sleep 1
    waited=$((waited + 1))
  done
  echo "ERROR: timeout (${timeout}s) while waiting for VM ${vm_name} to idle." >&2
  return 1
}

restart_vm(){
  echo "Restarting  ${vm_name}." 
  VBoxManage controlvm "$vm_name" reset
  sleep 60
}

install_vm() {

  if VBoxManage list vms | grep -q "\"${vm_name}\""; then
    if [ "$DELETE_VM" = "1" ]; then
      delete_vm
    else
      echo "VM ${vm_name} already exists, skipping creation and install ..."
      return 0
    fi
  fi

  echo "Creating VM ${vm_name} ..."
  VBoxManage createvm --name "$vm_name" --register --basefolder "$vm_folder"
  VBoxManage createhd --filename "$vm_folder/$vm_name/$vm_name.vdi" --size 40960 --format VDI
  VBoxManage storagectl "$vm_name" --name "SATA Controller" --add sata --controller IntelAhci
  VBoxManage storagectl "$vm_name" --name "IDE Controller" --add ide
  VBoxManage storageattach "$vm_name" --storagectl "SATA Controller" --port 0 --device 0 --type hdd --medium "$vm_folder/$vm_name/$vm_name.vdi"
  VBoxManage storageattach "$vm_name" --storagectl "IDE Controller" --port 0 --device 0 --type dvddrive --medium "$iso_file"
  VBoxManage modifyvm "$vm_name" --ostype "Ubuntu_64" --memory 8096 --vram 128 --cpus 4
  VBoxManage modifyvm "$vm_name" --nic1 nat
  VBoxManage modifyvm "$vm_name" --natpf1 "ssh,tcp,127.0.0.1,2222,,22"
  VBoxManage modifyvm "$vm_name" --clipboard-mode bidirectional
  VBoxManage modifyvm "$vm_name" --graphicscontroller vmsvga
  VBoxManage modifyvm "$vm_name" --audio-enabled off
  VBoxManage modifyvm "$vm_name" --vrde on
  # VBoxManage sharedfolder add "$vm_name" --name http --hostpath "$script_dir/http/" --automount
  # VBoxManage modifyvm "$vm_name" --drag-and-drop bidirectional
  # VBoxManage modifyvm "$vm_name" --uart1 0x3F8 4
  # VBoxManage modifyvm "$vm_name" --uartmode1 file "$vm_folder/$vm_name/vm-console.log"

  echo "Configuring unattended install (locale ${LOCALE}, country ${COUNTRY}) ..."

  VBoxManage unattended install "$vm_name" \
    --user=vagrant \
    --password=vagrant \
    --full-user-name=vagrant \
    --locale="$LOCALE" --country="$COUNTRY" --time-zone=UTC \
    --language="${LOCALE%%_*}-${COUNTRY}" \
    --hostname="vagrant.localhost" \
    --iso="$iso_file" \
    --install-additions \
    --additions-iso="$vbga_iso_file" \
    --post-install-command="/bin/bash -c 'exit 0'" \
    --package-selection-adjustment=minimal

  echo "Starting SO intalation ..."
  VBoxManage startvm "$vm_name" --type headless
  # remmina --no-tray-icon --set-option "resolution=1920x1080" -c rdp://vagrant:local\\vagrant@localhost
  wait_idle
  restart_vm  
}

ensure_start_vm(){
  local state
  state="$(VBoxManage showvminfo --machinereadable "$vm_name" | sed -n 's/^VMState="\(.*\)"/\1/p')"
  if echo "$state" | grep -qE 'running|paused'; then
    echo "VM ${vm_name} is already running (${state}), skipping start."
  else
    echo "Starting VM ${vm_name} ..."
    VBoxManage startvm "$vm_name" --type headless
    sleep 30
  fi
}

post_install(){
  wait_idle
  restart_vm  

  # ensure_start_vm
  VBoxManage guestcontrol "$vm_name" copyto --username vagrant --password vagrant \
    --target-directory /tmp/ubuntu-preseed.sh "$script_dir/http/ubuntu-preseed.sh"
  VBoxManage guestcontrol "$vm_name" run --username vagrant --password vagrant \
  -- /bin/bash -c "echo vagrant | sudo -S /tmp/ubuntu-preseed.sh root_entry"
  VBoxManage guestcontrol "$vm_name" run --username vagrant --password vagrant \
  -- /bin/bash /tmp/ubuntu-preseed.sh vagrant_entry

  restart_vm
}

main() {
  DELETE_VM=0
  LOCALE="en_US"
  for arg in "$@"; do
    case "$arg" in
      --deletevm) DELETE_VM=1 ;;
      --locale=*) LOCALE="${arg#*=}" ;;
      *) echo "Unknown option: $arg" >&2; exit 1 ;;
    esac
  done

  if [[ "$LOCALE" == *_* ]]; then
    COUNTRY="${LOCALE##*_}"
  else
    COUNTRY="$LOCALE"
  fi
  COUNTRY="${COUNTRY^^}"
  KEYBOARD="${COUNTRY,,}"

  download_iso
  install_vm
  post_install

  echo "Done. Install complete and VM is powered off."

}

main "$@"