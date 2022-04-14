/* eslint-disable no-undef */
/* eslint-disable no-unused-vars */
const St = imports.gi.St
const GObject = imports.gi.GObject
const ModalDialog = imports.ui.modalDialog
const CheckBox = imports.ui.checkBox
const Clutter = imports.gi.Clutter

let _openDialog

function openConfirmDialog (title, message, subMessage, okLabel, cancelLabel, callback) {
  log('dlg.openConfirmDialog')
  if (!_openDialog) { _openDialog = new ConfirmDialog(title, message + '\n' + subMessage, okLabel, cancelLabel, callback).open() }
}

const ConfirmDialog = GObject.registerClass(
  class ConfirmDialog extends ModalDialog.ModalDialog {
    _init (title, desc, okLabel, cancelLabel, callback) {
      super._init()

      log('dlg.ConfirmDialog._init()')
      const mainBox = new St.BoxLayout({
        vertical: false
      })
      this.contentLayout.add_child(mainBox)

      const messageBox = new St.BoxLayout({
        vertical: true
      })
      mainBox.add_child(messageBox)

      const subjectLabel = new St.Label({
        style: 'font-weight: bold;',
        x_align: Clutter.ActorAlign.CENTER,
        text: title
      })
      messageBox.add_child(subjectLabel)

      const descLabel = new St.Label({
        style: 'padding-top: 12px;',
        x_align: Clutter.ActorAlign.CENTER,
        text: desc
      })
      descLabel.clutter_text.line_wrap = true

      const descScroll = new St.ScrollView()
      const descBox = new St.BoxLayout({ vertical: true })
      descBox.add_actor(descLabel)
      descScroll.add_actor(descBox)

      messageBox.add_actor(descScroll)

      const buttons = [{
        label: okLabel,
        action: () => {
          this.close()
          callback && callback()
          _openDialog = null
        }
      }]
      if (cancelLabel) {
        buttons.push({
          label: cancelLabel,
          action: () => {
            this.close()
            _openDialog = null
          },
          key: Clutter.Escape
        })
      }
      this.setButtons(buttons)
    }
  }
)
