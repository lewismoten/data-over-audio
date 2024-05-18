# Data Over Audio
*AKA Air Wobbler*

Transfer data via Web Audio API.

This experiment had a goal to transfer text or a binary file using sound waves. Binary data is modulated using many oscillators using Mult-Frequency Shift-Keying (MFSK). The audio analyzer is used to demodulate the signal back into its original form.

# Setup

Other than using Vite to run the software locally, this is a pure JavaScript application. You can copy all of the files to a web server. Files and folders that may be excluded are:

- .gitignore
- package.json
- packet-lock.jsn
- README.md
- node_modules

# Running

Its going to be noisy. The louder the better.

## One Device

If you don't want noise, you are in luck. As you are running one device, you can send the signal directly to the analyzer in its purest form. Make sure the `Output` is set to Analyser. If you want to experience the audio and the errors often related to demodulating the signal, switch over to Speakers and check the Microphones "Listen" checkbox. The progess bar will show both yellow and red colors. Red indicates the percent of packets that failed while yellow are successful. If packets have failed after the signal stops, the packet numbers will be listed in the `Packet Errors`. You may click the "Request" button to send only those packets. The order does not matter. If a packet is out of range, the sender will continue to send all other valid packets.

Being that you are both the sender and receiver, you have the option to use Automatic Repeat Request. If there are any packet errors after a signal completes, then the process of clicking "Request" will be automated repeatedly until the signal compeletes. Clikcing "Stop" in the `Message` area will not stop the automated process. You'll need to click `Manual Repeat Request` to prevent it from continuing.

Under `Message`, you see an option to `Send First Packet Twice`. I often found that the first packet failed to transfer. Since the first packet containes the data length header, it is fairly important that it comes through so that we can see a progress bar and discard packets that are out of range - even if the crc passes. The failing first packet is really annoying when `Automatic Repeate Request` gets into an endless loop trying to request a single packet. The quick fix was to just send the first packet twice. I suspect the issue is with the first sample period.

## Two Devices

- Need to have the same configuration for
  - `Frequencies`
  - `Available FSK Pairs`
  - `Packetization`
  - `Signal` Sampling Period
  - `Message` Data Type
- Receiver
  - `Microphone` Listen checkbox checked
  - Grant access to use the microphone
  - `Audio Receiver` Online
- Sender
  - `Output` set to Speakers
  - `Message` click `Send` after receiver is online

That's it! Now watch as the interlaced GIF comes across line by line, or text characters appear.

If something didn't go correctly, you'll see a list of packets listed under `Packet Errors`. Tell the sender what those packet numbers are. The sender will enter the packet numbers in the same text box on their browser. After the receiver goes back online, the sender can click `Request` so that only those packets will be sent. Rinse and repeat.

# Three or more devices

It works the same way as two devices, except you only have one "Sender". Everyone else is a receiver.

# Problems

Noise is a problem. It's a big problem. Data is often corrupted. In addition to demodulating the signal, additional safeguards are put into place to work around the noise.

- The data is split into multiple packets
- Error Detection with Cyclic Redundancy Check CRC codes allows failed packets to be discarded
- Hamming Code Error Correction allows the receiver to attempt to repair the packet
- Interleaving fragments the bits sent over each frequency so that error correction isn't affected by sequential FSK sets affected by noise

Another problem is the browser environment itself. Samples can not be collected in any less than 3 milliseconds.

The microphone needs to have all of it's filtering removed in order to get a raw sample of the environment. The code attempts to aquire the microphone without auto gain control, echo cancellation, noise suppression, local audio playback suppression, and voice isolation. If their are additional options, they will need to be turned off as well.

The sample rates between devices may differ. Ideally the receiver will have a 44.1 kHz sample rate. If it is higher, lower FSK/MFSK padding may become problematic if they result in two frequencies that are within the same frquency bin.

The `Speed` panel doesn't take `Send First Packet Twice` into account.

Yes - I misspell words. Analyzer/Analyser among others. Feel free to correct the code.

"The great refactor" was never completed. You'll still see a few panels in the index.html page.

- In `Receiving`, samples per bit does nothing. If you start the frequency graph, you'll see samples per sample period listed at the top.
- The `Selected` panel is left over. There is nothing to select.
- The `Decoded` Panel does nothing. This information is now in `Packet Errors`
- The `Adio Spectrum` is useful to see the sample rate between your device and another.

# Videos

There are many videos of the progress I made during the development of this project.

- [Data Transfer over Web Audio API part 1](https://youtu.be/_6qxB3gKN_E)
- [Data Transfer over Web Audio API part 2](https://youtu.be/yclfNRiMATA)
- [Data Transfer over Web Audio API part 3](https://youtu.be/nKpuwfHEkKQ)
- [Data Transfer over Web Audio API part 4](https://youtu.be/nAwszWxNJVw)
- [Data Transfer over Web Audio API part 5](https://youtu.be/Co2kIxpm1Og)
- [Data Transfer over Web Audio API part 6](https://youtu.be/b6SqyIE9VU4)
- [Data Transfer over Web Audio API part 7](https://youtu.be/eCwH-f2VZKQ)
- [Data Transfer over Web Audio API part 8](https://youtu.be/P5dqs6QjuaM)
- [Data Transfer over Web Audio API part 9](https://youtu.be/KjtzP_WPuLc)
- [Data Transfer over Web Audio API part 10](https://youtu.be/dj4QsRRbhVw)

# Blog

I was rubber ducking my way through the issues as I experimented with this project. You can read the articles here and see how the project progressed:

- [May 1, 2024: Data Over Audio](https://lewismoten3.wordpress.com/2024/05/01/data-over-audio/)
- [May 1, 2024: Isolating Frequencies](https://lewismoten3.wordpress.com/2024/05/01/isolating-frequencies/)
- [May 3, 2024: Multi-Frequency Signaling](https://lewismoten3.wordpress.com/2024/05/03/multi-frequency-signaling/)
- [May 4, 2024: Error Correction](https://lewismoten3.wordpress.com/2024/05/04/error-correction/)
- [May 5, 2024: Channel Error Detection](https://lewismoten3.wordpress.com/2024/05/05/channel-error-detection/)
- [May 6, 2024: Audio Sample Collection](https://lewismoten3.wordpress.com/2024/05/06/audio-sample-collection/)
- [May 7, 2024: Interleaving](https://lewismoten3.wordpress.com/2024/05/07/interleaving/)
- [May 8, 2024: Multi-Packet Transmission](https://lewismoten3.wordpress.com/2024/05/08/multi-packet-transmission/)
- [May 9, 2024: Decoding Multi-Packet Messages](https://lewismoten3.wordpress.com/2024/05/09/decoding-multi-packet-messages/)
- [May 12, 2024: Unicode And Images](https://lewismoten3.wordpress.com/2024/05/12/unicode-and-images/)
- [May 14, 2024: Packet Error Detection](https://lewismoten3.wordpress.com/2024/05/14/packet-error-detection/)
- [May 15, 2024: Packet Recovery](https://lewismoten3.wordpress.com/2024/05/15/packet-recovery/)
- [May 18, 2024: End of Sound](https://lewismoten3.wordpress.com/2024/05/18/end-of-sound/)
