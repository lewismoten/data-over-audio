import BasePanel from './BasePanel.js';

class FrequencyGraphPanel extends BasePanel {
  constructor() {
    super('Frequency Graph');
    this.fskPairs = [];
    this.sampleRate = 48000;
    this.samplingPeriod = 30;
    this.signalStart = performance.now();
    this.signalEnd = this.signalStart;
    this.samples = [];
    this.samplesPerGroup = 1;
    this.duration = 200;
    this.amplitudeThreshold = 0;
    this.addButton('toggle', 'Start', 'toggle');
    this.addNewLine();
    this.addCanvas('frequency-graph', 500, 150);
    this.addEventListener('toggle', this.handleToggle);
  };
  setDurationMilliseconds = (millseconds) => {
    this.duration = millseconds;
    if(!this.isRunning()) this.draw();
  }
  setSignalStart = milliseconds => {
    this.signalStart = milliseconds;
  }
  setSignalEnd = milliseconds => {
    this.signalEnd = milliseconds;
  }
  setSamplingPeriod = (milliseconds) => {
    this.samplingPeriod = milliseconds;
    if(!this.isRunning()) this.draw();
  }
  setSamplePeriodsPerGroup = count => {
    this.samplesPerGroup = count;
    if(!this.isRunning()) this.draw();
  }
  setAmplitudeThreshold = value => {
    this.amplitudeThreshold = value;
    if(!this.isRunning()) this.draw();
  }
  setSampleRate = (value) => {
    this.sampleRate = value;
  }
  setFskPairs = fskPairs => {
    this.fskPairs = fskPairs;
    if(!this.isRunning()) this.draw();
  }
  setAnalyser = (analyser) => {
    this.analyser = analyser;
  }
  isRunning = () => !!this.intervalId || !!this.animationFrameId;

  handleToggle = () => {
    if(this.isRunning()) {
      this.stop();
    } else {
      this.start();
    }
  }
  start = () => {
    this.setValueById('toggle', 'Stop');
    if(!this.intervalId) {
      this.intervalId = window.setInterval(this.collectSamples, 5);
    }
    if(!this.animationFrameId) {
      this.animationFrameId = window.requestAnimationFrame(this.draw);
    }
  }
  stop = () => {
    this.setValueById('toggle', 'Start');
    if(this.intervalId) {
      window.clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
    if(this.animationFrameId) {
      window.cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = undefined;
    }
    // final draw
    this.draw(false);
  }
  collectSamples = () => {
    // Nothing to collect
    if(this.fskPairs.length === 0) return;
    // Nothing to collect with
    const analyser = this.analyser;
    if(!analyser) return;

    const frequencyResolution = this.sampleRate / analyser.fftSize;
    const frequencies = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(frequencies);
  
    const indexOfHz = hz => Math.round(hz/frequencyResolution);
    const ampsFromHz = hz => frequencies[indexOfHz(hz)];
    const ampsFromManyHz = fsk => fsk.map(ampsFromHz);
    const now = performance.now();
    this.samples.unshift({
      time: now,
      fskPairs: this.fskPairs.map(ampsFromManyHz)
    });

    this.samples = this.samples.filter(sample => now - sample.time < this.duration);
  }

  draw = () => {
    const maxAmps = 290; // inflated for height
    const ultimateFrequency = this.sampleRate / 2;
    const canvas = this.getElement('frequency-graph');
    const ctx = canvas.getContext('2d');
    const {height, width} = canvas;
    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, width, height);
    let now;

    if(this.samples.length > 1) {
      now = this.samples[0].time;
      this.fskPairs.forEach((fsk, fskIndex) => {
        fsk.forEach((hz, hzIndex)=> {
          ctx.beginPath();
          const hue = Math.floor(hz/ultimateFrequency * 360);
          if(hzIndex === 0) {
            ctx.strokeStyle = `hsla(${hue}, 100%, 50%, 50%)`;
            ctx.setLineDash([5, 5]);
          } else {
            ctx.strokeStyle = `hsl(${hue}, 100%, 50%)`;
            ctx.setLineDash([]);
          }
          this.samples.forEach(({time, fskPairs}, i) => {
            fsk = fskPairs[fskIndex];
            if(!fsk) return; // configuration changed
            let x = ((now - time) / this.duration) * width;
            const percent = (fsk[hzIndex] / maxAmps);
            let y = (1 - percent) * height;
            if(i === 0) {
              ctx.moveTo(x, y);
            } else {
              ctx.lineTo(x, y);
            }
          });
          ctx.lineWidth = 1;
          ctx.stroke();
        })
      })
    };
    ctx.setLineDash([]);

    // Amplitude Threshold
    ctx.strokeStyle = 'hsla(0, 0%, 100%, 20%)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    let y = height * (1-(this.amplitudeThreshold * 255) / maxAmps);
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();

    // sampling periods
    if(!now) now = performance.now();
    let lastPeriodStart = now - ((now - this.signalStart) % this.samplingPeriod);
    let lastTextX = -1000;
    this.lastCountX = -1000;
    for(let time = lastPeriodStart; time > now - this.duration; time -= this.samplingPeriod) {
      const end = time + this.samplingPeriod;
      let rightX = ((now - time) / this.duration) * width;
      let leftX = ((now - end) / this.duration) * width;
      // Line for when period started
      ctx.beginPath();
      ctx.moveTo(rightX, 0);
      ctx.lineTo(rightX, height);
      ctx.strokeStyle = 'hsla(120, 100%, 100%, 10%)';
      ctx.lineWidth = 1;
      ctx.stroke();

      let samplePeriodWidth = rightX - leftX;
      ctx.fontSize = '24px';

      // Sample Index
      if(time >= this.signalStart && (this.signalEnd < this.signalStart || time < this.signalEnd)) {

        const signalIndex = Math.floor((time - this.signalStart) / this.samplingPeriod);

        const indexInGroup = signalIndex % this.samplesPerGroup;
        if(indexInGroup === 0) {
          // Line for when group started
          ctx.beginPath();
          ctx.moveTo(rightX, 0);
          ctx.lineTo(rightX, height);
          ctx.strokeStyle = 'hsla(180, 100%, 50%, 50%)';
          ctx.lineWidth = 2;
          ctx.stroke();
        }

        let text = indexInGroup.toLocaleString();
        let size = ctx.measureText(text);
        let textX = leftX + (samplePeriodWidth / 2) - (size.width / 2);
        // far enough from prior text?
        if(textX - lastTextX > (size.width * 2)) {
          lastTextX = textX;
          ctx.lineWidth = 2;
          ctx.textBaseline = 'bottom';
          let textY = height - 12;
          ctx.strokeStyle = 'black';
          ctx.strokeText(text, textX, textY);
          ctx.fillStyle = 'white';
          ctx.fillText(text, textX, textY);
        }
      }

      // sample counts
      this.drawSampleCount(ctx, time, end, leftX, samplePeriodWidth);
    }

    this.drawSignalStart(ctx, width, height, now);
    this.drawSignalEnd(ctx, width, height, now);

    if(this.isRunning()) {
      this.animationFrameId = requestAnimationFrame(this.draw);
    }
  }
  drawSampleCount = (ctx, start, end, leftX, samplePeriodWidth) => {
    const count = this.samples.filter(sample => {
      return sample.time >= start && sample.time <  end;
    }).length;

    let text = count.toLocaleString();
    let size = ctx.measureText(text);
    let textX = leftX + (samplePeriodWidth / 2) - (size.width / 2);

    // far enough from prior text?
    if(textX - this.lastCountX > (size.width * 2)) {
      this.lastCountX = textX;
      ctx.lineWidth = 2;
      ctx.textBaseline = 'bottom';
      let textY = 10;
      ctx.strokeStyle = 'black';
      ctx.strokeText(text, textX, textY);
      if(count === 0) {
        ctx.fillStyle = 'red';
      } else if(count < 3) {
        ctx.fillStyle = 'yellow';
      } else {
        ctx.fillStyle = 'white';
      }
      ctx.fillText(text, textX, textY);
    }
  }
  drawSignalStart = (ctx, width, height, now) => {
    if(now - this.signalStart < this.duration) {
      let x = ((now - this.signalStart) / this.duration) * width;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'hsla(60, 100%, 50%, 50%)';
      ctx.stroke();
    }
  };
  drawSignalEnd = (ctx, width, height, now) => {
    if(now - this.signalEnd < this.duration) {
      let x = ((now - this.signalEnd) / this.duration) * width;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'hsla(60, 100%, 50%, 50%)';
      ctx.stroke();
    }
  }
}

export default FrequencyGraphPanel;