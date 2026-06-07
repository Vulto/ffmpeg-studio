import type { StreamEvent } from './api'
import type { TerminalLogger } from '../store/terminalStore'

export function handleStreamEvent(
  event: StreamEvent,
  logger: TerminalLogger,
): void {
  if (event.type === 'meta') {
    logger.writeln(`\x1b[90m${event.data}\x1b[0m`)
  } else if (event.type === 'stdout') {
    logger.write(event.data.replace(/\n/g, '\r\n'))
  } else if (event.type === 'stderr') {
    logger.write(`\x1b[33m${event.data.replace(/\n/g, '\r\n')}\x1b[0m`)
  } else if (event.type === 'output') {
    const out = JSON.parse(event.data) as { fileName: string }
    logger.writeln(`\x1b[32m→ output:\x1b[0m ${out.fileName}`)
  } else if (event.type === 'exit') {
    const exit = Number(event.data)
    logger.writeln('')
    logger.writeln(
      exit === 0 ? '\x1b[32mexit 0\x1b[0m' : `\x1b[31mexit ${exit}\x1b[0m`,
    )
  }
}