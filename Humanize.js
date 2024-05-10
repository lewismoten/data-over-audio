export function byteSize(count) {
  let unitIndex = 0;
  const units = ['bytes', 'kb', 'mb', 'gb', 'tb', 'pb'];
  while(count > 999) {
    count /= 1024;
    unitIndex++;
    if(unitIndex === units.length - 1) break;
  }
  count = Math.floor(count * 10) * 0.1
  return `${count.toLocaleString()} ${units[unitIndex]}`
}
export function bitsPerSecond(bps) {
  let unitIndex = 0;
  const units = ['baud', 'Kbps', 'Mbps', 'Gbps', 'Tbps', 'Pbps'];
  while(bps > 999) {
    bps /= 1024;
    unitIndex++;
    if(unitIndex === units.length - 1) break;
  }
  bps = Math.floor(bps * 10) * 0.1
  return `${bps.toLocaleString()} ${units[unitIndex]}`
}
export function durationMilliseconds(milliseconds) {
  const lookup = [
    {mod: 1000, singular: 'ms', plural: 'ms'},
    {mod: 60, singular: 's', plural: 's'},
    {mod: 60, singular: 'm', plural: 'm'},
    {mod: 24, singular: 'h', plural: 'h'},
    {mod: 7, singular: 'd', plural: 'd'},
    {mod: 53, singular: 'w', plural: 'w'},
    {mod: 10, singular: 'y', plural: 'y'},
    {mod: 10, singular: 'd', plural: 'd'},
    {mod: 10, singular: 'c', plural: 'c'},
    {mod: 10, singular: 'm', plural: 'm'},
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
    .map(({value, singular, plural}) => value + (value === 1 ? singular : plural))
    // combine
    .join(' ');
}