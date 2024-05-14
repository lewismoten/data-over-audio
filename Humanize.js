export const number = (value) => value.toLocaleString();
export const metricNumber = value => {
  let unitIndex = 0;
  const units = ['', 'k', 'm', 'g', 't', 'p'];

  while(value >= 1000) {
    value /= 1000;
    unitIndex++;
    if(unitIndex === units.length - 1) break;
  }
  value = Math.floor(value * 10) * 0.1
  return `${number(value)} ${units[unitIndex]}`
}
export function byteSize(count) {
  if(count === 0) return 'none';
  if(count === Infinity) return Infinity;
  if(count === -Infinity) return -Infinity;

  let unitIndex = 0;
  const units = ['bytes', 'kb', 'mb', 'gb', 'tb', 'pb'];
  while(count > 999) {
    count /= 1024;
    unitIndex++;
    if(unitIndex === units.length - 1) break;
  }
  count = Math.floor(count * 10) * 0.1
  return `${number(count)} ${units[unitIndex]}`
}
export function hertz(hz) {
  if(hz === 0) return 'none';
  if(hz === Infinity) return Infinity;
  if(hz === -Infinity) return -Infinity;
  return `${metricNumber(hz)}Hz`
}
export function bitsPerSecond(bps) {
  if(bps === 0) return 'none';
  if(bps === Infinity) return Infinity;
  if(bps === -Infinity) return -Infinity;
  let unitIndex = 0;
  const units = ['baud', 'Kbps', 'Mbps', 'Gbps', 'Tbps', 'Pbps'];
  while(bps > 999) {
    bps /= 1024;
    unitIndex++;
    if(unitIndex === units.length - 1) break;
  }
  bps = Math.floor(bps * 10) * 0.1
  return `${number(bps)} ${units[unitIndex]}`
}
export function durationMilliseconds(milliseconds, long = false) {
  if(milliseconds === 0) return 'none';
  if(milliseconds === Infinity) return Infinity;
  if(milliseconds === -Infinity) return -Infinity;
  if(milliseconds !== Math.floor((milliseconds))) {
    // TODO:
    // 1000 ps (picoseconds) in a nanosecond
    // 1000 ns (nanoseconds) in a microsecond
    // 1000 µs (microseconds) in a millisecond
  }
  const lookup = long ? [
    {mod: 1000, singular: 'milliseconds', plural: 'milliseconds'},
    {mod: 60, singular: 'second', plural: 'seconds'},
    {mod: 60, singular: 'minute', plural: 'minutes'},
    {mod: 24, singular: 'hour', plural: 'hours'},
    {mod: 7, singular: 'day', plural: 'days'},
    {mod: 52.1785714, singular: 'week', plural: 'weeks'},
    {mod: 10, singular: 'year', plural: 'years'},
    {mod: 10, singular: 'decade', plural: 'decades'},
    {mod: 10, singular: 'century', plural: 'centuries'},
    {mod: 10, singular: 'millenium', plural: 'millennia'},
  ] : [
    {mod: 1000, singular: 'ms', plural: 'ms'},
    {mod: 60, singular: 's', plural: 's'},
    {mod: 60, singular: 'm', plural: 'm'},
    {mod: 24, singular: 'h', plural: 'h'},
    {mod: 7, singular: 'd', plural: 'd'},
    {mod: 52.1785714, singular: 'w', plural: 'w'},
    {mod: 10, singular: 'y', plural: 'y'},
    {mod: 10, singular: 'dec', plural: 'dec'},
    {mod: 10, singular: 'c', plural: 'c'},
    {mod: 10, singular: 'mi', plural: 'mi'},
  ]
  const units = [];
  let remaining = Math.floor(milliseconds);
  for(let i = 0; i < lookup.length; i++) {
    const {mod, singular, plural} = lookup[i];
    const value = remaining % mod;
    units.push({value, singular, plural});
    remaining -= value;
    if(remaining < mod) break;
    remaining = remaining / mod;
  }

  return units
    // largest units first
    .reverse()
    // top 2 largest values
    .filter((_, i) => i < 2)
    // drop values of zero
    .filter(({value}) => value > 0)
    // humanize unit
    .map(({value, singular, plural}) => number(value) + (value === 1 ? singular : plural))
    // combine
    .join(' ');
}