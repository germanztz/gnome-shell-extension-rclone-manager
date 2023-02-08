#!/bin/bash

# Name of the new virtual machine
vm_name="Ubuntu22.04"

# Location of the ISO file
iso_file=$HOME"/Descargas/ubuntu-22.04.1-desktop-amd64.iso"

# Location to store virtual machine files
vm_folder=$HOME"/VirtualBox VMs"

# Create the virtual machine
VBoxManage createvm --name $vm_name --register --basefolder "$vm_folder"

# Set virtual machine type and version
VBoxManage modifyvm $vm_name --ostype "Ubuntu_64" --memory 2048 --vram 128

# Add a SATA controller for the virtual hard drive
VBoxManage storagectl $vm_name --name "SATA Controller" --add sata --controller IntelAhci

# Add a virtual hard drive
VBoxManage createhd --filename "$vm_folder"/$vm_name/$vm_name.vdi --size 40960 --format VDI
VBoxManage storageattach $vm_name --storagectl "SATA Controller" --port 0 --device 0 --type hdd --medium "$vm_folder"/$vm_name/$vm_name.vdi

# Add a virtual optical drive and attach the ISO file
VBoxManage storagectl $vm_name --name "IDE Controller" --add ide
VBoxManage storageattach $vm_name --storagectl "IDE Controller" --port 0 --device 0 --type dvddrive --medium $iso_file

# Create a network interface for the virtual machine
VBoxManage modifyvm $vm_name --nic1 nat

# Set up an unattended installation
# VBoxManage unattended install $vm_name --user=vagrant --password=vagrant \
# --locale=en_US --country=US --time-zone=UTC --hostname=$vm_name --iso=$iso_file

# Start the virtual machine
# VBoxManage startvm $vm_name
