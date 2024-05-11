import BasePanel from './BasePanel';

class CommunicationsPanel extends BasePanel {
  constructor() {
    super('Communications');
    this.addSection('Send');
    this.addRadios('send-via', [
      {text: 'Analyzer', id: 'send-via-analyzer', eventName: 'sendAnalyzerChange'},
      {text: 'Speakers', id: 'send-via-speaker', eventName: 'sendSpeakersChange'}
    ]);
    this.addSection('Receive');
    this.addCheckboxes('receive-via', [
      {text: 'Listening', id: 'is-listening-checkbox', eventName: 'listeningChange'}
    ]);
  }
  isListeningChecked = () => {
    return this.getCheckedById('is-listening-checkbox');
  }
  setListening = checked => this.setCheckedById('is-listening-checkbox', checked);
  setSendSpeakers = checked => this.setCheckedById('send-via-speaker', checked);
  setSendAnalyzer = checked => this.setCheckedById('send-via-analyzer', checked);
}

export default CommunicationsPanel;