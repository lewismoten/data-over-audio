import { bytesToText, textToBytes, urlToBytes, bytesToUrl } from '../converters';
import { byteSize } from '../Humanize';
import BasePanel from './BasePanel';

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

    this.addButton('send-button', 'Send', 'send');    
    this.addNewLine();

    this.openField('Bytes');
    this.addDynamicText('bytes', 0);
    this.closeField();

    this.addSection('Received');

    this.addCode('decoded-text', '', 'small');
    this.addImage('decoded-image', undefined, {width: 32, height: 32});

    this.addProgressBar('received-progress', .50);

    this.addEventListener('dataTypeChange', ({values: [value]}) => {
      this.display('field-text', value === 'text');
      this.display('field-image', value === 'image');
      this.display('decoded-image', value === 'image');
      this.display('decoded-text', value==='text');
      // should be 487 bytes
      this.setValueById('bytes', byteSize(this.getMessageBytes().length));
    });
    this.addEventListener('messageChange', e => {
      this.setValueById('bytes', byteSize(this.getMessageBytes().length));
    });
    this.dispatcher.emit('dataTypeChange', {values: [this.getDataType()]});
  }
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
  setProgress = percent => this.setProgressById('received-progress', percent);
  setReceived = (html) => this.setHtmlById('decoded-text', html);
  setReceivedBytes = bytes => {
    if(this.getDataType() === 'text') {
      this.setReceived(bytesToText(bytes));
    } else {
      this.setValueById('decoded-image', bytesToUrl(bytes));
    }
  }

  getDataType = () => this.getValueById('data-type');
  setDataType = (value) => {
    this.setValueById('data-type', value);
    this.dispatcher.emit('dataTypeChange', {values: [value]});
  }
}

export default MessagePanel;