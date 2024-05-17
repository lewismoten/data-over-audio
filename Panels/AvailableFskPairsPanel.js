import BasePanel from './BasePanel.js';
import { hertz } from '../Humanize.js';
class AvailableFskPairsPanel extends BasePanel {
  constructor() {
    super('Available FSK Pairs');
    this.exclude = [];
    this.fskPairs = [];
    this.originalSelectedFskPairs = [];
    this.sampleRate = 48000;

    this.addCanvas('fsk-spectrum', 200, 32);
    this.addNewLine();

    this.addCheckboxes('fsk-pairs', this.fskPairs);
    this.addDynamicText('fsk-available', 'None');

    this.addEventListener('select', this.handleSelect);

    this.drawFskSpectrum();
  };
  setSampleRate = (value) => {
    this.sampleRate = value;
    this.drawFskSpectrum();
  }

  handleSelect = (event) => {
    if(event.checked) {
      this.exclude = this.exclude.filter(id => id !== event.id)
    } else if(!this.exclude.includes(event.id)) {
      this.exclude.push(event.id);
    }
    this.checkChanges();
    this.drawFskSpectrum();
  };

  checkChanges = () => {
    const selected = this.getSelectedFskPairs();
    const original = this.originalSelectedFskPairs;
    let changed = false;
    if(original.length !== selected.length) {
      changed = true;
    } else {
      const hertz = selected.flat();
      changed = original.flat().some((hz, i) => hz !== hertz[i]);
    }
    if(changed) {
      this.originalSelectedFskPairs = selected;
      this.dispatcher.emit('change', {selected});
    }
  }
  getSelectedFskPairs = () => this.fskPairs
    .filter(this.isSelected);
  
  getSelectedIndexes = () => this.fskPairs.map((_, id) => id).filter(id => !this.exclude.includes(id));
  setSelectedIndexes = (values) => {
    this.exclude = values;
    this.setFskPairs(this.fskPairs);
    this.checkChanges();
  }
  
  setFskPairs = fskPairs => {
    this.fskPairs = fskPairs;
    this.setValueById('fsk-available', fskPairs.length === 0 ? 'None' : '');
    const items = fskPairs.map(([lowHz, highHz], index) => ({
        text: `${index}: ${hertz(lowHz)} / ${hertz(highHz)}`,
        id: index,
        value: index,
        checked: !this.exclude.includes(index),
        eventName: 'select'
    }));
    this.replaceCheckedInputs('checkbox', 'fsk-pairs', items);
    this.checkChanges();
    this.drawFskSpectrum();
  }

  drawFskSpectrum = () => {
    
    const ultimateFrequency = this.sampleRate / 2;
    const fskPairs = this.fskPairs;
    const canvas = this.getElement('fsk-spectrum');
    const ctx = canvas.getContext('2d');
    const {height, width} = canvas;
    ctx.clearRect(0, 0, width, height);

    if(fskPairs.length === 0) return;
    const minHz = fskPairs.reduce(
      (min, fsk) => {
        const lowestHz = fsk.reduce((min, hz) => Math.min(min, hz), Infinity)
        return Math.min(min, lowestHz)
      }, Infinity
    );
    const maxHz = fskPairs.reduce(
      (max, fsk) => {
        const lowestHz = fsk.reduce((max, hz) => Math.max(max, hz), -Infinity)
        return Math.max(max, lowestHz)
      }, -Infinity
    );
    const range = maxHz - minHz;

    // Human Hearing
    let x1 = Math.max(0, ((20-minHz)/range) * width);
    let x2 = Math.min(width, ((20000-minHz)/range) * width);
    if(x1 !== x2) {
      ctx.fillStyle = 'hsla(0, 0%, 100%, 20%)';
      ctx.fillRect(
        x1,
        0,
        x2 - x1,
        height
      );
    }

    // Telephone
    x1 = Math.max(0, ((300-minHz)/range) * width);
    x2 = Math.min(width, ((3400-minHz)/range) * width);
    if(x1 !== x2) {
      ctx.fillStyle = 'hsla(60, 50%, 50%, 20%)';
      ctx.fillRect(
        x1,
        0,
        x2 - x1,
        height
      );
    }

    ctx.lineWith = 1;
    const plotHz = hz => {
      const hue = Math.floor(hz/ultimateFrequency * 360);
      ctx.strokeStyle = `hsl(${hue}, 100%, 50%)`;
      const x = ((hz-minHz) / range) * width;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }

    fskPairs.filter(this.isSelected).forEach(fsk => fsk.forEach(plotHz));
  }
  isSelected = (delude, allude) => !this.exclude.includes(allude);
}

export default AvailableFskPairsPanel;