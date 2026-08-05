import Fastify from 'fastify';
import dotenv from 'dotenv';
import cors from '@fastify/cors'

import dbPlugin from './plugins/db';

// import authRoutes from './routes/auth';
import patchesRoutes from './routes/patches';
// import sessionsRoutes from './routes/sessions';

dotenv.config();

const server = Fastify({ logger: true });

server.register(cors, {
  origin: (origin, cb) => {
    const allowed = [process.env.CLIENT_ORIGIN];

    if (!origin || origin === 'null' || allowed.includes(origin)) {
      cb(null, true);
    } else {
      cb(new Error('Not allowed'), false);
    }
  },

  allowedHeaders: ['Content-Type', 'Authorization'],
});

server.register(dbPlugin);

// server.register(authRoutes);
server.register(patchesRoutes);
// server.register(sessionsRoutes);

server.get('/api', async function(req, reply) {
  const client = await this.pg.connect();

  console.log(await client.query('SELECT 1'));

  reply.send({ hello: 'world' })
})

const start = async () => {
  try {
    await server.listen({ port: 3000, host: '0.0.0.0' });
    console.log('Server listening on http://localhost:3000');
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start();
