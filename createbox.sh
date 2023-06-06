#!/bin/bash

# Name of the new virtual machine
vm_name="Ubuntu23.04"

# Location of the ISO file
iso_file=$HOME"/Descargas/ubuntu-23.04-desktop-amd64.iso"

# Location to store virtual machine files
vm_folder=$HOME"/VirtualBox VMs"

# Create the virtual machine
VBoxManage createvm --name $vm_name --register --basefolder "$vm_folder"

# Set virtual machine type and version
# Configure video driver to vmsvga
# Create a network interface for the virtual machine
VBoxManage modifyvm $vm_name --ostype "Ubuntu_64" --memory 4096 --vram 128 \
 --vram 128 --accelerate3d on --graphicscontroller vmsvga \
 --nic1 nat

# Add a SATA controller for the virtual hard drive
VBoxManage storagectl $vm_name --name "SATA Controller" --add sata --controller IntelAhci
VBoxManage storagectl $vm_name --name "IDE Controller" --add ide

# Add a virtual hard drive
VBoxManage createhd --filename "$vm_folder"/$vm_name/$vm_name.vdi --size 40960 --format VDI
VBoxManage storageattach $vm_name --storagectl "SATA Controller" --port 0 --device 0 --type hdd --medium "$vm_folder"/$vm_name/$vm_name.vdi
VBoxManage storageattach $vm_name --storagectl "IDE Controller" --port 0 --device 0 --type dvddrive --medium $iso_file


# Set up an unattended installation
# VBoxManage unattended install $vm_name --user=vagrant --password=vagrant \
# --locale=en_US --country=US --time-zone=UTC --hostname=$vm_name --iso=$iso_file

# Start the virtual machine
VBoxManage startvm $vm_name
