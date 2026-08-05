import fp from 'fastify-plugin';
import fastifyPostgres from '@fastify/postgres';

export type DatabasePluginOptions = {
  connectionString: string;
};

export default fp<DatabasePluginOptions>(async (fastify, options) => {
  await fastify.register(fastifyPostgres, {
    connectionString: options.connectionString,
  })
});
