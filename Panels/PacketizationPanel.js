import BasePanel from './BasePanel';
import { byteSize } from '../Humanize';

class PacketizationPanel extends BasePanel {
  constructor() {
    super('Packetization');

    this.openField('Packet Size');
    this.addText('2^');
    this.addInputNumber('size-power', 5, {min: 0, max: 16, eventName: 'sizePowerChange', translation: 'power of 2'});
    this.addText(' ');
    this.addDynamicText('size')
    this.closeField();

    this.addSection('Encoding');

    this.addCheckboxes('packet-encoding', [
      { text: 'Interleaving', id: 'interleaving', checked: true, eventName: 'interleavingChange' },
      { text: 'Error Correction', id: 'error-correction', checked: true, eventName: 'errorCorrectionChange' },
    ]);

    this.addEventListener('sizePowerChange', this.handleSizePowerChange);
    this.dispatcher.emit('sizePowerChange', {value: this.getSize()});
  };

  getSizePower = () => parseInt(this.getValueById('size-power'));
  setSizePower = (value) => {
    this.setValueById('size-power', value);
    this.handleSizePowerChange({value});
  }
  getSize = () => 2 ** this.getSizePower();
  handleSizePowerChange = () => {
    this.setValueById('size', byteSize(this.getSize()));
  }

  getInterleaving = () => this.getCheckedById('interleaving');
  setInterleaving = (value) => this.setCheckedById('interleaving', value);

  getErrorCorrection = () => this.getCheckedById('error-correction');
  setErrorCorrection = (value) => this.setCheckedById('error-correction', value);
}

export default PacketizationPanel;