#!/bin/bash

# Name of the new virtual machine
vm_name="Ubuntu23.04"

# Location of the ISO file
iso_file=$HOME"/Descargas/ubuntu-23.04-desktop-amd64.iso"

# Location to store virtual machine files
vm_folder=$HOME"/VirtualBox VMs"

function create_vm() {
    echo "Creating virtual machine $vm_name"

    # Create the virtual machine
    VBoxManage createvm --name $vm_name --register --basefolder "$vm_folder"

    # Set virtual machine type and version
    # Configure video driver to vmsvga
    # Create a network interface for the virtual machine
    VBoxManage modifyvm $vm_name --ostype "Ubuntu_64" --memory 4096 --vram 128 \
    --vram 128 --accelerate3d on --graphicscontroller vmsvga \
    --nic1 nat --clipboard-mode bidirectional --draganddrop bidirectional

    # Add a SATA controller for the virtual hard drive
    VBoxManage storagectl $vm_name --name "SATA Controller" --add sata --controller IntelAhci
    VBoxManage storagectl $vm_name --name "IDE Controller" --add ide

    # Add a virtual hard drive
    VBoxManage createhd --filename "$vm_folder"/$vm_name/$vm_name.vdi --size 40960 --format VDI
    VBoxManage storageattach $vm_name --storagectl "SATA Controller" --port 0 --device 0 --type hdd --medium "$vm_folder"/$vm_name/$vm_name.vdi
    VBoxManage storageattach $vm_name --storagectl "IDE Controller" --port 0 --device 0 --type dvddrive --medium $iso_file

    # Add a shared folder
    VBoxManage sharedfolder add $vm_name --name vagrant --hostpath $HOME --transient --readonly --automount

    # Set up an unattended installation
    # VBoxManage unattended install $vm_name --user=vagrant --password=vagrant \
    # --locale=en_US --country=US --time-zone=UTC --hostname=$vm_name --iso=$iso_file

    # Start the virtual machine
    VBoxManage startvm $vm_name
}

function install_tools() {
    local vbver="6.1.38"
    echo "Installing tools"
    wget http://download.virtualbox.org/virtualbox/$vbver/VBoxGuestAdditions_$vbver.iso
    sudo mkdir /media/VBoxGuestAdditions
    sudo mount -o loop,ro VBoxGuestAdditions_$vbver.iso /media/VBoxGuestAdditions
    sudo sh /media/VBoxGuestAdditions/VBoxLinuxAdditions.run
    rm VBoxGuestAdditions_$vbver.iso
    sudo umount /media/VBoxGuestAdditions
    sudo rmdir /media/VBoxGuestAdditions
}

function prepare_user(){
    sudo apt remove --autoremove gnome-initial-setup
}

function config_ssh() {
    echo "Configuring SSH"
    wget https://raw.githubusercontent.com/hashicorp/vagrant/main/keys/vagrant.pub ~/.ssh/authorized_keys/vagrant.pub
    chmod 0700 ~/.ssh/authorized_keys
    chmod 0600 ~/.ssh/authorized_keys/vagrant.pub
    sudo sed -i 's/PasswordAuthentication no/PasswordAuthentication yes/g' /etc/ssh/sshd_config
    sudo systemctl restart sshd
}

function test_box() {
    echo "Testing box"
    vagrant box add --name $vm_name $vm_folder/$vm_name
    vagrant init $vm_name
    vagrant up
}

$1 $2 