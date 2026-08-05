import fp from 'fastify-plugin';
import fastifyPostgres from '@fastify/postgres';

export default fp(fastify => {
  fastify.register(fastifyPostgres, {
    connectionString: process.env.DATABASE_URL
  })
});
