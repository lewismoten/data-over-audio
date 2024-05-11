import Dispatcher from "../Dispatcher";

let lastId = 0;
const clamp = (value, min, max) => Math.max(min, Math.min(value, max));

class BasePanel {
  constructor(title) {
    this.dispatcher = new Dispatcher(title);
    this.id = `panel-${lastId++}`;
    this.panel = document.createElement('div');
    this.panel.id = this.id;
    const h2 = document.createElement('h2');
    h2.innerText = title;
    this.panel.appendChild(h2);
    this.container = document.createElement('div');
    this.panel.appendChild(this.container);
  }
  getDomElement = () => this.panel;
  addSection = text => {
    const header = document.createElement('h4');
    header.innerText = text;
    this.append(header);
  }
  addRadios = (name, items) => {
    this.addCheckedInputs('radio', name, items);
  };
  addCheckboxes = (name, items) => {
    this.addCheckedInputs('checkbox', name, items);
  };
  addCheckedInputs = (type, name, items, value) => {
    items.forEach(({id, text, checked = false, eventName = 'change'}, index)=> {
      const label = document.createElement('label');
      const input = document.createElement('input');
      input.type = type;
      input.name = name;
      input.checked = checked;
      input.value = value;
      input.id = this.childId(id);
      input.addEventListener('change', e => {
        this.dispatcher.emit(eventName, {
          name,
          id,
          index,
          checked: e.target.checked,
          value
        });
      })
      label.appendChild(input);
      const textNode = document.createTextNode(text);
      label.append(textNode);
      this.append(label);
      const br = document.createElement('br');
      this.append(br);
    });
  }
  addInputText = (id, value, eventName = 'input') => {
    const input = document.createElement('input');
    input.type = 'text';
    input.value = value;
    input.id = this.childId(id);
    input.addEventListener('input', e => {
      this.dispatcher.emit(eventName, {
        panel: this.id,
        id,
        value
      });
    });
    this.append(input);
  }
  addButton = (id, text, eventName = 'click') => {
    const button = document.createElement('button');
    button.id = this.childId(id);
    button.innerText = text;
    button.addEventListener('click', e => {
      this.dispatcher.emit(eventName, {
        panel: this.id,
        id,
        text
      });
    });
    this.append(button);
  }
  addProgressBar = (id, percent) => {
    const progressBar = document.createElement('div');
    progressBar.className = 'progress-container';
    const bar = document.createElement('div');
    bar.id = this.childId(id);
    bar.className = 'progress-bar';
    bar.style.width = `${clamp(percent, 0, 1) * 100}%`;
    progressBar.append(bar);
    this.append(progressBar);
  }
  setProgressById = (id, percent) => {
    const element = document.getElementById(this.childId(id));
    if(!element) throw new Error(`Unable to find ${id}`);
    element.style.width = `${clamp(percent, 0, 1) * 100}%`;
  }
  childId = id => `${this.id}-${id}`;
  getElement = id => {
    const element = document.getElementById(this.childId(id));
    if(!element) throw new Error(`Unable to find ${id}`);
    return element;
  }
  addCode = (id, value = '', type = '') => {
    const code = document.createElement('div');
    code.id = this.childId(id);
    code.innerText = value;
    code.className = type === '' ? 'raw-data' : `raw-data-${type}`;
    this.append(code);
  }
  setValueById = (id, value) => {
    const element = this.getElement(id);
    switch(element.tagName) {
      case 'INPUT':
      case 'SELECT':
        element.value = value;
        break;
      default:
        element.innerText = value;
    }
  }
  setHtmlById = (id, html) => {
    const element = this.getElement(id);
    element.innerHTML = html;
  }
  getValueById = (id) => {
    const element = this.getElement(id);
    switch(element.tagName) {
      case 'INPUT':
      case 'SELECT':
        return element.value;
      default:
        return element.innerText;
    }
  }
  setCheckedById = (id, checked = true) => {
    this.getElement(id).checked = !!checked;
  }
  getCheckedById = (id) => !!(this.getElement(id).checked);
  append = (element) => this.container.appendChild(element);
  clear = () => this.container.innerHTML = '';
  addEventListener = (eventName, callback) => this.dispatcher.addListener(eventName, callback);
  removeEventListener = (eventName, callback) => this.dispatcher.removeListener(eventName, callback);
}

export default BasePanel;