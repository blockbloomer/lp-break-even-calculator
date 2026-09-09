const moneyFormatter = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function amount(value: number, digits = 2): string {
  if (value !== 0 && Math.abs(value) < 10 ** -digits) {
    return value.toLocaleString('en-US', { maximumSignificantDigits: 4 });
  }
  return value.toLocaleString('en-US', { maximumFractionDigits: digits });
}

export function money(value: number): string {
  if (value !== 0 && Math.abs(value) < 0.01) return `$${amount(value, 2)}`;
  return `${value < 0 ? '−' : ''}$${moneyFormatter.format(Math.abs(value))}`;
}

export function price(value: number): string {
  return `$${amount(value, 6)}`;
}

export function durationParts(hours: number): { value: string; unit: string }[] {
  if (hours === 0) return [{ value: '0', unit: '分钟' }];
  if (hours < 1 / 3600) return [{ value: '< 1', unit: '秒' }];
  if (hours < 1 / 60) return [{ value: String(Math.ceil(hours * 3600)), unit: '秒' }];
  if (hours >= 24 * 365) return [{ value: amount(hours / 8760, 1), unit: '年' }];
  const minutes = Math.round(hours * 60);
  if (minutes >= 1440) {
    const days = Math.floor(minutes / 1440);
    const remainingHours = Math.ceil((minutes % 1440) / 60);
    if (remainingHours === 24) return [{ value: String(days + 1), unit: '天' }];
    return [{ value: String(days), unit: '天' }, ...(remainingHours ? [{ value: String(remainingHours), unit: '小时' }] : [])];
  }
  const wholeHours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return [
    ...(wholeHours ? [{ value: String(wholeHours), unit: '小时' }] : []),
    ...(rest ? [{ value: String(rest), unit: '分钟' }] : []),
  ];
}

export function duration(hours: number | null): string {
  return hours === null ? '无法回本' : durationParts(hours).map(part => `${part.value} ${part.unit}`).join(' ');
}
