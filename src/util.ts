// eslint-disable-next-line no-undef
import ReadableStream = NodeJS.ReadableStream

export async function waitForFinish(stream: ReadableStream): Promise<void> {
  await new Promise(fulfill => stream.on('finish', fulfill))
}
