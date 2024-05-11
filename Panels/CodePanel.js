import BasePanel from './BasePanel';

class CodePanel extends BasePanel {
  constructor(title) {
    super(title);
    this.addCode('code');
  }
  setCode = (html) => this.setHtmlById('code', html);
}

export default CodePanel;