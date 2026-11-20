export function parseOptions(args, names) {
  const result = Object.create(null);
  for (let index = 0; index < args.length; index += 2) {
    const option = args[index];
    const value = args[index + 1];
    const name = option.startsWith('--') && option.slice(2);
    if (!names.includes(name) || Object.hasOwn(result, name) || !value || value.startsWith('--')) {
      throw new Error(`Tham số không hợp lệ: ${option}.`);
    }
    result[name] = value;
  }
  for (const name of names) {
    if (!Object.hasOwn(result, name)) throw new Error(`Thiếu --${name}.`);
  }
  return result;
}

export function integer(value, name, minimum = Number.MIN_SAFE_INTEGER) {
  const number = Number(value);
  if (!/^[+-]?\d+$/.test(value) || !Number.isSafeInteger(number) || number < minimum) {
    throw new Error(`--${name} phải là số nguyên hợp lệ.`);
  }
  return number;
}
