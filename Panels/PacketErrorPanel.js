import BasePanel from './BasePanel';

class PacketErrorPanel extends BasePanel {
  constructor() {
    super('Packet Errors');

    this.openField('CRC Check');
    this.addDynamicText('crc', 'N/A');
    this.closeField();

    this.openField('CRC Size Check');
    this.addDynamicText('crc-size', 'N/A');
    this.closeField();

    this.openField('Failed Packets');
    this.addDynamicText('failed-packet-count', 'N/A');
    this.closeField();

    this.openField('Successful Packets');
    this.addDynamicText('successful-packet-count', 'N/A');
    this.closeField();

    this.addSection('Packet Retransmission')

    this.addRadios('repeat', [
      { text: 'Automatic Repeat Request', id:'arq', value: 'arq', checked: true, eventName: 'automaticRepeatRequestChange' },
      { text: 'Manual Repeat Request', id:'manual', value: 'manual', checked: true, eventName: 'manualRepeatRequestChange' }
    ]);
  
    this.openField('Packets');
    this.addInputText('request-packet-indexes', '');
    this.closeField();

    this.addButton('request-button', 'Request', 'requestPackets');
  }
  getAutomaticRepeatRequest = () => {
    return this.getCheckedById('arq');
  }
  reset = () => {
    this.setFailedPacketIndeces([]);
    this.setFailedPacketCountUnavailable();
    this.setSizeCrcUnavailable();
    this.setCrcUnavailable();
    this.setSuccessfulPacketCountUnavailable();
  }
  setFailedPacketIndeces = (packetIndexes) => {
    this.setValueById('request-packet-indexes', packetIndexes.join(', '));
    this.setValueById('failed-packet-count', packetIndexes.length.toLocaleString());
  }
  setFailedPacketCountUnavailable = () => this.setValueById('failed-packet-count', 'N/A');
  getFailedPacketIndeces = () => {
    let text = this.getValueById('request-packet-indexes');
    return text.replace(/\s+/g, '').split(',').filter(v => v !== '').map(Number);
  }
  setCrcPassed = (passed) => this.setValueById('crc', passed ? 'Pass' : 'Fail');
  setCrcUnavailable = () => this.setValueById('crc', 'N/A');
  setSizeCrcPassed = (passed) => this.setValueById('crc-size', passed ? 'Pass' : 'Fail');
  setSizeCrcUnavailable = () => this.setValueById('crc-size', 'N/A');
  setSuccessfulPacketCount = (count) => this.setValueById('successful-packet-count', count.toLocaleString());
  setSuccessfulPacketCountUnavailable = () => this.setValueById('successful-packet-count', 'N/A')
}

export default PacketErrorPanel;