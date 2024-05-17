import BasePanel from './BasePanel.js';

class OutputPanel extends BasePanel {
  constructor() {
    super('Outut');
    this.addRadios('send-via', [
      {text: 'Analyzer', id: 'send-via-analyzer', eventName: 'sendAnalyzerChange'},
      {text: 'Speakers', id: 'send-via-speaker', eventName: 'sendSpeakersChange'}
    ]);
  }
  setSendSpeakers = checked => this.setCheckedById('send-via-speaker', checked);
  setSendAnalyzer = checked => this.setCheckedById('send-via-analyzer', checked);
}

export default OutputPanel;