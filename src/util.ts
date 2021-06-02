// eslint-disable-next-line no-undef
import ReadableStream = NodeJS.ReadableStream
// eslint-disable-next-line no-undef
import WritableStream = NodeJS.WritableStream

export async function pipeAndWaitThenClose(
  read: ReadableStream,
  write: WritableStream,
): Promise<void> {
  read.pipe(write)
  await new Promise(fulfill => write.on('finish', fulfill))
}
