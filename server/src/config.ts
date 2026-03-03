import { config as dotenvConfig } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenvConfig({ path: resolve(__dirname, '../..', '.env') });

const googleApiKey = process.env.GOOGLE_MAPS_API_KEY;
if (!googleApiKey) {
  console.error('GOOGLE_MAPS_API_KEY is not set in .env');
  process.exit(1);
}

export const port = parseInt(process.env.PORT ?? '3001', 10);
export { googleApiKey };
export const GOOGLE_TILE_BASE = 'https://tile.googleapis.com/v1';
