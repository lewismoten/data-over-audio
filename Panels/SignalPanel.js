import BasePanel from './BasePanel';

const clamp = (value, min, max) => Math.max(min, Math.min(value, max));

class SignalPanel extends BasePanel {
  constructor() {
    super('Signal');
    this.openField('Segment Duration');
    this.addInputNumber('segment-duration', 100, {min: 0, max: 1000, eventName: 'segmentDurationChange'});
    this.addText('ms');
    this.closeField();

    this.addSection('Sending');

    this.openField('Wave Form');
    this.addDropdown('wave-form', [
      { text: 'Sine Wave', value: 'sine'},
      { text: 'Square Wave', value: 'square'},
      { text: 'Sawtooth Wave', value: 'sawtooth'},
      { text: 'Triangle Wave', value: 'triangle'},
    ], {eventName: 'waveformChange'});
    this.closeField();
    
    this.addSection('Receiving');

    this.openField('Amplitude Threshold');
    this.addInputNumber('amplitude-threshold', 50, {min: 0, max: 100, eventName: 'amplitudeThresholdChange', translation: 'percent'});
    this.addText('%');
    this.closeField();

    this.openField('Timeout');
    this.addInputNumber('timeout', 30, {min: 30, max: 1000, eventName: 'timeoutChange'});
    this.addText('ms');
    this.closeField();

    this.openField('Smoothing Time Constant');
    this.addInputNumber('smoothing-time-constant', 0, {min: 0, max: 100, eventName: 'smothingTimeConstantChange', translation: 'percent'});
    this.addText('%');
    this.closeField();
  };

  getTimeoutMilliseconds = () => this.getNumberById('timeout');
  setTimeoutMilliseconds = (milliseconds) => this.setValueById('timeout', milliseconds);
  getWaveform = () => this.getValueById('wave-form');
  setWaveform = (value) => this.setValueById('wave-form', value);

  getSegmentDuration = () => parseInt(this.getValueById('segment-duration'));
  setSegmentDuration = value => this.setValueById('segment-duration', value);

  getAmplitudeThreshold = () => parseInt(this.getValueById('amplitude-threshold')) / 100;
  setAmplitudeThreshold = value => this.setValueById('amplitude-threshold', clamp(value * 100, 0, 100));

  getSmoothingTimeConstant = () => parseInt(this.getValueById('smoothing-time-constant')) / 100;
  setSmoothingTimeConstant = value => this.setValueById('smoothing-time-constant', clamp(value * 100, 0, 100));
}

export default SignalPanel;