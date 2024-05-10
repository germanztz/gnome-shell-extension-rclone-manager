# -*- mode: ruby -*-
# vi: set ft=ruby :

# All Vagrant configuration is done below. The "2" in Vagrant.configure
# configures the configuration version (we support older styles for
# backwards compatibility). Please don't change it unless you know what
# you're doing.
Vagrant.configure("2") do |config|
  # The most common configuration options are documented and commented below.
  # For a complete reference, please see the online documentation at
  # https://docs.vagrantup.com.

  # config.vagrant.plugins = ["vagrant-reload"]
  config.vm.box = "daimler/ubuntu-24.04-desktop"


  # Share an additional folder to the guest VM. The first argument is
  # the path on the host to the actual folder. The second argument is
  # the path on the guest to mount the folder. And the optional third
  # argument is a set of non-required options.
  config.vm.synced_folder ".", "/home/vagrant/.local/share/gnome-shell/extensions/rclone-manager@germanztz.com"
  # Provider-specific configuration so you can fine-tune various
  # backing providers for Vagrant. These expose provider-specific options.
  #
  config.vm.provider :virtualbox do |vb|
    vb.linked_clone = true
    vb.memory = 3096
    vb.cpus = 2
    # Display the VirtualBox GUI when booting the machine
    vb.gui = true
    vb.customize ['modifyvm', :id, '--cableconnected1', 'on']
    vb.customize ["modifyvm", :id, '--usbxhci', 'off']
    vb.customize ["modifyvm", :id, '--audio', 'none']
    vb.customize ['modifyvm', :id, '--clipboard-mode', 'bidirectional']
    vb.customize ['modifyvm', :id, '--draganddrop', 'bidirectional']
  end

  config.vm.box_check_update = true
  # config.vm.network :private_network, ip: config_jenkins_ip, libvirt__forward_mode: 'route', libvirt__dhcp_enabled: false
  # Enable provisioning with a shell script. Additional provisioners such as
  config.vm.provision "file", source: "~/.config/rclone/rclone.conf", destination: "/home/vagrant/.config/rclone/rclone.conf"
  config.vm.provision "shell", inline: <<-SHELL

    systemctl mask sleep.target suspend.target hibernate.target hybrid-sleep.target
    timedatectl set-timezone Europe/Madrid
    apt update
    apt install -y rclone gnome-shell-extension-manager 
    SHELL

  config.vm.post_up_message = "vm started!!!"
       
end
