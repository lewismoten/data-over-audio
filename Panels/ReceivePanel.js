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

    this.addProgressBar('progress', 0, 0);

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
      this.setReceivedBytes([]);
      this.setExpectedPacketCount(0);
      this.setFailedPacketCount(0);
      this.setSuccessfulPacketCount(0);
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
  setProgress = (percent, percent2 = 0) => {
    this.setProgressById('progress', percent, percent2);
  }
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

  setSuccessfulPacketCount = (count) => {
    this.successfulPacketCount = count;
    this.updateProgressBar();
  }
  setExpectedPacketCount = (count) => {
    this.expectedPacketCount = count;
    this.updateProgressBar();
  }
  setFailedPacketCount = (count) => {
    this.failedPacketCount = count;
    this.updateProgressBar();
  }
  updateProgressBar = () => {
    const total = this.expectedPacketCount;
    if(total === 0) {
      this.setProgress(0, 0);
    }
    this.setProgress(
      this.successfulPacketCount/total,
      this.failedPacketCount/total
    )
  }

}

export default ReceivePanel;