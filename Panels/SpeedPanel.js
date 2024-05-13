import BasePanel from './BasePanel';
import * as Humanize from '../Humanize';

class SpeedPanel extends BasePanel {
  constructor() {
    super('Speed');
    this.addSection('Bits per second');

    this.openField('Packetization');
    this.addDynamicText('bps-packetization', 'n/a');
    this.closeField();

    this.openField('Data');
    this.addDynamicText('bps-data', 'n/a');
    this.closeField();

    this.addSection('Duration');

    this.openField('Transfer');
    this.addDynamicText('transfer-duration', 'n/a');
    this.closeField();

    this.addSection('Maximum Data');

    this.openField('Duration');
    this.addDynamicText('max-duration', 'n/a');
    this.closeField();
  };

  setMaximumDurationMilliseconds = (milliseconds) => this.setValueById('max-duration', Humanize.durationMilliseconds(milliseconds));
  setPacketizationBitsPerSecond = (bps) => this.setValueById('bps-packetization', Humanize.bitsPerSecond(bps));
  setDataBitsPerSecond = (bps) => this.setValueById('bps-data', Humanize.bitsPerSecond(bps));
  setTransferDurationMilliseconds = (milliseconds) => this.setValueById('transfer-duration', Humanize.durationMilliseconds(milliseconds))
}

export default SpeedPanel;