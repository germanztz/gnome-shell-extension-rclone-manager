const St = imports.gi.St;
const GObject = imports.gi.GObject;
const ModalDialog = imports.ui.modalDialog;
const CheckBox = imports.ui.checkBox;
const Clutter = imports.gi.Clutter;

let _openDialog;

function openConfirmDialog(title, message, sub_message, ok_label, cancel_label, callback) {
  log('openConfirmDialog');
  if (!_openDialog)
    _openDialog = new ConfirmDialog(title, message + "\n" + sub_message, ok_label, cancel_label, callback).open();
}

const ConfirmDialog = GObject.registerClass(
  class ConfirmDialog extends ModalDialog.ModalDialog {

    _init(title, desc, ok_label, cancel_label, callback) {
      super._init();

      log('ConfirmDialog._init()');
      let main_box = new St.BoxLayout({
        vertical: false
      });
      this.contentLayout.add_child(main_box);

      let message_box = new St.BoxLayout({
        vertical: true
      });
      main_box.add_child(message_box);

      let subject_label = new St.Label({
        style: 'font-weight: bold;',
        x_align: Clutter.ActorAlign.CENTER,
        text: title
      });
      message_box.add_child(subject_label);

      let desc_label = new St.Label({
        style: 'padding-top: 12px;',
        x_align: Clutter.ActorAlign.CENTER,
        text: desc
      });
      desc_label.clutter_text.line_wrap = true;

      let desc_scroll = new St.ScrollView();
      let desc_box = new St.BoxLayout({ vertical: true });
      desc_box.add_actor(desc_label);
      desc_scroll.add_actor(desc_box);

      message_box.add_actor(desc_scroll);

      let buttons = [{
        label: ok_label,
        action: () => {
          this.close();
          callback && callback();
          _openDialog = null;
        }
      }]
      if(cancel_label) buttons.push({
        label: cancel_label,
        action: () => {
          this.close();
          _openDialog = null;
        },
        key: Clutter.Escape
      })
      this.setButtons(buttons);
    }
  }
);
