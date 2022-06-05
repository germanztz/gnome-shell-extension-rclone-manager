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

  config.vagrant.plugins = ["vagrant-reload"]

  # Share an additional folder to the guest VM. The first argument is
  # the path on the host to the actual folder. The second argument is
  # the path on the guest to mount the folder. And the optional third
  # argument is a set of non-required options.
  # config.vm.synced_folder "../data", "/vagrant_data"

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
    vb.customize ["modifyvm", :id, '--groups', '/extensiontest']
    vb.customize ["modifyvm", :id, '--usbxhci', 'off']
    vb.customize ["modifyvm", :id, '--audio', 'none']
    vb.customize ['modifyvm', :id, '--clipboard-mode', 'bidirectional']
    vb.customize ['modifyvm', :id, '--draganddrop', 'bidirectional']
  end

  config.vm.box_check_update = true
  config.vm.synced_folder ".", "/vagrant_data"
  # config.vm.network :private_network, ip: config_jenkins_ip, libvirt__forward_mode: 'route', libvirt__dhcp_enabled: false
  # Enable provisioning with a shell script. Additional provisioners such as
  # config.vm.provision "shell", inline: <<-SHELL
  #   apt-get update
  #   apt-get install -y codium git
  # SHELL
  config.vm.post_up_message = "vm started!!!"


  config.vm.provision :shell, inline: "mkdir -p /home/vagrant/.local/share/gnome-shell/extensions/rclone-manager@germanztz.com"
  config.vm.provision :shell, inline: "cp -R /vagrant_data/* /home/vagrant/.local/share/gnome-shell/extensions/rclone-manager@germanztz.com"
  config.vm.provision :shell, inline: "chown -R vagrant:vagrant /home/vagrant/.local/share/gnome-shell"
  config.vm.provision :shell, inline: "systemctl mask sleep.target suspend.target hibernate.target hybrid-sleep.target"
  
  config.vm.provision :shell, inline: "apt purge -y gnome-initial-setup"
  # config.vm.provision :shell, inline: "apt purge -y libreoffice-common thunderbird gnome-initial-setup"
  # config.vm.provision :shell, inline: "apt autoremove -y && apt autoclean"
  config.vm.provision :shell, inline: "apt update"
  config.vm.provision :shell, inline: "apt install -y gnome-shell-extensions rclone gettext"
  config.vm.provision :shell, inline: "sed -i -E 's,^#?[ ]*( AutomaticLoginEnable ).*,\\1= True,' /etc/gdm3/custom.conf"
  config.vm.provision :shell, inline: "sed -i -E 's,^#?[ ]*( AutomaticLogin ).*,\\1= vagrant,' /etc/gdm3/custom.conf"
  config.vm.provision :reload

  config.vm.define :testvm do |config|
    config.vm.box = "chenhan/ubuntu-desktop-20.04"
    # config.vm.box = "fasmat/ubuntu2204-desktop"
    config.vm.hostname = "testvm"
  end

  config.trigger.after :up do |trigger|
    # trigger.only_on = ['testvm']
    trigger.info = 'gnome-extensions enable'
    trigger.run = {inline: "vagrant ssh -c 'gnome-extensions enable rclone-manager@germanztz.com' testvm"}
  end  

  config.trigger.after :up do |trigger|
    trigger.info = 'idle-activation-enabled false'
    trigger.run = {inline: "vagrant ssh -c 'gsettings set org.gnome.desktop.screensaver idle-activation-enabled false' testvm"}
  end  

  config.trigger.after :up do |trigger|
    trigger.info = 'lock-enabled false'
    trigger.run = {inline: "vagrant ssh -c 'gsettings set org.gnome.desktop.screensaver lock-enabled false' testvm"}
  end  
     
end
