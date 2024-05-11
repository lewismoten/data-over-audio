import BasePanel from './BasePanel';

class MessagePanel extends BasePanel {
  constructor() {
    super('Message');
    this.addInputText('text-to-send', '', 'messageChange');
    this.addButton('send-button', 'Send', 'send');    
    this.addSection('Received');
    this.addProgressBar('received-progress', .50);
    this.addCode('decoded-text', '', 'small');
  }
  getSendButtonText = () => this.getValueById('send-button');
  setSendButtonText = text => this.setValueById('send-button', text);
  setMessage = text => this.setValueById('text-to-send', text);
  getMessage = () => this.getValueById('text-to-send');
  setProgress = percent => this.setProgressById('received-progress', percent);
  setReceived = (html) => this.setHtmlById('decoded-text', html);
}

export default MessagePanel;