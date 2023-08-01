#!/bin/sh -eux

echo "packages optimization..."
apt remove -y --autoremove gnome-initial-setup
apt-get install -y linux-headers-$(uname -r) build-essential dkms openssh-server


echo "Set up password-less for the vagrant user..."
sed -i -e '/Defaults\s\+env_reset/a Defaults\texempt_group=sudo' /etc/sudoers;

echo 'vagrant ALL=(ALL) NOPASSWD:ALL' >/etc/sudoers.d/99_vagrant;
chmod 440 /etc/sudoers.d/99_vagrant;


# echo "Installing VirtualBox guest additions..."

# vbgaver="6.1.38"

# wget http://download.virtualbox.org/virtualbox/$vbgaver/VBoxGuestAdditions_$vbgaver.iso
# mkdir /media/VBoxGuestAdditions
# mount -o loop,ro VBoxGuestAdditions_$vbgaver.iso /media/VBoxGuestAdditions
# sh /media/VBoxGuestAdditions/VBoxLinuxAdditions.run
# rm VBoxGuestAdditions_$vbgaver.iso
# umount /media/VBoxGuestAdditions
# rmdir /media/VBoxGuestAdditions

echo "installing vagrant insecure public key..."

mkdir -p /home/vagrant/.ssh/
echo 'ssh-rsa AAAAB3NzaC1yc2EAAAABIwAAAQEA6NF8iallvQVp22WDkTkyrtvp9eWW6A8YVr+kz4TjGYe7gHzIw+niNltGEFHzD8+v1I2YJ6oXevct1YeS0o9HZyN1Q9qgCgzUFtdOKLv6IedplqoPkcmF0aYet2PkEDo3MlTBckFXPITAMzF8dJSIFo9D8HfdOV0IAdx4O7PtixWKn5y2hMNG0zQPyUecp4pzC6kivAIhyfHilFR61RGL+GPXQ2MWZWFYbAGjyiYJnAmCP3NOTd0jMZEnDkbUvxhMmBYSdETk1rRgm+R4LOzFUGaHqHDLKLX+FIPKcF96hrucXzcWyLbIbEgE98OHlnVYCzRdK8jlqm8tehUc9c9WhQ== vagrant insecure public key' | tee -a /home/vagrant/.ssh/authorized_keys
echo 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIN1YdxBpNlzxDqfJyw/QKow1F+wvG9hXGoqiysfJOn5Y vagrant insecure public key' | tee --append /home/vagrant/.ssh/authorized_keys

chmod 0700 /home/vagrant/.ssh
chmod 0600 /home/vagrant/.ssh/authorized_keys
chown vagrant:vagrant /home/vagrant/.ssh/authorized_keys

echo "Disabling UseDNS on ssh ..."

sed -i 's/#UseDNS no/UseDNS no/' /etc/ssh/sshd_config
