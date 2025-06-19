import { api } from "@/core/api";
import { CommandJson } from "@/core/command-service/command-types";

export const fetchPatches = async (): Promise<{patches: CommandJson[]}> => {
  return await api.get('/patches', { query: { site: 'test-site', version: '1' }});
}

export const sendPatches = (patches: any[], site: string, version: string) => {
  return api.post(`/patches`, { patches, site, version });
}