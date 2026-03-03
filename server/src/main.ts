import express from 'express';
import cors from 'cors';
import { port } from './config.js';
import sessionRouter from './routes/session.js';
import metadataRouter from './routes/metadata.js';
import tilesRouter from './routes/tiles.js';

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/session', sessionRouter);
app.use('/api/metadata', metadataRouter);
app.use('/api/tile', tilesRouter);

app.listen(port, '0.0.0.0', () => {
  console.log(`Server listening on http://0.0.0.0:${port}`);
});
