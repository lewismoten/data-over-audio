import BasePanel from './BasePanel';

class FrequencyPanel extends BasePanel {
  constructor(sampleRate = 48000) {
    super('Frequencies');

    this.sampleRate = sampleRate;
    const ultimateFrequency = sampleRate / 2;

    this.openField('Minimum');
    this.addInputNumber('minimum-frequency', 0, {min: 0, max: ultimateFrequency, eventName: 'minimumFrequencyChange'});
    this.closeField();

    this.openField('Maximum');
    this.addInputNumber('maximum-frequency', ultimateFrequency, {min: 0, max: ultimateFrequency, eventName: 'maximumFrequencyChange'});
    this.closeField();

    this.openField('FFT Size');
    this.addText('2^');
    this.addInputNumber('fft-power', 10, {min: 5, max: 15, eventName: 'fftSizeChange', translation: 'power of 2'});
    this.addText(' ');
    this.addDynamicText('fft-size', 'N/A');
    this.closeField();

    this.openField('Frequency Resolution');
    this.addDynamicText('frequency-resolution-size', 'N/A');
    this.addText(' Hz');
    this.closeField();

    this.openField('FSK Padding');
    this.addInputNumber('fsk-padding', 1, {min: 1, max: 20, eventName: 'fskPaddingChange'});
    this.closeField();

    this.openField('Multi-FSK Padding');
    this.addInputNumber('multi-fsk-padding', 0, {min: 0, max: 20, eventName: 'multiFskPaddingChange'});
    this.closeField();

    this.addCanvas('frequency-spectrum', 200, 32);
    this.addNewLine();

    this.openField('FSK Pairs Available');
    this.addDynamicText('fsk-count', 'N/A');
    this.closeField();

    this.addEventListener('multiFskPaddingChange', this.checkFskPairsChanged);
    this.addEventListener('fskPaddingChange', this.checkFskPairsChanged);
    this.addEventListener('fftSizeChange', this.checkFskPairsChanged);
    this.addEventListener('fftSizeChange', this.handleFftSizeChanged);
    this.addEventListener('maximumFrequencyChange', this.checkFskPairsChanged);
    this.addEventListener('minimumFrequencyChange', this.checkFskPairsChanged);
    this.originalFskPairs = this.getFskPairs();
    this.drawFrequencySpectrum();
  };
  getMinimumFrequency = () => parseInt(this.getValueById('minimum-frequency'));
  setMinimumFrequency = value => {
    this.setValueById('minimum-frequency', value);
    this.checkFskPairsChanged();
  };

  getMaximumFrequency = () => parseInt(this.getValueById('maximum-frequency'));
  setMaximumFrequency = value => {
    this.setValueById('maximum-frequency', value);
    this.checkFskPairsChanged();
  }

  getFftSize = () => 2 ** parseInt(this.getValueById('fft-power'));
  setFftSize = (value) => {
    this.setValueById('fft-power', Math.log2(value));
    this.handleFftSizeChanged();
    this.checkFskPairsChanged();
  }

  handleFftSizeChanged = () => {
    const fftSize = this.getFftSize();
    this.setValueById('fft-size', fftSize.toLocaleString());
    const resolution = this.sampleRate / fftSize;
    this.setValueById('frequency-resolution-size', parseFloat(resolution.toFixed(1)).toLocaleString());
  }

  getFskPadding = () =>  parseInt(this.getValueById('fsk-padding'));
  setFskPadding = (value) => {
    this.setValueById('fsk-padding', value);
    this.checkFskPairsChanged();
  }

  getMultiFskPadding = () =>  parseInt(this.getValueById('multi-fsk-padding'));
  setMultiFskPadding = (value) => {
    this.setValueById('multi-fsk-padding', value);
    this.checkFskPairsChanged();
  }

  checkFskPairsChanged = () => {
    const original = this.originalFskPairs;
    const current = this.getFskPairs();
    let changed = true;
    if(original.length !== current.length) {
      changed = true;
    } else {
      changed = original.some(
        (fsk, fskIndex) => {
          return fsk.some((hz, hzIndex) => hz !== original[fskIndex][hzIndex]);
        })
    }
    if(changed) {
      this.originalFskPairs = current;
      this.setValueById('fsk-count', current.length.toLocaleString());
      this.drawFrequencySpectrum();
      this.dispatcher.emit('fskPairsChange', {value: current});
    }
  }
  getFskPairs = () => {
    const sampleRate = this.sampleRate;
    const fftSize = this.getFftSize();
    const fskPadding = this.getFskPadding();
    const multiFskPadding = this.getMultiFskPadding();
    const frequencyResolution = sampleRate / fftSize;
    const fskPairs = [];
    const multiFskStep = frequencyResolution * (2 + multiFskPadding) * fskPadding;
    const minimumFrequency = this.getMinimumFrequency();
    const maximumFrequency = this.getMaximumFrequency();
    for(let hz = minimumFrequency; hz < maximumFrequency; hz+= multiFskStep) {
      const lowHz = hz;
      const highHz = hz + frequencyResolution * fskPadding;
      if(lowHz < minimumFrequency) continue;
      if(highHz > maximumFrequency) break;
      fskPairs.push([lowHz, highHz]);
    }
    return fskPairs;
  }
  drawFrequencySpectrum = () => {
    const ultimateFrequency = this.sampleRate / 2;
    const fskPairs = this.getFskPairs();
    const canvas = this.getElement('frequency-spectrum');
    const ctx = canvas.getContext('2d');
    const {height, width} = canvas;
    ctx.clearRect(0, 0, width, height);

    // Human Hearing
    let x1 = (20/ultimateFrequency) * width;
    let x2 = (20000/ultimateFrequency) * width;
    ctx.fillStyle = 'hsla(0, 0%, 100%, 20%)';
    ctx.fillRect(
      x1,
      0,
      x2 - x1,
      height
    );
    // Telephone
    x1 = (300/ultimateFrequency) * width;
    x2 = (3400/ultimateFrequency) * width;
    ctx.fillStyle = 'hsla(60, 50%, 50%, 20%)';
    ctx.fillRect(
      x1,
      0,
      x2 - x1,
      height
    );

    ctx.lineWith = 1;
    const plotHz = hz => {
      const percent = (hz / ultimateFrequency);
      const hue = Math.floor(percent * 360);
      ctx.strokeStyle = `hsl(${hue}, 100%, 50%)`;
      const x = percent * width;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }

    fskPairs.forEach(fsk => fsk.forEach(plotHz));
  }

}

export default FrequencyPanel;