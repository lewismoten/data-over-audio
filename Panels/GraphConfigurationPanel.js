import BasePanel from './BasePanel.js';

class GraphConfigurationPanel extends BasePanel {
  constructor() {
    super('Graphs');
    this.addCheckboxes('checkboxes', [
      {text: 'Pause after signal ends', id: 'pause-after-end', eventName: 'pauseAfterEndChange'}
    ])
    this.openField('Duration');
    this.addInputNumber('duration', 1, {min: 0.03, max: 10, step: 0.001, eventName: 'durationChange'});
    this.addText('s');
    this.closeField();
  };

  getDurationSeconds = () => this.getNumberById('duration');
  setDurationSeconds = (seconds) => this.setValueById('duration', seconds);

  getDurationMilliseconds = () => this.getDurationSeconds() * 1000;
  setDurationMilliseconds = (milliseconds) => this.setDurationSeconds(milliseconds / 1000);

  getPauseAfterEnd = () => this.getCheckedById('pause-after-end');
  setPauseAfterEnd = (value) => this.setCheckedById('pause-after-end', value);

}

export default GraphConfigurationPanel;