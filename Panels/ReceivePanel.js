import { bytesToText, bytesToUrl } from '../converters';
import BasePanel from './BasePanel';
import * as AudioReceiver from '../AudioReceiver';
import * as StreamManager from '../StreamManager';

class ReceivePanel extends BasePanel {
  constructor() {
    super('Audio Receiver');
    this.addRadios('online', [
      {id: 'is-offline', text: 'Offline', value: 'offline', checked: true, eventName: 'offlineChange'},
      {id: 'is-online', text: 'Online', value: 'online', eventName: 'onlineChange'}
    ]);
    this.addButton('reset', 'Reset Data', 'resetClick');

    this.addNewLine();
    this.addDynamicText('id-state', 'Offline.');

    this.addProgressBar('progress', .50);

    this.addCode('text', '', 'small');
    this.addImage('image', undefined, {width: 32, height: 32});
    this.setDataType('text');

    this.dispatcher.addListener('onlineChange', (e) => {
      this.setValueById('id-state', 'Ready');
      AudioReceiver.start();
    })
    this.dispatcher.addListener('offlineChange', (e) => {
      this.setValueById('id-state', 'Offline');
      AudioReceiver.stop();
    })
    AudioReceiver.addEventListener('begin', (...args) => {
      this.setValueById('id-state', 'Signal Started');
      this.dispatcher.emit('begin', ...args)
    });
    AudioReceiver.addEventListener('receive', (...args) => {
      this.setValueById('id-state', `Sample Period ${args[0].signalIndex}`)
      this.dispatcher.emit('receive', ...args)
    });
    AudioReceiver.addEventListener('end', (...args) => {
      this.setValueById('id-state', 'Signal Ended');
      this.dispatcher.emit('end', ...args)
    });

    this.addEventListener('resetClick', () => {
      AudioReceiver.reset();
      StreamManager.reset();
    });
  }
  isOnline = () => this.getCheckedById('is-online');
  setIsOnline = isOnline => {
    this.setCheckedById(isOnline ? 'is-online' : 'is-offline', true);
    if(isOnline) {
      AudioReceiver.start();
      this.setValueById('id-state', 'Ready');
    } else {
      AudioReceiver.stop();
      this.setValueById('id-state', 'offline');
    }
  }

  // waitForSignal = () => {
  //   AudioReceiver.start();
  // }
  // reset = () => {
  //   AudioReceiver.reset();
  //   StreamManager.reset();  
  // }
  // stopWaitingForSignal = () => {
  //   AudioReceiver.stop();
  // }
  setProgress = percent => this.setProgressById('progress', percent);
  setReceivedHtml = (html) => this.setHtmlById('text', html);
  setReceivedBytes = bytes => {
    if(this.dataType === 'text') {
      this.setValueById('text', bytesToText(bytes));
    } else {
      this.setValueById('image', bytesToUrl(bytes));
    }
  }

  setDataType = (value) => {
    this.dataType = value;
    this.display('text', value === 'text');
    this.display('image', value === 'image');
  }
}

export default ReceivePanel;