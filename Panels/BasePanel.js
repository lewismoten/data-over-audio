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
  openField = name => this.addText(`${name}: `);
  addText = text => this.append(document.createTextNode(text));
  addDynamicText = (id, text) => {
    const span = document.createElement('span');
    span.id = this.childId(id);
    span.innerText = text;
    return this.append(span);
  }
  closeField = () => this.addNewLine();
  addNewLine = () => this.append(document.createElement('br'));
  addDropdown = (id, items, eventName = 'change') => {
    const select = document.createElement('select');
    select.id = this.childId(id);
    select.addEventListener('change', (e) => {
      const values = [...select.selectedOptions].map(option => option.value);
      this.dispatcher.emit(eventName, {
        id,
        values
      });
    });
    items.forEach((item, i) => {
      const option = document.createElement('option');
      option.value = item.value;
      option.text = item.text;
      if(item.selected) {
        if(select.selectedIndex === -1) {
          select.selectedIndex = i;
        }
        option.selected = item.selected;
      }
      select.append(option);
    });
    if(select.selectedIndex === -1 && items.length !== 0) {
      select.selectedIndex = 0;
    }
    this.append(select);
  }
  addCheckedInputs = (type, name, items, value) => {
    const div = document.createElement('div');
    div.id = this.childId(name);
    this.createCheckedInputs(type, name, items, value)
      .forEach(element => div.appendChild(element));
    this.append(div);
  }
  replaceCheckedInputs = (type, name, items, value) => {
    const div = this.getElement(name);
    div.innerHTML = '';
    this.createCheckedInputs(type, name, items, value)
      .forEach(element => div.appendChild(element));
  }
  createCheckedInputs = (type, name, items, value) => {
    const elements = [];
    items.forEach(({id, text, checked = false, eventName = 'change'})=> {
      const label = document.createElement('label');
      label.for = this.childId(id);
      const input = this.createInput(id, value, {name, checked, type, eventName});
      label.appendChild(input);
      const textNode = document.createTextNode(text);
      label.append(textNode);
      elements.push(label);
      elements.push(document.createElement('br'));
    });
    return elements;
  }
  addInputText = (id, value, options = {}) => {
    this.append(this.createInput(id, value, {...options, type: 'text'}));
  }
  addInputNumber = (id, value, options = {}) => {
    this.append(this.createInput(id, value, {...options, type: 'number'}));
  }
  createInput = (id, value = '', options = {}) => {
    const {
      eventName = 'input',
      type = 'text',
      translation,
      ...attr
    } = options;
    const input = document.createElement('input');
    input.value = value;
    input.id = this.childId(id);
    input.type = type;
    if(['radio', 'checkbox'].includes(type)) {
      input.addEventListener('change', e => {
        this.dispatcher.emit(eventName, {
          id,
          checked: e.target.checked,
          value
        });
      })
    } else {
      input.addEventListener('input', e => {
        this.dispatcher.emit(eventName, {
          panel: this.id,
          id,
          value: translateValue(e.target.value, translation)
        });
      });
    }
    Object.keys(attr).forEach(key => {
      input[key] = options[key];
    })
    return input;
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
  addCanvas = (id, width, height) => {
    const canvas = document.createElement('canvas');
    canvas.id = this.childId(id);
    canvas.width = width;
    canvas.height = height;
    return this.append(canvas);
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
    const element = this.getDomElement().querySelector(`#${this.childId(id)}`);
    // const element = document.getElementById(this.childId(id));
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
  getNumberById = id => {
    const value = this.getValueById(id);
    return parseFloat(value);
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
const translateValue = (value, translation) => {
  if(!translation) return value;
  if(translation === 'percent') {
    return parseInt(value) / 100;
  } else if(translation === 'power of 2') {
    return 2 ** parseInt(value);
  }
  console.warn('Unknown translation', translation)
  return value;
}

export default BasePanel;