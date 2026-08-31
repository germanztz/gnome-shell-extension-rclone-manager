#!/bin/sh -eux

root_entry(){

    echo "packages optimization..."
    apt remove -y --autoremove gnome-initial-setup || true
    apt update
    apt install -y linux-headers-$(uname -r) build-essential dkms openssh-server dconf-cli
    apt upgrade -y
    snap refresh

    echo "Set up password-less for the vagrant user..."
    echo 'vagrant ALL=(ALL) NOPASSWD:ALL' >/etc/sudoers.d/99_vagrant;
    chmod 440 /etc/sudoers.d/99_vagrant;

    echo "Disabling UseDNS on ssh ..."
    sed -i 's/#UseDNS no/UseDNS no/' /etc/ssh/sshd_config

    tee /etc/dconf/profile/user >/dev/null <<'EOF'
user-db:user
system-db:local
EOF
    
    mkdir -p /etc/dconf/db/local.d
    tee /etc/dconf/db/local.d/00-disable-lock >/dev/null <<'EOF'
[org/gnome/desktop/session]
idle-delay=0

[org/gnome/desktop/screensaver]
lock-enabled=false
idle-activation-enabled=false
EOF
    dconf update

}

vagrant_entry(){
    echo "Enabling auto-login for the vagrant user..."
    sed -i 's/^# *AutomaticLoginEnable = true/AutomaticLoginEnable = true/' /etc/gdm3/custom.conf
    sed -i 's/^# *AutomaticLogin = user1/AutomaticLogin = vagrant/' /etc/gdm3/custom.conf

    echo "installing vagrant insecure public key..."
    mkdir -p /home/vagrant/.ssh/
    echo 'ssh-rsa AAAAB3NzaC1yc2EAAAABIwAAAQEA6NF8iallvQVp22WDkTkyrtvp9eWW6A8YVr+kz4TjGYe7gHzIw+niNltGEFHzD8+v1I2YJ6oXevct1YeS0o9HZyN1Q9qgCgzUFtdOKLv6IedplqoPkcmF0aYet2PkEDo3MlTBckFXPITAMzF8dJSIFo9D8HfdOV0IAdx4O7PtixWKn5y2hMNG0zQPyUecp4pzC6kivAIhyfHilFR61RGL+GPXQ2MWZWFYbAGjyiYJnAmCP3NOTd0jMZEnDkbUvxhMmBYSdETk1rRgm+R4LOzFUGaHqHDLKLX+FIPKcF96hrucXzcWyLbIbEgE98OHlnVYCzRdK8jlqm8tehUc9c9WhQ== vagrant insecure public key' | tee -a /home/vagrant/.ssh/authorized_keys
    echo 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIN1YdxBpNlzxDqfJyw/QKow1F+wvG9hXGoqiysfJOn5Y vagrant insecure public key' | tee --append /home/vagrant/.ssh/authorized_keys

    chmod 0700 /home/vagrant/.ssh
    chmod 0600 /home/vagrant/.ssh/authorized_keys
    chown 1000:1000 /home/vagrant/.ssh/authorized_keys || true

}

test(){
    echo "Entry executed successfully!!"
}

$@
