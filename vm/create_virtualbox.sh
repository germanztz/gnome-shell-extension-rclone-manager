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

create_vm() {
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
  VBoxManage modifyvm "$vm_name" --ostype "Ubuntu_64" --memory 8096 --vram 128 --cpus 4
  VBoxManage storagectl "$vm_name" --name "SATA Controller" --add sata --controller IntelAhci
  VBoxManage createhd --filename "$vm_folder/$vm_name/$vm_name.vdi" --size 40960 --format VDI
  VBoxManage storageattach "$vm_name" --storagectl "SATA Controller" --port 0 --device 0 --type hdd --medium "$vm_folder/$vm_name/$vm_name.vdi"
  VBoxManage storagectl "$vm_name" --name "IDE Controller" --add ide
  VBoxManage storageattach "$vm_name" --storagectl "IDE Controller" --port 0 --device 0 --type dvddrive --medium "$iso_file"
  VBoxManage modifyvm "$vm_name" --nic1 nat
  VBoxManage modifyvm "$vm_name" --natpf1 "ssh,tcp,127.0.0.1,2222,,22"
  VBoxManage modifyvm "$vm_name" --clipboard-mode bidirectional
  # VBoxManage modifyvm "$vm_name" --drag-and-drop bidirectional
  VBoxManage modifyvm "$vm_name" --audio-enabled off
  # VBoxManage sharedfolder add "$vm_name" --name host_user --hostpath "$HOME" --automount
  # VBoxManage modifyvm "$vm_name" --uart1 0x3F8 4
  # VBoxManage modifyvm "$vm_name" --uartmode1 file "$vm_folder/$vm_name/vm-console.log"

}

install_vm() {

  echo "Configuring unattended install (locale ${LOCALE}, country ${COUNTRY}) ..."

  post_install_command="$(cat <<'EOF'
apt remove -y --autoremove gnome-initial-setup || true
apt-get install -y linux-headers-$(uname -r) build-essential dkms openssh-server

echo 'vagrant ALL=(ALL) NOPASSWD:ALL' >/etc/sudoers.d/99_vagrant;
chmod 440 /etc/sudoers.d/99_vagrant;

sed -i 's/#UseDNS no/UseDNS no/' /etc/ssh/sshd_config

sed -i 's/^# *AutomaticLoginEnable = true/AutomaticLoginEnable = true/' /etc/gdm3/custom.conf
sed -i 's/^# *AutomaticLogin = user1/AutomaticLogin = vagrant/' /etc/gdm3/custom.conf

mkdir -p /home/vagrant/.ssh/
echo 'ssh-rsa AAAAB3NzaC1yc2EAAAABIwAAAQEA6NF8iallvQVp22WDkTkyrtvp9eWW6A8YVr+kz4TjGYe7gHzIw+niNltGEFHzD8+v1I2YJ6oXevct1YeS0o9HZyN1Q9qgCgzUFtdOKLv6IedplqoPkcmF0aYet2PkEDo3MlTBckFXPITAMzF8dJSIFo9D8HfdOV0IAdx4O7PtixWKn5y2hMNG0zQPyUecp4pzC6kivAIhyfHilFR61RGL+GPXQ2MWZWFYbAGjyiYJnAmCP3NOTd0jMZEnDkbUvxhMmBYSdETk1rRgm+R4LOzFUGaHqHDLKLX+FIPKcF96hrucXzcWyLbIbEgE98OHlnVYCzRdK8jlqm8tehUc9c9WhQ== vagrant insecure public key' | tee -a /home/vagrant/.ssh/authorized_keys
echo 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIN1YdxBpNlzxDqfJyw/QKow1F+wvG9hXGoqiysfJOn5Y vagrant insecure public key' | tee --append /home/vagrant/.ssh/authorized_keys

chmod 0700 /home/vagrant/.ssh
chmod 0600 /home/vagrant/.ssh/authorized_keys
chown 1000:1000 /home/vagrant/.ssh/authorized_keys || true

sed -i 's/^XKBLAYOUT=.*/XKBLAYOUT=\"${KEYBOARD}\"/' /etc/default/keyboard || true

EOF
)"
# sed -i 's/^GRUB_CMDLINE_LINUX=\"[^\"]*\"/GRUB_CMDLINE_LINUX=\"console=tty0 console=ttyS0,115200n8\"/' /etc/default/grub
# grep -q '^GRUB_TERMINAL=' /etc/default/grub || echo 'GRUB_TERMINAL=\"serial console\"' >> /etc/default/grub
# grep -q '^GRUB_SERIAL_COMMAND=' /etc/default/grub || echo 'GRUB_SERIAL_COMMAND=\"serial --speed=115200 --unit=0 --word=8 --parity=no --stop=1\"' >> /etc/default/grub
# update-grub

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
    --package-selection-adjustment=minimal
    # --post-install-command="$post_install_command" \

  patch_keyboard_layout

  echo "Starting SO intalation ..."
  VBoxManage startvm "$vm_name" --type headless
}

patch_keyboard_layout() {
  local user_data_file grub_cfg

  user_data_file="$(ls "$vm_folder/$vm_name"/Unattended-*-user-data 2>/dev/null | head -n 1 || true)"
  if [ -z "$user_data_file" ] || [ ! -f "$user_data_file" ]; then
    echo "WARNING: generated user-data not found; autoinstall keyboard layout left as 'us'" >&2
  elif ! grep -q '^    layout: us$' "$user_data_file"; then
    echo "WARNING: 'layout: us' not found in $user_data_file; autoinstall keyboard layout left unchanged" >&2
  else
    echo "Setting autoinstall keyboard layout to ${KEYBOARD} in $user_data_file ..."
    sed -i "s/^    layout: us$/    layout: ${KEYBOARD}/" "$user_data_file"
  fi

  grub_cfg="$(ls "$vm_folder/$vm_name"/Unattended-*-grub.cfg 2>/dev/null | head -n 1 || true)"
  if [ -z "$grub_cfg" ] || [ ! -f "$grub_cfg" ]; then
    echo "WARNING: generated grub.cfg not found; kernel keyboard param left as 'us'" >&2
  else
    echo "Setting kernel keyboard param to ${KEYBOARD} in $grub_cfg ..."
    sed -i "s|keyboard-configuration/layoutcode=us|keyboard-configuration/layoutcode=${KEYBOARD}|g" "$grub_cfg"
    # echo "Adding serial console args to $grub_cfg ..."
    # sed -i "s|/casper/vmlinuz |/casper/vmlinuz console=tty0 console=ttyS0,115200n8 |g" "$grub_cfg"
  fi
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

  # clean_host_env
  # prepare_ssh_key
  download_iso
  create_vm
  install_vm
  wait_vm_stoped
  echo "Done. Install complete and VM is powered off."

}

main "$@"