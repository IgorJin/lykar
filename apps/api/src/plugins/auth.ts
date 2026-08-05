import fp from 'fastify-plugin';

export default fp(async (fastify) => {
  fastify.register(import('fastify-jwt'), {
    secret: process.env.JWT_SECRET as string
  });

  fastify.decorate(
    'authenticate',
    async (request: any, reply: any) => {
      try {
        await request.jwtVerify();
      } catch (err) {
        reply.send(err);
      }
    }
  );
});