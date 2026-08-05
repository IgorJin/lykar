import { FastifyPluginAsync, FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import { v4 as uuidv4 } from 'uuid';

type GetPatchesQuery = { site: string, version: string };

const patchesRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/api/patches', getPatches(fastify))
  fastify.post('/api/patches', savePatches(fastify))
}

function getPatches(fastify: FastifyInstance) {
  return async function(req: FastifyRequest<{ Querystring: GetPatchesQuery }>, res: FastifyReply) {
    const { site, version } = req.query
    const client = await fastify.pg.connect();

    try {
      const patchesQ = await client.query('SELECT * FROM patches WHERE site = $1 and version = $2', [site, version])

      const patches = patchesQ.rows.map(({ data }) => data).flat()

      res.send({ patches })
    } catch (err) {
      client.release()

      res.status(500).send(err)
    }

  }
}

function savePatches(fastify: FastifyInstance) {
  return async function(req: FastifyRequest<{ Body: { patches: any[], site: string, version: string } }>, res: FastifyReply) {
    const { patches, site, version } = req.body
    const client = await fastify.pg.connect();

    await client.query('INSERT INTO patches (id, site, data, version, created_at) VALUES ($1, $2, $3, $4, NOW())', [uuidv4(), site, JSON.stringify(patches), version])

    client.release()
    res.send({ success: true })
  }
}

export default patchesRoutes