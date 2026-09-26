import { fileURLToPath } from 'node:url';
import { createApp } from './server.ts';
import { PianoPlayer } from './player.ts';

const PORT = 5178;
const player = new PianoPlayer();
player.ensureReady().catch(() => {}); // status shows the error; next Play retries

const server = createApp(player, fileURLToPath(new URL('../public/panel.html', import.meta.url)));
server.listen(PORT, '127.0.0.1', () => {
  console.log(`Panel: http://127.0.0.1:${PORT}`);
});

process.on('SIGINT', async () => {
  await player.stop();
  await player.close();
  process.exit(0);
});
