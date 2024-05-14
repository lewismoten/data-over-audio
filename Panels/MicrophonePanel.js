import BasePanel from './BasePanel';

const media = {
  audio: {
    mandatory: {
      autoGainControl: false,
      echoCancellation: false,
      noiseSuppression: false,
      suppressLocalAudioPlayback: false,
      voiceIsolation: false
    },
    optional: []
  }
};

class MicrophonePanel extends BasePanel {
  constructor() {
    super('Microphone');

    this.addCheckboxes('receive-via', [
      {text: 'Listen', id: 'listen', eventName: 'listenChange'}
    ]);
    this.addCanvas('canvas', 100, 25);

    this.addEventListener('listenChange', (e) => {
      if(e.checked) {
        this.error = undefined;
        navigator.mediaDevices.getUserMedia(media)
          .then(stream => {
            this.stream = stream;
            this.connectStream();
            this.dispatcher.emit('on', stream);
          })
          .catch(error => {
            this.error = error;
            console.error(error);
            this.setListening(false);
            this.disconnectStream();
            this.stopSampling();
          })
      } else {
        if(this.stream) {
          this.error = undefined;
          this.disconnectStream();
          this.dispatcher.emit('off');
        }
        this.stopSampling();
      }
    })
  };

  setAnalyser = analyser => {
    if(analyser) {
      this.analyser = analyser;
      this.connectStream();
    } else {
      this.disconnectStream();
      this.analyser = analyser;
    }
  }
  setAudioContext = audioContext => {
    if(audioContext) {
      this.audioContext = audioContext;
      this.connectStream();
    } else {
      this.disconnectStream();
      this.audioContext = audioContext;
    }
  }
  connectStream = () => {
    if(this.stream) {
      if(this.audioContext) {
        if(!this.streamNode) {
          this.streamNode = this.audioContext.createMediaStreamSource(this.stream);
        }
        if(this.analyser) {
          this.streamNode.connect(this.analyser);
        }
        if(this.getListening()) {
          this.startSampling();
        }
      }
    }
  }
  disconnectStream = () => {
    if(this.streamNode) {
      if(this.analyser) {
        this.streamNode.disconnect(this.analyser);
        this.streamNode = undefined;
      }
    }
    if(this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = undefined;
    }
    this.stopSampling();
  }

  isSampling = () => !!this.samplingId;
  startSampling = () => {
    if(this.isSampling()) return;
    // nothing to analyse
    if(!this.stream) return;
    // nothing to analyse with
    if(!this.analyser) return;
    this.samplingId = window.requestAnimationFrame(this.drawSpectrumAnalyzer);
  }
  stopSampling = () => {
    if(!this.isSampling()) return;
    window.cancelAnimationFrame(this.samplingId);
    this.samplingId = undefined;
  }

  getListening = () => this.getCheckedById('listen');
  setListening = checked => {
    if(this.getListening() !== checked) {
      this.setCheckedById('listen', checked)
      this.dispatcher.emit('listenChange', {checked});
    }
  };

  getStream = () => this.stream;

  drawSpectrumAnalyzer = () => {
    const canvas = this.getElement('canvas');
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    let frequencyResolution = this.audioContext.sampleRate / this.analyser.fftSize;
    let nyquistFrequency = this.audioContext.sampleRate / 2;
    let buffer = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(buffer);

    ctx.clearRect(0, 0, width, height);
    let barWidth = (1/buffer.length) * width;
    for(let i = 0; i < buffer.length; i++) {
      let x = i * barWidth;
      let y = (1 - (buffer[i] / 255)) * height;
      const hue = Math.floor(((i * frequencyResolution) / nyquistFrequency) * 360)
      ctx.fillStyle = `hsl(${hue}, 100%, 50%)`;
      ctx.fillRect(x, y, barWidth, height-y);
    }

    this.samplingId = window.requestAnimationFrame(this.drawSpectrumAnalyzer);
  }
}


export default MicrophonePanel;