import BasePanel from './BasePanel';
import { byteSize } from '../Humanize';

class PacketizationPanel extends BasePanel {
  constructor() {
    super('Packetization');

    this.openField('Max Data Size');
    this.addText('2^');
    this.addInputNumber('data-size-power', 16, {min: 0, max: 32, eventName: 'dataSizePowerChange', translation: 'power of 2'});
    this.addText(' ');
    this.addDynamicText('data-size', 'n/a')
    this.closeField();

    this.openField('CRC on Size');
    this.addDropdown('data-size-crc', [
      {text: 'None', value: 0},
      {text: 'CRC-8', value: 8},
      {text: 'CRC-16', value: 16},
      {text: 'CRC-32', value: 32},
    ], 'dataSizeCrcChange');
    this.closeField();

    this.openField('CRC on Data');
    this.addDropdown('data-crc', [
      {text: 'None', value: 0},
      {text: 'CRC-8', value: 8},
      {text: 'CRC-16', value: 16},
      {text: 'CRC-32', value: 32},
    ], 'dataCrcChange');
    this.closeField();

    this.addSection('Packets');
    this.openField('Size');
    this.addText('2^');
    this.addInputNumber('size-power', 5, {min: 0, max: 16, eventName: 'sizePowerChange', translation: 'power of 2'});
    this.addText(' ');
    this.addDynamicText('size', 'n/a')
    this.closeField();

    this.addCheckboxes('packet-encoding', [
      { text: 'Error Correction', id: 'error-correction', checked: true, eventName: 'errorCorrectionChange' },
    ]);
    

    this.addSection('Sampling Period');

    this.addCheckboxes('packet-encoding', [
      { text: 'Interleaving', id: 'interleaving', checked: true, eventName: 'interleavingChange' },
    ]);

    this.addEventListener('sizePowerChange', this.handleSizePowerChange);
    this.dispatcher.emit('sizePowerChange', {value: this.getSize()});

    this.addEventListener('dataSizePowerChange', this.handleDataSizePowerChange);
    this.dispatcher.emit('dataSizePowerChange', {value: this.getDataSizePower()});
    this.dispatcher.emit('dataSizeChange', {value: this.getDataSize()});
  };

  getSizePower = () => this.getNumberById('size-power');
  setSizePower = (value) => {
    this.setValueById('size-power', value);
    this.handleSizePowerChange({value});
  }
  getSize = () => 2 ** this.getSizePower();
  handleSizePowerChange = () => {
    this.setValueById('size', byteSize(this.getSize()));
  }

  getDataSizePower = () => this.getNumberById('data-size-power');
  setDataSizePower = (value) => {
    this.setValueById('data-size-power', value);
    this.handleDataSizePowerChange({value});
  }
  getDataSize = () => 2 ** this.getDataSizePower();
  handleDataSizePowerChange = () => {
    this.setValueById('data-size', byteSize(this.getDataSize()));
  }

  getDataSizeCrc = () => this.getNumberById('data-size-crc');
  setDataSizeCrc = bitLength => this.setValueById('data-size-crc', bitLength)

  getDataCrc = () => this.getNumberById('data-crc');
  setDataCrc = bitLength => this.setValueById('data-crc', bitLength)

  getInterleaving = () => this.getCheckedById('interleaving');
  setInterleaving = (value) => this.setCheckedById('interleaving', value);

  getErrorCorrection = () => this.getCheckedById('error-correction');
  setErrorCorrection = (value) => this.setCheckedById('error-correction', value);
}

export default PacketizationPanel;