import { htmlEncode } from '../converters.js';
import BasePanel from './BasePanel.js';

class CodePanel extends BasePanel {
  constructor(title) {
    super(title);
    this.addCode('code');
  }
  setCode = (html) => this.setHtmlById('code', html);
  appendCode = html => {
    let current = this.getHtmlById('code');
    if(current !== '') current += document.createElement('br').outerHTML;
    this.setHtmlById('code', current + html);
    this.scrollToBottom('code');
  }
  appendText = text => {
    let current = this.getHtmlById('code');
    if(current !== '') current += document.createElement('br').outerHTML;
    this.setHtmlById('code', current + htmlEncode(text));
    this.scrollToBottom('code');
  }
}

export default CodePanel;