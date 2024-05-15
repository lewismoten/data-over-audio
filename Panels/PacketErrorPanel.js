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
    this.addDynamicText('failed-packet-count-percent', '');
    this.closeField();

    this.addSection('Packet Retransmission')

    this.addRadios('repeat', [
      { text: 'Automatic Repeat Request', value: 'arq', checked: true, eventName: 'hi' },
      { text: 'Manual Repeat Request', value: 'manual', checked: true, eventName: 'hi' }
    ]);
  
    this.openField('Packets');
    this.addInputText('request-packet-indexes', '');
    this.closeField();

    this.addButton('request-button', 'Request', 'requestPackets');
  }
  reset = () => {
    this.setFailedPacketIndeces([]);
    this.setSizeCrcUnavailable();
    this.setCrcUnavailable();
  }
  setFailedPacketIndeces = (packetIndexes) => {
    this.setValueById('request-packet-indexes', packetIndexes.join(', '));
    this.setValueById('failed-packet-count', packetIndexes.length.toLocaleString());
  }
  getFailedPacketIndeces = () => {
    let text = this.getValueById('request-packet-indexes');
    return text.replace(/\s+/g, '').split(',').map(Number);
  }
  setCrcPassed = (passed) => this.setValueById('crc', passed ? 'Pass' : 'Fail');
  setCrcUnavailable = () => this.setValueById('crc', 'N/A');
  setSizeCrcPassed = (passed) => this.setValueById('crc-size', passed ? 'Pass' : 'Fail');
  setSizeCrcUnavailable = () => this.setValueById('crc-size', 'N/A');
}

export default PacketErrorPanel;