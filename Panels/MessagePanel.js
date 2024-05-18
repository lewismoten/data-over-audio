import { bytesToText, textToBytes, urlToBytes, bytesToUrl } from '../converters.js';
import { byteSize } from '../Humanize.js';
import BasePanel from './BasePanel.js';

class MessagePanel extends BasePanel {
  constructor() {
    super('Message');

    this.openField('Data Type');
    this.addDropdown('data-type', [
      {text: 'Text', value: 'text', selected: true},
      {text: 'Image', value: 'image'}
    ], 'dataTypeChange');
    this.closeField();

    this.openField('Text', 'field-text');
    this.addInputText('text-to-send', '', {eventName: 'messageChange'});
    this.closeField();

    this.openField('Image', 'field-image');
    this.addImage('image-to-send', 'interlaced-sample.gif', {eventName: 'messageChange'});
    this.closeField();

    this.addButton('send-button', 'Send', 'send-button-click');    
    this.addNewLine();

    this.openField('Bytes');
    this.addDynamicText('bytes', 0);
    this.closeField();

    this.addCheckboxes('packet-options', [
      { text: 'Send First Packet Twice', id: 'first-packet-twice', checked: true },
    ]);

    this.addEventListener('send-button-click', () => {
      if(this.getSendButtonText() === 'Send') {
        this.dispatcher.emit('sendClick');
      } else {
        this.dispatcher.emit('stopClick');
      }
    })

    this.addEventListener('dataTypeChange', ({values: [value]}) => {
      this.setValueById('bytes', byteSize(this.getMessageBytes().length));
      this.display('field-image', value === 'image');
      this.display('field-text', value === 'text');
    });
    this.addEventListener('messageChange', e => {
      this.setValueById('bytes', byteSize(this.getMessageBytes().length));
    });
    this.dispatcher.emit('dataTypeChange', {values: [this.getDataType()]});
  }
  setIsFirstPacketSentTwice = (checked) => this.setCheckedById('first-packet-twice', checked);
  getIsFirstPacketSentTwice = () => this.getCheckedById('first-packet-twice');
  getSendButtonText = () => this.getValueById('send-button');
  setSendButtonText = text => this.setValueById('send-button', text);
  setMessageText = text => {
    this.setValueById('text-to-send', text);
    this.setValueById('bytes', byteSize(textToBytes(text).length));
  }
  getMessageText = () => this.getValueById('text-to-send');
  getMessageBytes = () => {
    if(this.getDataType() === 'text') {
      return textToBytes(this.getMessageText());
    } else {
      return urlToBytes(this.getElement('image-to-send').src);
    }
  }

  getDataType = () => this.getValueById('data-type');
  setDataType = (value) => {
    this.setValueById('data-type', value);

    this.dispatcher.emit('dataTypeChange', {values: [value]});
  }
}

export default MessagePanel;