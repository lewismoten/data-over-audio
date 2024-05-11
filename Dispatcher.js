class Dispatcher {
  constructor(domain, allowedEvents=[]) {
    this.LISTENERS = {};
    this.allowedEvents = allowedEvents;
    this.domain = domain;
  }
  emit = (eventName, ...args) => {
    // console.log(`${this.domain}.${eventName}`, ...args);
    if(!this.LISTENERS[eventName]) return;
    this.LISTENERS[eventName].forEach(callback => callback(...args));
  }
  addListener = (eventName, callback) => {
    if(this.allowedEvents.length !== 0) {
      if(!this.allowedEvents.includes(eventName)) {
        throw new Error(`Event "${eventName}" is not allowed for ${this.domain}.`)
      }
    }
    if(typeof callback !== 'function')
        throw new Error('Must provide a function');

    if(!this.LISTENERS[eventName]) {
      this.LISTENERS[eventName] = [];
    }
    if(this.LISTENERS[eventName].includes(callback)) return;
    this.LISTENERS[eventName].push(callback);
  }
  removeListener = (eventName, callback) => {
    if(!this.LISTENERS[eventName]) return;
    const i = this.LISTENERS[eventName].indexOf(callback);
    if(i === -1) return;
    this.LISTENERS[eventName].splice(i, 1);
  }
  clearEventListeners = eventName => {
    if(!this.LISTENERS[eventName]) return;
    delete this.LISTENERS[eventName];
  }
  clearAllEventListeners = () => {
    Object
      .keys(this.LISTENERS)
      .forEach(
        eventName => this.clearEventListeners(eventName)
      );
  }
}
export default Dispatcher;