// eslint-disable-next-line no-undef
import ReadableStream = NodeJS.ReadableStream
// eslint-disable-next-line no-undef
import WritableStream = NodeJS.WritableStream

export async function pipeAndWait(
  read: ReadableStream,
  write: WritableStream,
): Promise<void> {
  read.pipe(write)
  await new Promise(fulfill => read.on('finish', fulfill))
}
