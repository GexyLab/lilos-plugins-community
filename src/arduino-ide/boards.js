/**
 * The boards of the first version: Arduino Uno, Nano and Mega (package arduino:avr), with what
 * uploading needs for each processor choice (as boards.txt of the package says: protocol, speed,
 * flash page, signature), and the USB ids that tell them apart.
 */
export const BOARDS = [
  {
    id: 'uno', name: 'Arduino Uno', fqbn: 'arduino:avr:uno',
    usb: ['2341:0043', '2341:0001', '2a03:0043', '2341:0243', '2341:006a'],
    cpus: { '': { protocol: 'stk500v1', speed: 115200, page: 128, flash: 32256, signature: [[0x1e, 0x95, 0x0f], [0x1e, 0x95, 0x14], [0x1e, 0x95, 0x16]] } },
  },
  {
    id: 'nano', name: 'Arduino Nano', fqbn: 'arduino:avr:nano', option: 'cpu',
    usb: ['0403:6001'],
    cpus: {
      atmega328: { protocol: 'stk500v1', speed: 115200, page: 128, flash: 30720, signature: [[0x1e, 0x95, 0x0f], [0x1e, 0x95, 0x14], [0x1e, 0x95, 0x16]] },
      atmega328old: { protocol: 'stk500v1', speed: 57600, page: 128, flash: 30720, signature: [[0x1e, 0x95, 0x0f], [0x1e, 0x95, 0x14], [0x1e, 0x95, 0x16]] },
      atmega168: { protocol: 'stk500v1', speed: 19200, page: 128, flash: 14336, signature: [[0x1e, 0x94, 0x06], [0x1e, 0x94, 0x0b]] },
    },
    default: 'atmega328',
  },
  {
    id: 'mega', name: 'Arduino Mega o Mega 2560', fqbn: 'arduino:avr:mega', option: 'cpu',
    usb: ['2341:0010', '2341:0042', '2a03:0010', '2a03:0042', '2341:0210', '2341:0242'],
    cpus: {
      atmega2560: { protocol: 'stk500v2', speed: 115200, page: 256, flash: 253952, signature: [[0x1e, 0x98, 0x01]] },
      atmega1280: { protocol: 'stk500v1', speed: 57600, page: 256, flash: 126976, signature: [[0x1e, 0x97, 0x03]] },
    },
    default: 'atmega2560',
  },
];

/** USB adapters that do not say which board they are on (clones): the user chooses, lilOS remembers. */
export const GENERIC_USB = {
  '1a86:7523': 'CH340', '1a86:5523': 'CH341', '10c4:ea60': 'CP210x', '0403:6001': 'FTDI', '0403:6015': 'FTDI', '067b:2303': 'PL2303',
};

export const usbKey = port => (port?.usbVendorId == null ? null
  : `${port.usbVendorId.toString(16).padStart(4, '0')}:${(port.usbProductId ?? 0).toString(16).padStart(4, '0')}`);

/** The board a port surely is, from its USB ids, or null. (The FTDI chip of the old Nano is also generic.) */
export function boardOfPort(port) {
  const key = usbKey(port);
  return key ? BOARDS.find(b => b.usb.includes(key) && !GENERIC_USB[key]) ?? null : null;
}

/** 'arduino:avr:nano:cpu=atmega328old' → { board, cpu }, or null if not one of ours. */
export function parseFqbn(fqbn) {
  const [pkg, arch, id, opts = ''] = String(fqbn ?? '').split(':');
  const board = BOARDS.find(b => b.fqbn === `${pkg}:${arch}:${id}`);
  if (!board) return null;
  const cpu = board.option ? (/(?:^|,)cpu=([\w]+)/.exec(opts)?.[1] ?? board.default) : '';
  return board.cpus[cpu] ? { board, cpu } : { board, cpu: board.default ?? '' };
}

export const fqbnOf = (board, cpu) => (board.option && cpu ? `${board.fqbn}:${board.option}=${cpu}` : board.fqbn);

/** The upload parameters of an fqbn of ours. */
export function uploadOf(fqbn) {
  const p = parseFqbn(fqbn);
  return p ? p.board.cpus[p.cpu] : null;
}
